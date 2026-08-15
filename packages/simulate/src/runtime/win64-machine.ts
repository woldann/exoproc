import { MemoryAccessFault, Win64AddressSpace } from './address-space.js';
import { PhysicalPagePool } from './physical-memory.js';
import { Win64Heap } from './heap.js';
import {
  Win32CaptureOutput,
  Win32Console,
  Win32NullInput,
  Win32NullOutput,
} from './console.js';
import {
  createDefaultWin32Environment,
  Win32Environment,
} from './environment.js';
import { WIN32_WORKSPACE_PATH, Win32FileSystem } from './file-system.js';
import { Win32ProgramRegistry, type Win32ProgramSpawn } from './programs.js';
import { Scheduler } from './scheduler.js';
import {
  AF_INET,
  INVALID_SOCKET,
  IPPROTO_ICMP,
  parseIPv4Address,
  SOCK_RAW,
  SOCKET_ERROR,
  WSAEAFNOSUPPORT,
  WSAEHOSTUNREACH,
  WSAEINVAL,
  WSAENOTCONN,
  WSAENOTSOCK,
  WSAEPROTONOSUPPORT,
  WSAESOCKTNOSUPPORT,
  WSAEWOULDBLOCK,
  WSANOTINITIALISED,
  Win32LoopbackNetwork,
} from './network.js';
import { CMD_EXIT_REQUEST, installDefaultWin32Programs } from '../bin/index.js';
import {
  DefaultWin32ExportCatalog,
  registerCapstoneHandlers,
} from '../bin/dll/index.js';
import { NodeHostBridge } from './node-host-bridge.js';
import { createInitialRegisters, X64Cpu } from './x64-cpu.js';
import {
  STD_ERROR_HANDLE,
  STD_INPUT_HANDLE,
  STD_OUTPUT_HANDLE,
  type CpuStepResult,
  type MemoryProtection,
  type Win32InputDevice,
  type Win32MainArguments,
  type Win32OutputDevice,
  type Win32StandardHandles,
  type Win64Handle,
  type Win64Import,
  type Win64KernelObject,
  type Win64KernelObjectDefinition,
  type Win64Module,
  type Win64SocketObject,
  type Win64ThreadState,
  type X64Registers,
} from './types.js';
import {
  WIN32_EXPORT_SLOT_SIZE,
  type Win32ExportCatalog,
} from './win32-dlls.js';
import type {
  Win64DeviceRefSnapshot,
  Win64HeapObjectSnapshot,
  Win64InputObjectSnapshot,
  Win64KernelObjectSnapshot,
  Win64MachineSnapshot,
  Win64OutputObjectSnapshot,
  Win64ProcessSnapshot,
  Win64ThreadSnapshot,
} from './vm-snapshot.js';

const DLL_PAGE_SIZE = 0x1000;
const STACK_SIZE = 0x2000;
/** Per-`invoke()` guest-instruction budget: needs to cover real loops in compiled C (a `memmem` scan over a multi-KB haystack is already hundreds of thousands of instructions); still finite so a genuinely wedged guest errors out instead of hanging the host. */
const MAX_FFI_STEPS = 50_000_000;
const GENERIC_READ = 0x80000000;
const GENERIC_WRITE = 0x40000000;
const CREATE_SUSPENDED = 0x00000004;
/** Backing capacity for a lazily-created `GetProcessHeap`/CRT heap, and the
 * fallback `HeapCreate` uses when `dwMaximumSize` is 0 (growable heap). */
const DEFAULT_HEAP_CAPACITY = 0x100000;
const HEAP_ZERO_MEMORY = 0x00000008;
const HEAP_REALLOC_IN_PLACE_ONLY = 0x00000010;

const importKey = (dllName: string, functionName: string) =>
  `${dllName.toLowerCase()}!${functionName}`;

type KernelHandler = (
  process: Win64Process,
  thread: Win64Thread,
  registers: X64Registers,
) => bigint;

export class Win32HostHandleCapability {
  readonly #owner: symbol;

  public constructor(
    owner: symbol,
    public readonly objectId: number,
    public readonly access: number,
    public readonly inheritable = true,
  ) {
    this.#owner = owner;
  }

  public belongsTo(owner: symbol): boolean {
    return this.#owner === owner;
  }
}

export interface Win32ProcessStdio {
  readonly stdin: Win32HostHandleCapability;
  readonly stdout: Win32HostHandleCapability;
  readonly stderr: Win32HostHandleCapability;
}

export interface Win32ConsoleStdio extends Win32ProcessStdio {
  readonly console: Win32Console;
}

export interface Win32CaptureOutputCapability {
  readonly capture: Win32CaptureOutput;
  readonly handle: Win32HostHandleCapability;
}

export interface Win64ProcessProfile {
  image: string;
  path: string;
}

export interface Win64ProcessOptions {
  readonly console?: Win32Console;
  readonly environment?: Win32Environment;
  readonly session?: Win32ProcessSession;
  readonly initializeStandardHandles?: boolean;
  readonly inheritedHandles?: readonly Win64Handle[];
  readonly standardHandles?: Partial<Win32StandardHandles>;
  readonly stdio?: Win32ProcessStdio;
  /**
   * Registers the new `Win64Process` under this exact PID instead of the
   * machine's own auto-incrementing allocator. This is used when a running
   * host process enters the simulation directly, without a separate worker
   * realm, so the simulated and host process identities agree. The value is
   * caller-provided and is not deduplicated against already-used PIDs (a real
   * OS PID has no realistic chance of colliding with this machine's internal
   * counter, which starts at 1400).
   */
  readonly pid?: number;
}

export interface Win32ProcessSession {
  currentDirectory: string;
}

export interface Win64MachineOptions {
  readonly win32Catalog?: Win32ExportCatalog;
  /**
   * When `true`, the machine installs a `NodeHostBridge` and the
   * `node.exe` builtin. The bridge spawns real `node:worker_threads`
   * workers whenever a guest `node.exe` issues its delegation syscall.
   * Default: `true` for the convenience constructor; tests that
   * exercise a single binary in isolation can pass `false` to skip the
   * Worker bootstrap and avoid writing a temp file on every machine
   * creation.
   */
  readonly enableNodeHostBridge?: boolean;
}

export interface Win64SpawnProgramOptions {
  /**
   * Real `CREATE_SUSPENDED` semantics: the process and its main thread exist,
   * the thread sits at its entry point having executed zero instructions, and
   * it never reaches the ready queue until something resumes it (or a debugger
   * single-steps it directly, bypassing the scheduler).
   */
  readonly suspended?: boolean;
  /** Console the new process renders into. Defaults to a fresh private one. */
  readonly console?: Win32Console;
  /** Stdio capabilities. Defaults to a console stdio set over `console`. */
  readonly stdio?: Win32ProcessStdio;
  readonly currentDirectory?: string;
}

/** One address pinned to a fixed byte pattern. See `Win64Machine.freezeAddress`. */
export interface Win64FrozenValue {
  readonly pid: number;
  readonly address: bigint;
  readonly bytes: Uint8Array;
}

export interface InvokeResult {
  value: bigint;
  steps: CpuStepResult[];
}

const PROCESS_PROFILES: readonly Win64ProcessProfile[] = [
  {
    image: 'notepad.exe',
    path: 'C:\\Windows\\System32\\notepad.exe',
  },
  {
    image: 'calc.exe',
    path: 'C:\\Windows\\System32\\calc.exe',
  },
  {
    image: 'sample-worker.exe',
    path: `${WIN32_WORKSPACE_PATH}\\sample-worker.exe`,
  },
  {
    image: 'telemetry-agent.exe',
    path: `${WIN32_WORKSPACE_PATH}\\telemetry-agent.exe`,
  },
];

const qword = (value: bigint) => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt.asUintN(64, value), true);
  return bytes;
};

const encodeWin32String = (value: string, wide: boolean): Uint8Array => {
  if (!wide) return new TextEncoder().encode(`${value}\0`);
  const bytes = new Uint8Array((value.length + 1) * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < value.length; index += 1) {
    view.setUint16(index * 2, value.charCodeAt(index), true);
  }
  return bytes;
};

const protectionFromWin32 = (value: bigint): MemoryProtection => {
  const numeric = Number(value & 0xffn);
  if (numeric === 0x40) return 'rwx';
  if (numeric === 0x20) return 'rx';
  if (numeric === 0x04) return 'rw';
  return 'r';
};

const makeWorkerFunction = (increment: number) =>
  Uint8Array.from([
    0x55, // push rbp
    0x48,
    0x89,
    0xe5, // mov rbp, rsp
    0x48,
    0x83,
    0xec,
    0x20, // sub rsp, 20h
    0x48,
    0x8b,
    0x01, // mov rax, [rcx]
    0x48,
    0x83,
    0xc0,
    increment & 0xff, // add rax, increment
    0x48,
    0x89,
    0x41,
    0x08, // mov [rcx+8], rax
    0xcc, // int3
    0x48,
    0x83,
    0xc4,
    0x20, // add rsp, 20h
    0x5d, // pop rbp
    0xc3, // ret
  ]);

export class Win64Thread {
  public readonly cpl = 3;
  public state: Win64ThreadState = 'stopped';
  public readonly cpu: X64Cpu;
  public lastStep?: CpuStepResult;
  /**
   * Real Windows suspend count (`CREATE_SUSPENDED`, `SuspendThread`,
   * `ResumeThread`). While > 0, `Scheduler.enqueue()` refuses to make this
   * thread runnable -- it can still be single-stepped directly (a debugger
   * driving `thread.step()` itself doesn't go through the scheduler at all).
   */
  public suspendCount = 0;

  constructor(
    public readonly tid: number,
    public readonly name: string,
    public readonly process: Win64Process,
    public readonly entryPoint: bigint,
    public readonly stackMappingId: string,
    registers: X64Registers,
  ) {
    this.cpu = new X64Cpu(
      process.memory,
      registers,
      (syscallId, currentRegisters) =>
        process.machine.dispatchSyscall(
          process,
          this,
          syscallId,
          currentRegisters,
        ),
    );
  }

  public get registers(): X64Registers {
    return this.cpu.registers;
  }

  public snapshotState(): Win64ThreadSnapshot {
    return {
      tid: this.tid,
      name: this.name,
      entryPoint: this.entryPoint,
      stackMappingId: this.stackMappingId,
      state: this.state,
      suspendCount: this.suspendCount,
      registers: { ...this.registers },
      breakpoints: [...this.cpu.breakpoints],
      watchpoints: [...this.cpu.watchpoints.entries()],
      lastStep: this.lastStep
        ? {
            instruction: this.lastStep.instruction,
            reason: this.lastStep.reason,
            changedRegisters: this.lastStep.changedRegisters,
            memoryWrite: this.lastStep.memoryWrite,
            memoryRead: this.lastStep.memoryRead,
            watchpointHit: this.lastStep.watchpointHit,
            error: this.lastStep.error
              ? {
                  name: this.lastStep.error.name,
                  message: this.lastStep.error.message,
                }
              : undefined,
          }
        : undefined,
    };
  }

  /**
   * Reconstructs a `Win64Thread` by re-running the real constructor against
   * `process` (so the private `syscallHandler` closure the constructor
   * builds is freshly bound to the restored process/machine, never
   * deserialized) and overwriting the fresh instance's mutable state with
   * the snapshot's. Does NOT register the thread into `process.threads` --
   * the caller (`Win64Machine.restore`) does that, mirroring how
   * `Win64Process.createThread` is the only other place that happens.
   */
  public static restore(
    process: Win64Process,
    snapshot: Win64ThreadSnapshot,
  ): Win64Thread {
    const thread = new Win64Thread(
      snapshot.tid,
      snapshot.name,
      process,
      snapshot.entryPoint,
      snapshot.stackMappingId,
      { ...snapshot.registers },
    );
    thread.state = snapshot.state;
    thread.suspendCount = snapshot.suspendCount;
    for (const breakpoint of snapshot.breakpoints)
      thread.cpu.breakpoints.add(breakpoint);
    for (const [address, watchpoint] of snapshot.watchpoints) {
      thread.cpu.watchpoints.set(address, watchpoint);
    }
    thread.lastStep = snapshot.lastStep
      ? {
          instruction: snapshot.lastStep.instruction,
          reason: snapshot.lastStep.reason,
          changedRegisters: [...snapshot.lastStep.changedRegisters],
          memoryWrite: snapshot.lastStep.memoryWrite,
          memoryRead: snapshot.lastStep.memoryRead,
          watchpointHit: snapshot.lastStep.watchpointHit,
          error: snapshot.lastStep.error
            ? Object.assign(new Error(snapshot.lastStep.error.message), {
                name: snapshot.lastStep.error.name,
              })
            : undefined,
        }
      : undefined;
    return thread;
  }

  public step(): CpuStepResult {
    if (this.state === 'terminated') {
      throw new Error(`Thread ${this.tid} is terminated`);
    }
    this.state = 'running';
    const result = this.cpu.step();
    this.lastStep = result;
    const stateAfterStep = this.state as Win64ThreadState;
    if (stateAfterStep !== 'terminated') {
      if (stateAfterStep === 'waiting') {
        this.state = 'waiting';
      } else if (result.reason === 'halted') this.state = 'terminated';
      else if (result.reason === 'fault') this.state = 'faulted';
      else this.state = 'stopped';
    }
    return result;
  }
}

export class Win64Process {
  public readonly cpl = 3;
  public readonly memory = new Win64AddressSpace();
  public readonly modules: Win64Module[] = [];
  public readonly threads = new Map<number, Win64Thread>();
  public readonly handles = new Map<number, Win64Handle>();
  public readonly standardHandles: Win32StandardHandles = {
    input: 0,
    output: 0,
    error: 0,
  };
  public readonly imageBase: bigint;
  public readonly heapBase: bigint;
  public arguments: string[] = [];
  public mainArguments?: Win32MainArguments;
  public lastError = 0;
  public lastChildExitCode = 0;
  /**
   * Set once every thread in this process has terminated. Distinct from
   * `lastChildExitCode`, which is this process's bookkeeping about the last
   * *child* it spawned -- this is this process's own exit status, read by
   * `WaitForSingleObject`/`GetExitCodeProcess` callers holding a handle to it.
   */
  public exitCode?: number;
  public winsockStarted = false;
  public winsockLastError = 0;
  /** `GetProcessHeap()`'s heap, created lazily on first call. */
  public defaultHeapObjectId?: number;
  private allocationSequence = 0;
  private invocationSequence = 0;

  constructor(
    public readonly machine: Win64Machine,
    public readonly pid: number,
    public readonly image: string,
    public readonly path: string,
    imageBase: bigint,
    public readonly console: Win32Console,
    public readonly environment: Win32Environment,
    public readonly session: Win32ProcessSession,
  ) {
    this.imageBase = imageBase;
    this.heapBase = 0x000001f400000000n + BigInt(pid) * 0x100000n;
    this.memory.map(
      'image:.text',
      `${image} / .text`,
      imageBase + 0x1000n,
      0x1000,
      'rx',
    );
    this.memory.map(
      'process-heap',
      'NT process heap',
      this.heapBase,
      0x10000,
      'rw',
    );
  }

  public get currentDirectory(): string {
    return this.session.currentDirectory;
  }

  public set currentDirectory(value: string) {
    this.session.currentDirectory = value;
  }

  public getThreads(): Win64Thread[] {
    return [...this.threads.values()];
  }

  public getThread(tid: number): Win64Thread | undefined {
    return this.threads.get(tid);
  }

  public getModule(name: string): Win64Module | undefined {
    const normalized = name.toLowerCase();
    return this.modules.find(
      (module) => module.name.toLowerCase() === normalized,
    );
  }

  public resolveSymbol(
    dllName: string,
    symbolName: string,
  ): bigint | undefined {
    return this.getModule(dllName)?.exports.get(symbolName);
  }

  public allocate(
    size: number,
    protection: MemoryProtection = 'rw',
    requestedBase = 0n,
    label = 'VirtualAlloc region',
  ): bigint {
    const mapping = this.memory.allocate(
      `allocation:${this.allocationSequence++}`,
      label,
      size,
      protection,
      requestedBase,
    );
    return mapping.base;
  }

  /** `VirtualFree(..., MEM_RELEASE)`: unmaps the region *based* at
   * `address` (a mid-region address is not a valid release target, matching
   * real VirtualFree). `false` when no region starts there. */
  public free(address: bigint): boolean {
    const mapping = this.memory
      .getMappings()
      .find((candidate) => candidate.base === address);
    if (!mapping) return false;
    return this.memory.unmap(mapping.id);
  }

  /**
   * Maps a caller-owned JS buffer into this process's address space with
   * **zero copy** -- guest reads/writes at the returned address hit the
   * exact bytes of `bytes`, and JS-side writes through the original view
   * are visible to guest code. This supports FFI pointer conversion, whose
   * semantics are "address of the caller's own buffer", not "address of a
   * private copy".
   */
  public mapExternalBuffer(bytes: Uint8Array, label: string): bigint {
    return this.memory.map(
      `external:${this.allocationSequence++}`,
      label,
      0n,
      Math.max(1, bytes.byteLength),
      'rw',
      undefined,
      { data: bytes },
    ).base;
  }

  public createThread(
    name: string,
    entryPoint: bigint,
    arguments_: bigint | readonly bigint[] = 0n,
    temporary = false,
  ): Win64Thread {
    const tid = this.machine.allocateTid();
    const stackBase =
      0x000000a400000000n +
      BigInt(this.pid) * 0x100000n +
      BigInt(this.threads.size + this.invocationSequence) * 0x20000n;
    const stackId = `${temporary ? 'ffi' : 'thread'}-stack:${tid}`;
    const stack = this.memory.map(
      stackId,
      `${name} / user stack`,
      stackBase,
      STACK_SIZE,
      'rw',
    );
    // Mirrors genuine x64 call semantics: a real `call` decrements a
    // 16-aligned RSP by 8 to push the return address, landing the callee's
    // entry RSP at an (n*16+8) address holding that address at [rsp]. This
    // synthetic entry writes a fake return address (0, so a stray `ret`
    // faults) at the same parity, so guest code's own shadow-space math
    // (e.g. `sub rsp, 0x28` before a nested call) lines up exactly as it
    // would after a genuine call.
    const stackPointer = stack.base + BigInt(stack.size) - 0x108n;
    this.memory.writeU64(stackPointer, 0n);
    const registers = createInitialRegisters(entryPoint, stackPointer);
    const argumentsArray =
      typeof arguments_ === 'bigint' ? [arguments_] : arguments_;
    const argumentRegisters = ['RCX', 'RDX', 'R8', 'R9'] as const;
    argumentRegisters.forEach((register, index) => {
      registers[register] = argumentsArray[index] ?? 0n;
    });
    const thread = new Win64Thread(
      tid,
      name,
      this,
      entryPoint,
      stackId,
      registers,
    );
    if (!temporary) this.threads.set(tid, thread);
    return thread;
  }

  public invoke(address: bigint, args: readonly unknown[]): InvokeResult {
    this.invocationSequence += 1;
    const thread = this.createThread(
      `FFI invocation #${this.invocationSequence}`,
      address,
      0n,
      true,
    );
    const writeBacks: Array<{ view: ArrayBufferView; address: bigint }> = [];
    const marshalled = args.map((arg) => this.marshalArgument(arg, writeBacks));
    const argumentRegisters = ['RCX', 'RDX', 'R8', 'R9'] as const;
    argumentRegisters.forEach((register, index) => {
      thread.registers[register] = marshalled[index] ?? 0n;
    });
    for (let index = 4; index < marshalled.length; index += 1) {
      const stackAddress =
        thread.registers.RSP + 0x28n + BigInt((index - 4) * 8);
      this.memory.writeU64(stackAddress, marshalled[index] ?? 0n);
    }

    const steps: CpuStepResult[] = [];
    try {
      for (let count = 0; count < MAX_FFI_STEPS; count += 1) {
        const result = thread.step();
        steps.push(result);
        if (result.reason === 'fault') {
          throw result.error ?? new Error('FFI execution faulted');
        }
        if (result.reason === 'halted' || thread.state === 'terminated') {
          break;
        }
      }
      if (thread.state !== 'terminated') {
        throw new Error(
          `FFI invocation exceeded ${MAX_FFI_STEPS} instructions`,
        );
      }
      return { value: thread.registers.RAX, steps };
    } finally {
      // By-copy out marshalling: scratch bytes the callee wrote through a
      // buffer argument land back in the caller's own view (see
      // `marshalArgument`).
      for (const { view, address } of writeBacks) {
        const bytes = this.memory.read(address, view.byteLength);
        // eslint-disable-next-line no-console
        if (view.byteLength >= 100) {
          console.log('[WB]', {
            addr: address.toString(16),
            bytes_16_28: Array.from(bytes.slice(16, 28)),
            viewBefore: Array.from(
              new Uint8Array(view.buffer, view.byteOffset, 28),
            ),
          });
        }
        new Uint8Array(view.buffer, view.byteOffset, view.byteLength).set(
          bytes,
        );
      }
      // A blocking syscall (Sleep, WaitForSingleObject, a pipe read) may have
      // parked this thread in the machine's scheduler even though this raw
      // FFI loop -- not the scheduler -- is what's actually driving it.
      // Without this, a stale reference to this thread (whose stack is about
      // to be unmapped below) would sit in the scheduler's wait sets and
      // could be woken by an unrelated later pump.
      this.machine.scheduler.retire(thread);
      this.memory.unmap(thread.stackMappingId);
    }
  }

  public allocateHandle(
    object: Win64KernelObjectDefinition,
    options: {
      readonly access?: number;
      readonly inheritable?: boolean;
    } = {},
  ): number {
    return this.attachObject(
      this.machine.createKernelObject(object),
      options.access ?? 0,
      options.inheritable ?? false,
    );
  }

  public installHostCapability(capability: Win32HostHandleCapability): number {
    this.machine.assertHostCapability(capability);
    return this.attachObject(
      capability.objectId,
      capability.access,
      capability.inheritable,
    );
  }

  public attachObject(
    objectId: number,
    access: number,
    inheritable: boolean,
  ): number {
    const value = this.machine.allocateHandleValue();
    this.handles.set(value, { value, objectId, access, inheritable });
    return value;
  }

  public inheritHandle(handle: Win64Handle): number {
    this.handles.set(handle.value, { ...handle });
    return handle.value;
  }

  public getStandardHandle(selector: number): number {
    if (selector === STD_INPUT_HANDLE) return this.standardHandles.input;
    if (selector === STD_OUTPUT_HANDLE) return this.standardHandles.output;
    if (selector === STD_ERROR_HANDLE) return this.standardHandles.error;
    return 0;
  }

  public setStandardHandle(selector: number, handle: number): boolean {
    if (handle !== 0 && !this.handles.has(handle)) return false;
    if (selector === STD_INPUT_HANDLE) {
      this.standardHandles.input = handle;
      return true;
    }
    if (selector === STD_OUTPUT_HANDLE) {
      this.standardHandles.output = handle;
      return true;
    }
    if (selector === STD_ERROR_HANDLE) {
      this.standardHandles.error = handle;
      return true;
    }
    return false;
  }

  public closeHandle(handle: number): boolean {
    return this.handles.delete(handle);
  }

  public closeAllHandles(): void {
    this.handles.clear();
    this.standardHandles.input = 0;
    this.standardHandles.output = 0;
    this.standardHandles.error = 0;
  }

  /** Memory and threads are deliberately excluded -- `Win64Machine.restore()` applies those separately, once the shared `PhysicalPagePool` and every other process's threads exist (memory restoration needs the pool ready; scheduler restoration needs every process's threads ready). */
  public snapshotState(): Win64ProcessSnapshot {
    return {
      pid: this.pid,
      image: this.image,
      path: this.path,
      imageBase: this.imageBase,
      heapBase: this.heapBase,
      modules: this.modules.map((module) => ({
        ...module,
        exports: new Map(module.exports),
      })),
      arguments: [...this.arguments],
      mainArguments: this.mainArguments,
      lastError: this.lastError,
      lastChildExitCode: this.lastChildExitCode,
      exitCode: this.exitCode,
      winsockStarted: this.winsockStarted,
      winsockLastError: this.winsockLastError,
      defaultHeapObjectId: this.defaultHeapObjectId,
      allocationSequence: this.allocationSequence,
      invocationSequence: this.invocationSequence,
      standardHandles: { ...this.standardHandles },
      handles: [...this.handles.entries()].map(([value, handle]) => [
        value,
        { ...handle },
      ]),
      environment: this.environment.entries(),
      session: { ...this.session },
      console: this.console.snapshotState(),
      threads: this.getThreads().map((thread) => thread.snapshotState()),
      memory: this.memory.snapshotState(),
    };
  }

  /** Restores every plain-data field this snapshot carries except memory/threads (see `snapshotState`'s doc comment for why those are applied separately by the caller). */
  public restoreState(snapshot: Win64ProcessSnapshot): void {
    this.modules.length = 0;
    this.modules.push(
      ...snapshot.modules.map((module) => ({
        ...module,
        exports: new Map(module.exports),
      })),
    );
    this.arguments = [...snapshot.arguments];
    this.mainArguments = snapshot.mainArguments;
    this.lastError = snapshot.lastError;
    this.lastChildExitCode = snapshot.lastChildExitCode;
    this.exitCode = snapshot.exitCode;
    this.winsockStarted = snapshot.winsockStarted;
    this.winsockLastError = snapshot.winsockLastError;
    this.defaultHeapObjectId = snapshot.defaultHeapObjectId;
    this.allocationSequence = snapshot.allocationSequence;
    this.invocationSequence = snapshot.invocationSequence;
    Object.assign(this.standardHandles, snapshot.standardHandles);
    this.handles.clear();
    for (const [value, handle] of snapshot.handles)
      this.handles.set(value, { ...handle });
  }

  private marshalArgument(
    argument: unknown,
    writeBacks?: Array<{ view: ArrayBufferView; address: bigint }>,
  ): bigint {
    if (typeof argument === 'bigint') return argument;
    if (typeof argument === 'number') {
      // A Bun `ptr` is represented as a JS number. Passing Win32's
      // `(HANDLE)-1` through that representation rounds UINT64_MAX to 2^64;
      // recover the intended all-bits-set pseudo-handle before loading RCX.
      if (argument === Number(0xffffffffffffffffn)) {
        return 0xffffffffffffffffn;
      }
      return BigInt(argument);
    }
    if (typeof argument === 'boolean') return argument ? 1n : 0n;
    if (typeof argument === 'string') {
      const bytes = new TextEncoder().encode(`${argument}\0`);
      const address = this.allocate(
        bytes.length,
        'rw',
        0n,
        'FFI string argument',
      );
      this.memory.write(address, bytes);
      return address;
    }
    if (ArrayBuffer.isView(argument)) {
      // By-copy in/out marshalling for any TypedArray/DataView (Buffer,
      // Uint8Array, Int32Array, ...): a real FFI call passes a pointer to
      // the caller's actual buffer, so scratch bytes are copied back into
      // the view after the invocation completes.
      const bytes = new Uint8Array(
        argument.buffer,
        argument.byteOffset,
        argument.byteLength,
      );
      const address = this.allocate(
        Math.max(1, bytes.byteLength),
        'rw',
        0n,
        'FFI byte buffer',
      );
      this.memory.write(address, bytes);
      writeBacks?.push({ view: argument, address });
      return address;
    }
    if (argument && typeof argument === 'object' && 'address' in argument) {
      const address = (argument as { address: unknown }).address;
      if (typeof address === 'bigint') return address;
      if (typeof address === 'number') return BigInt(address);
    }
    if (argument == null) return 0n;
    throw new TypeError(
      `Cannot marshal ${Object.prototype.toString.call(
        argument,
      )} into the Win64 ABI`,
    );
  }
}

export class Win64Machine {
  public readonly bootId = `win64-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  public readonly environment = createDefaultWin32Environment();
  public readonly fileSystem = new Win32FileSystem();
  public readonly network = new Win32LoopbackNetwork();
  public readonly win32Catalog: Win32ExportCatalog;
  public readonly programs: Win32ProgramRegistry;
  public readonly scheduler = new Scheduler();
  public readonly physicalPagePool = new PhysicalPagePool();
  /**
   * Host bridge that lets the simulated `node.exe` builtin delegate
   * the actual JS work to a real `node:worker_threads` worker. `null`
   * when the machine was constructed with `enableNodeHostBridge:
   * false` -- in that case `node.exe` is not installed in system32
   * and trying to launch it through the simulated CommandPrompt
   * produces the usual "not recognized as an internal or external
   * command" error.
   */
  public readonly nodeHostBridge: NodeHostBridge | null = null;
  /**
   * The one shared "monitor" front-ends render by default -- a single
   * `Win32Console` every screen-facing consumer (the docs terminal, the CLI)
   * attaches to via `attachToScreen()`, so they all show the same picture
   * instead of each spinning up its own isolated, invisible-to-each-other
   * console. Most processes still get their own private console through
   * `createConsoleStdio()`/`createProcess()` (e.g. every debugger launch) --
   * this is only for the specific case of "show me what's on screen."
   */
  public readonly screen = new Win32Console();
  private readonly processes = new Map<number, Win64Process>();
  private readonly handlers = new Map<number, KernelHandler>();
  private nextPid = 1400;
  private nextTid = 0x2400;
  private nextHandle = 0x100;
  private nextKernelObjectId = 1;
  private readonly kernelObjects = new Map<number, Win64KernelObject>();
  private readonly capabilityOwner = Symbol('Win64Machine capability owner');
  private readonly events: string[] = [];
  /** Frozen values keyed by `${pid}:${address}` -- see `freezeAddress`. */
  private readonly frozenValues = new Map<string, Win64FrozenValue>();

  constructor(options: Win64MachineOptions = {}) {
    this.win32Catalog = options.win32Catalog ?? DefaultWin32ExportCatalog;
    this.programs = new Win32ProgramRegistry(this.fileSystem);
    const enableNodeBridge = options.enableNodeHostBridge ?? true;
    if (enableNodeBridge) {
      this.nodeHostBridge = new NodeHostBridge(this);
    }
    installDefaultWin32Programs(
      this.programs,
      this.environment.get('USERNAME'),
      this.nodeHostBridge ? { nodeSyscallId: this.nodeHostBridge.id } : {},
    );
    this.registerKernelHandlers();
    registerCapstoneHandlers(this);
  }

  public getProcesses(): Win64Process[] {
    return [...this.processes.values()];
  }

  public getProcess(pid: number): Win64Process | undefined {
    return this.processes.get(pid);
  }

  public createInputCapability(
    device: Win32InputDevice,
    options: {
      readonly name?: string;
      readonly blocking?: boolean;
      readonly inheritable?: boolean;
    } = {},
  ): Win32HostHandleCapability {
    const objectId = this.createKernelObject({
      kind: 'input',
      name: options.name ?? 'host input',
      blocking: options.blocking ?? true,
      device,
    });
    return new Win32HostHandleCapability(
      this.capabilityOwner,
      objectId,
      GENERIC_READ,
      options.inheritable ?? true,
    );
  }

  public createOutputCapability(
    device: Win32OutputDevice,
    options: {
      readonly name?: string;
      readonly inheritable?: boolean;
    } = {},
  ): Win32HostHandleCapability {
    const objectId = this.createKernelObject({
      kind: 'output',
      name: options.name ?? 'host output',
      device,
    });
    return new Win32HostHandleCapability(
      this.capabilityOwner,
      objectId,
      GENERIC_WRITE,
      options.inheritable ?? true,
    );
  }

  /** Stdio capabilities wired to the shared `screen`, not a fresh console. */
  public attachToScreen(): Win32ConsoleStdio {
    return this.createConsoleStdio(this.screen);
  }

  public createConsoleStdio(console = new Win32Console()): Win32ConsoleStdio {
    const stdout = this.createOutputCapability(console, {
      name: 'video output',
    });
    return {
      console,
      stdin: this.createInputCapability(console, {
        name: 'console input',
        blocking: true,
      }),
      stdout,
      stderr: stdout,
    };
  }

  public createCaptureOutput(): Win32CaptureOutputCapability {
    const capture = new Win32CaptureOutput();
    return {
      capture,
      handle: this.createOutputCapability(capture, {
        name: 'capture output',
      }),
    };
  }

  public createNullStdio(): Win32ProcessStdio {
    const stdout = this.createOutputCapability(new Win32NullOutput(), {
      name: 'null output',
    });
    return {
      stdin: this.createInputCapability(new Win32NullInput(), {
        name: 'null input',
        blocking: false,
      }),
      stdout,
      stderr: stdout,
    };
  }

  public createProcess(
    profile: Win64ProcessProfile,
    options: Win64ProcessOptions = {},
  ): Win64Process {
    if (options.stdio) {
      this.assertHostCapability(options.stdio.stdin);
      this.assertHostCapability(options.stdio.stdout);
      this.assertHostCapability(options.stdio.stderr);
    }
    const pid = options.pid ?? this.nextPid++;
    const aslrSlot = BigInt(pid % 32) * 0x200000n;
    const imageBase = 0x00007ff600000000n + aslrSlot;
    const process = new Win64Process(
      this,
      pid,
      profile.image,
      profile.path,
      imageBase,
      options.console ?? new Win32Console(),
      options.environment ?? this.environment.clone(),
      options.session ?? {
        currentDirectory: WIN32_WORKSPACE_PATH,
      },
    );
    for (const handle of options.inheritedHandles ?? []) {
      process.inheritHandle(handle);
    }
    const stdio =
      options.stdio ??
      ((options.initializeStandardHandles ?? true)
        ? this.createNullStdio()
        : undefined);
    if (stdio) {
      const installed = new Map<string, number>();
      const install = (capability: Win32HostHandleCapability) => {
        const key = `${capability.objectId}:${capability.access}:${
          capability.inheritable ? 1 : 0
        }`;
        const existing = installed.get(key);
        if (existing !== undefined) return existing;
        const value = process.installHostCapability(capability);
        installed.set(key, value);
        return value;
      };
      process.standardHandles.input = install(stdio.stdin);
      process.standardHandles.output = install(stdio.stdout);
      process.standardHandles.error = install(stdio.stderr);
    }
    Object.assign(process.standardHandles, options.standardHandles);
    this.mapKernelGateway(process);
    this.processes.set(pid, process);
    this.events.push(`NtCreateUserProcess ${profile.image} (PID ${pid})`);
    return process;
  }

  public createRandomDebugProcess(): Win64Process {
    const profile =
      PROCESS_PROFILES[Math.floor(Math.random() * PROCESS_PROFILES.length)] ??
      PROCESS_PROFILES[0];
    if (!profile) {
      throw new Error('No debug process profiles are configured');
    }
    const process = this.createProcess(profile);
    const textBase = process.imageBase + 0x1000n;
    const increments = [1, 2, 4];
    const names = ['Main thread', 'Worker thread', 'I/O completion thread'];

    for (let index = 0; index < names.length; index += 1) {
      const increment = increments[index];
      const name = names[index];
      if (increment === undefined || name === undefined) break;
      const entry = textBase + BigInt(index * 0x40);
      process.memory.load(entry, makeWorkerFunction(increment));
      const workItem = process.heapBase + BigInt(index * 0x40);
      process.memory.writeU64(workItem, BigInt(3 + index));
      process.memory.writeU64(workItem + 8n, 0n);
      process.createThread(name, entry, workItem);
    }
    return process;
  }

  public allocateTid(): number {
    const tid = this.nextTid;
    this.nextTid += 4;
    return tid;
  }

  public allocateHandleValue(): number {
    const handle = this.nextHandle;
    this.nextHandle += 4;
    return handle;
  }

  public createKernelObject(definition: Win64KernelObjectDefinition): number {
    const id = this.nextKernelObjectId++;
    this.kernelObjects.set(id, { ...definition, id } as Win64KernelObject);
    return id;
  }

  public getKernelObject(objectId: number): Win64KernelObject | undefined {
    return this.kernelObjects.get(objectId);
  }

  public getHandleObject(
    process: Win64Process,
    handleValue: number | bigint,
  ): Win64KernelObject | undefined {
    const handle = process.handles.get(Number(handleValue));
    return handle ? this.getKernelObject(handle.objectId) : undefined;
  }

  /**
   * Whether a `WaitForSingleObject`-style wait on this object should return
   * immediately. Process/thread handles are only signaled once their target
   * has actually terminated; `nodeInvocation` handles (see
   * `runtime/node-host-bridge.ts`) are signaled only after the host worker
   * reports back. Every other kernel-object kind is treated as
   * always-signaled (matching the historical stub behavior for handles that
   * aren't process/thread waits).
   */
  public isObjectSignaled(object: Win64KernelObject): boolean {
    if (object.kind === 'process') {
      return this.getProcess(object.targetPid)?.exitCode !== undefined;
    }
    if (object.kind === 'thread') {
      return (
        this.getProcess(object.targetPid)?.getThread(object.targetTid)
          ?.state === 'terminated'
      );
    }
    if (object.kind === 'nodeInvocation') {
      return object.signaled;
    }
    return true;
  }

  /** Wakes every waiter on every handle referring to this process. */
  public signalProcessExit(pid: number): void {
    for (const [objectId, object] of this.kernelObjects) {
      if (object.kind === 'process' && object.targetPid === pid) {
        this.scheduler.signalObject(objectId);
      }
    }
  }

  /** Wakes every waiter on every handle referring to this specific thread. */
  public signalThreadExit(pid: number, tid: number): void {
    for (const [objectId, object] of this.kernelObjects) {
      if (
        object.kind === 'thread' &&
        object.targetPid === pid &&
        object.targetTid === tid
      ) {
        this.scheduler.signalObject(objectId);
      }
    }
  }

  /**
   * Called by the scheduler right after any thread stops running. Finalizes
   * process-level exit bookkeeping the first time every thread in a process
   * has terminated -- whether that happened via a natural `ret`-to-zero halt
   * or an explicit `ExitProcess` call (which finalizes eagerly itself and
   * leaves `process.exitCode` already set, so this becomes a no-op here).
   */
  private finalizeThreadSettlement(thread: Win64Thread): void {
    if (thread.state !== 'terminated') return;
    this.signalThreadExit(thread.process.pid, thread.tid);
    const process = thread.process;
    if (process.exitCode !== undefined) return;
    const stillRunning = [...process.threads.values()].some(
      (candidate) => candidate.state !== 'terminated',
    );
    if (stillRunning) return;
    process.exitCode = Number(thread.registers.RAX & 0xffffffffn);
    this.signalProcessExit(process.pid);
    // A sibling pipe reader may be waiting on this process's last writer
    // handle going away; re-check those before dropping the handle table.
    for (const handle of process.handles.values()) {
      this.scheduler.signalObject(handle.objectId);
    }
    process.closeAllHandles();
  }

  /**
   * The exit bookkeeping shared by `ExitProcess` and host-side
   * `terminateProcess`/`kernel32!TerminateProcess`: every thread dies at once,
   * the process gets its exit status, and everything waiting on this process
   * (or on one of its threads, or on an object it holds the last handle to)
   * is woken before the handle table is dropped.
   */
  private finalizeProcessExit(process: Win64Process, exitCode: number): void {
    for (const candidate of process.threads.values()) {
      candidate.state = 'terminated';
      this.scheduler.retire(candidate);
      this.signalThreadExit(process.pid, candidate.tid);
    }
    process.exitCode = exitCode >>> 0;
    this.signalProcessExit(process.pid);
    for (const handle of process.handles.values()) {
      this.scheduler.signalObject(handle.objectId);
    }
    process.closeAllHandles();
  }

  /**
   * Backs `HeapCreate`, the lazily-created default process heap
   * (`GetProcessHeap`), and msvcrt's own lazily-created CRT heap. Every
   * `HeapAlloc` gets its own dedicated exact-size mapping (see
   * `Win64Heap`'s page-per-allocation mode) so each returned pointer is a
   * mapping base -- the precondition for `bun:ffi`'s `toArrayBuffer`
   * handing back a genuine writable live view of the allocation.
   */
  private createHeap(process: Win64Process, capacity: number): number {
    const regionMappingId = `heap:${this.nextKernelObjectId}`;
    const heap = this.buildHeap(process, capacity, regionMappingId);
    const id = this.createKernelObject({ kind: 'heap', heap });
    this.heapOwners.set(id, process.pid);
    return id;
  }

  /**
   * Owning PID for every heap kernel object, tracked directly at creation
   * time rather than inferred afterward -- inference is unreliable: a heap
   * made via `HeapCreate` (not `GetProcessHeap`) is never a process's
   * `defaultHeapObjectId`, and a heap with zero allocations so far (e.g.
   * msvcrt's own CRT heap, created but not yet allocated from during
   * `DllMain`) has no page-per-allocation mappings to reverse-engineer an
   * owner from either. Used by `snapshotKernelObject`/`restoreKernelObject`.
   */
  private readonly heapOwners = new Map<number, number>();

  /**
   * The closure-construction half of `createHeap`, split out so
   * `restoreKernelObject` (see `Win64Machine.restore`) can rebuild a
   * `Win64Heap`'s `pageAllocator`/`pageDeallocator` closures freshly bound
   * to a *restored* process -- those closures capture `process.memory` by
   * reference and can never be serialized (see `snapshot()`'s doc comment).
   * Takes `regionMappingId` as a parameter (rather than deriving it from
   * `nextKernelObjectId` internally) precisely so a restore can pass back
   * the snapshot's original id instead of minting a new one.
   */
  private buildHeap(
    process: Win64Process,
    capacity: number,
    regionMappingId: string,
  ): Win64Heap {
    return new Win64Heap(
      0n,
      capacity,
      regionMappingId,
      (size, mappingId) =>
        process.memory.map(
          mappingId,
          'Heap allocation',
          0n,
          size,
          'rw',
          undefined,
          {
            exactSize: true,
          },
        ).base,
      (mappingId) => {
        process.memory.unmap(mappingId);
      },
    );
  }

  /** Resolves a heap kernel object id (used directly as the guest-visible
   * `HANDLE`, since real heap handles are opaque, not `HANDLE`-table
   * entries) back to its `Win64Heap`, or `undefined` if it isn't one. */
  private resolveHeap(handleValue: bigint): Win64Heap | undefined {
    const object = this.getKernelObject(Number(handleValue));
    return object?.kind === 'heap' ? object.heap : undefined;
  }

  /**
   * Drains every runnable/timer-pending thread across every process. Called
   * after enqueuing new work (e.g. a freshly spawned `CreateProcessA` child)
   * so it actually runs -- the caller stays synchronous throughout, since
   * this pumps to completion before returning rather than yielding to JS.
   *
   * Frozen values are re-applied at every thread settlement point (see
   * `applyFrozenValues`).
   */
  public pumpScheduler(
    onStep?: (thread: Win64Thread, result: CpuStepResult) => void,
  ): void {
    this.scheduler.pumpToQuiescence((thread) => {
      this.applyFrozenValues();
      this.finalizeThreadSettlement(thread);
    }, onStep);
  }

  /**
   * Pins `address` in `pid` to `bytes`, Cheat Engine's "freeze" checkbox.
   *
   * `bytes` is stored as-is (copy it in, it is not re-read from the caller),
   * so the freeze survives whatever the guest writes over it afterwards.
   */
  public freezeAddress(pid: number, address: bigint, bytes: Uint8Array): void {
    if (bytes.length === 0) {
      throw new RangeError('A frozen value needs at least one byte');
    }
    this.frozenValues.set(this.frozenKey(pid, address), {
      pid,
      address,
      bytes: bytes.slice(),
    });
  }

  public unfreezeAddress(pid: number, address: bigint): boolean {
    return this.frozenValues.delete(this.frozenKey(pid, address));
  }

  public isAddressFrozen(pid: number, address: bigint): boolean {
    return this.frozenValues.has(this.frozenKey(pid, address));
  }

  public getFrozenAddresses(): readonly Win64FrozenValue[] {
    return [...this.frozenValues.values()];
  }

  /**
   * Re-writes every frozen value into its target process's memory and returns
   * how many writes actually landed.
   *
   * Called from `pumpScheduler` at each thread settlement point -- the only
   * boundary in this cooperative run-to-block model where no guest thread is
   * mid-instruction, which is the deterministic equivalent of a real freeze
   * thread's timer tick. Public so a host that is *not* pumping (a UI's own
   * animation frame, a debugger single-stepping a thread directly) can keep
   * the freeze alive on its own cadence.
   *
   * An entry whose process is gone is dropped; an entry whose memory is no
   * longer writable is kept but skipped for this tick, exactly like a real
   * freeze thread whose `WriteProcessMemory` failed.
   */
  public applyFrozenValues(): number {
    let applied = 0;
    for (const [key, frozen] of this.frozenValues) {
      const process = this.processes.get(frozen.pid);
      if (!process) {
        this.frozenValues.delete(key);
        continue;
      }
      try {
        process.memory.write(frozen.address, frozen.bytes);
        applied += 1;
      } catch (error) {
        if (!(error instanceof MemoryAccessFault)) throw error;
      }
    }
    return applied;
  }

  private frozenKey(pid: number, address: bigint): string {
    return `${pid}:${address.toString(16)}`;
  }

  /**
   * Host-side `TerminateProcess`: kills every thread in `pid` and finalizes
   * the same exit bookkeeping `ExitProcess` does, without needing a guest
   * thread to call anything. Returns false if the pid is unknown or the
   * process has already exited.
   */
  public terminateProcess(pid: number, exitCode = 0): boolean {
    const process = this.processes.get(pid);
    if (!process || process.exitCode !== undefined) return false;
    this.finalizeProcessExit(process, exitCode);
    this.events.push(`NtTerminateProcess PID ${pid} (exit code ${exitCode})`);
    return true;
  }

  /**
   * Loads and starts an installed program straight from the host, through the
   * same `programs.spawn` path `CreateProcessA` uses -- so callers do not
   * have to invent a synthetic launcher process just to have something to call
   * `CreateProcessA` from. The kernel `CreateProcessA` path is untouched.
   *
   * The main thread is enqueued (or, when `suspended`, deliberately left out
   * of the ready queue by its suspend count) but nothing is executed here: the
   * caller drives execution with `pumpScheduler()`, the same as every other
   * runnable thread.
   */
  public spawnProgram(
    path: string,
    args: readonly string[] = [],
    options: Win64SpawnProgramOptions = {},
  ): Win32ProgramSpawn | undefined {
    const consoleStdio = options.stdio
      ? undefined
      : this.createConsoleStdio(options.console);
    const processConsole =
      options.console ?? consoleStdio?.console ?? new Win32Console();
    const spawned = this.programs.spawn(
      {
        machine: this,
        console: processConsole,
        environment: this.environment.clone(),
        session: {
          currentDirectory: options.currentDirectory ?? WIN32_WORKSPACE_PATH,
        },
      },
      path,
      args,
      {
        stdio: options.stdio ?? consoleStdio,
        initializeStandardHandles: true,
      },
    );
    if (!spawned) return undefined;
    // Set the suspend count first: `Scheduler.enqueue` refuses to queue a
    // suspended thread, so this single call covers both cases the same way
    // the real CREATE_SUSPENDED path does.
    if (options.suspended) spawned.thread.suspendCount = 1;
    this.scheduler.enqueue(spawned.thread);
    return spawned;
  }

  public assertHostCapability(capability: Win32HostHandleCapability): void {
    if (
      !capability.belongsTo(this.capabilityOwner) ||
      !this.kernelObjects.has(capability.objectId)
    ) {
      throw new Error('Host handle capability belongs to another machine');
    }
  }

  /**
   * Runtime-registered syscall handlers living outside the fixed Win32 ABI
   * catalog (e.g. a `JSCallback` thunk's trampoline id -- see
   * `runtime/bun-ffi.ts`). Checked before the catalog.
   */
  private readonly dynamicSyscallHandlers = new Map<number, KernelHandler>();
  private nextDynamicSyscallId = 0x40000000;

  /** Registers a synthetic syscall outside the Win32 catalog, returning its
   * id (for embedding into a `createWin32SyscallThunk` trampoline). */
  public registerDynamicSyscall(handler: KernelHandler): number {
    const id = this.nextDynamicSyscallId++;
    this.dynamicSyscallHandlers.set(id, handler);
    return id;
  }

  public unregisterDynamicSyscall(id: number): void {
    this.dynamicSyscallHandlers.delete(id);
  }

  public dispatchSyscall(
    process: Win64Process,
    thread: Win64Thread,
    syscallId: number,
    registers: X64Registers,
  ): bigint {
    const dynamicHandler = this.dynamicSyscallHandlers.get(syscallId);
    if (dynamicHandler) {
      return dynamicHandler(process, thread, registers);
    }
    const definition = this.win32Catalog.syscallById.get(syscallId);
    if (!definition) {
      process.lastError = 127;
      throw new Error(`Unknown JS-kernel syscall 0x${syscallId.toString(16)}`);
    }
    const handler = this.handlers.get(syscallId);
    if (!handler) {
      process.lastError = 120;
      this.events.push(
        `${definition.dllName}!${definition.name} -> ERROR_CALL_NOT_IMPLEMENTED`,
      );
      return 0n;
    }
    this.events.push(
      `${definition.dllName}!${definition.name} / syscall 0x${syscallId.toString(
        16,
      )} from PID ${process.pid} / TID ${thread.tid}`,
    );
    return handler(process, thread, registers);
  }

  public getInternalEvents(): readonly string[] {
    return this.events;
  }

  /**
   * QEMU-style VM state snapshot: every process/thread (registers, CPU
   * state, breakpoints/watchpoints), all memory (including exact
   * copy-on-write physical-page sharing between processes -- two mappings
   * that share a physical page today still share the identical restored
   * `PhysicalPage` object after `Win64Machine.restore()`, not independent
   * copies), every kernel object, the scheduler's queues, and the
   * in-memory filesystem (`fileSystem.snapshotState()` -- every file/
   * directory the user created or edited). This is the *only* place any
   * of that filesystem content is ever persisted: nothing auto-saves to
   * disk on write, so a page reload with no snapshot taken loses every
   * unsaved change, by design (see `apps/docs`'s workspace module for the
   * host-side half of this decision). Bound (host-backed) paths are never
   * captured -- they're live external state, same as `network` below.
   *
   * Deliberately excludes (all "cold boot" state a fresh `new Win64Machine()`
   * already reconstructs deterministically -- see `getSnapshotWarnings()`
   * for what a caller should surface to the user instead):
   * - `network` (stateless), `win32Catalog` (static), `programs`
   *   (deterministically reinstalled by the constructor).
   * - `nodeHostBridge` -- holds live OS-level Worker/child-process handles.
   * - `handlers`/`dynamicSyscallHandlers` -- ~100+ hand-written/runtime
   *   closures (`registerHandler`/`registerDynamicSyscall`), re-established
   *   by a fresh constructor's `registerKernelHandlers()`/
   *   `registerCapstoneHandlers()`, never serializable.
   * - `capabilityOwner` -- a fresh `Symbol()` every construction; any live
   *   `Win32HostHandleCapability` a host holds becomes unauthorizable
   *   against a restored machine (`assertHostCapability` checks identity).
   * - Host-injected `Win32InputDevice`/`Win32OutputDevice` implementations
   *   (via `createInputCapability`/`createOutputCapability`) beyond the
   *   built-in `Win32Console`/`Win32CaptureOutput`/`Win32Null*` set --
   *   opaque to the engine, tagged `'unsupported'` in the snapshot.
   */
  public snapshot(): Win64MachineSnapshot {
    return {
      formatVersion: 1,
      createdAt: Date.now(),
      physicalPages: this.physicalPagePool.snapshotPages(),
      fileSystem: this.fileSystem.snapshotState(),
      processes: this.getProcesses().map((process) => process.snapshotState()),
      kernelObjects: [...this.kernelObjects.values()].map((object) =>
        this.snapshotKernelObject(object),
      ),
      scheduler: this.scheduler.snapshotState(),
      screen: this.screen.snapshotState(),
      nextPid: this.nextPid,
      nextTid: this.nextTid,
      nextHandle: this.nextHandle,
      nextKernelObjectId: this.nextKernelObjectId,
      events: [...this.events],
      frozenValues: [...this.frozenValues.entries()],
    };
  }

  /**
   * Rebuilds a fully independent `Win64Machine` from a `snapshot()` result.
   * Constructs a normal "cold" machine first (so every excluded closure/
   * registry from `snapshot()`'s doc comment is freshly, correctly wired),
   * then splices the "warm" snapshot state into it.
   *
   * The caller (`apps/docs`'s `vm-snapshot-reattach.ts`) is still
   * responsible for everything outside this engine's own boundary:
   * re-registering `apps/docs`'s own `node.dll` syscalls, and deciding
   * whether a restored `exoproc-ide.exe`-equivalent process needs
   * re-booting (it usually doesn't -- see that module). `fileSystem`
   * itself needs no reattaching -- its content came back from the
   * snapshot directly, and any host bind is live external state a caller
   * would need to re-establish itself if it ever uses one (`apps/docs`
   * currently doesn't).
   */
  public static restore(
    snapshot: Win64MachineSnapshot,
    options: Win64MachineOptions = {},
  ): Win64Machine {
    const machine = new Win64Machine(options);
    machine.physicalPagePool.restorePages(snapshot.physicalPages);
    machine.fileSystem.restoreState(snapshot.fileSystem);

    machine.screen.restoreState(snapshot.screen);

    for (const processSnapshot of snapshot.processes) {
      const process = machine.createProcess(
        { image: processSnapshot.image, path: processSnapshot.path },
        {
          pid: processSnapshot.pid,
          console: Win32Console.restore(processSnapshot.console),
          environment: new Win32Environment(
            Object.fromEntries(processSnapshot.environment),
          ),
          session: { ...processSnapshot.session },
          initializeStandardHandles: false,
        },
      );
      process.memory.restoreMappings(
        machine.physicalPagePool,
        processSnapshot.memory,
      );
      for (const threadSnapshot of processSnapshot.threads) {
        process.threads.set(
          threadSnapshot.tid,
          Win64Thread.restore(process, threadSnapshot),
        );
      }
      process.restoreState(processSnapshot);
    }

    for (const objectSnapshot of snapshot.kernelObjects) {
      machine.restoreKernelObject(objectSnapshot);
    }

    machine.scheduler.restoreState(snapshot.scheduler, (pid, tid) =>
      machine.getProcess(pid)?.getThread(tid),
    );

    machine.nextPid = snapshot.nextPid;
    machine.nextTid = snapshot.nextTid;
    machine.nextHandle = snapshot.nextHandle;
    machine.nextKernelObjectId = snapshot.nextKernelObjectId;
    machine.events.length = 0;
    machine.events.push(...snapshot.events);
    machine.frozenValues.clear();
    for (const [key, value] of snapshot.frozenValues)
      machine.frozenValues.set(key, value);

    return machine;
  }

  /**
   * Flags live state a snapshot cannot faithfully resume, for the caller to
   * surface (never to block on -- see the doc comment on why a hard block
   * would be unusable). Two signals: any thread parked on a `nodeInvocation`
   * kernel object (the two-pass `node.dll!enterJSProcess` reentry mechanism
   * `apps/docs`'s `node-syscalls.ts` uses -- covers both a real in-flight
   * `node.exe` delegation AND, in this project's shell architecture,
   * `exoproc-ide.exe`'s own permanently-parked "the IDE itself is running"
   * thread, which parks on the exact same kind of object by construction),
   * and any registered `dynamicSyscallHandlers` (FFI callback trampolines).
   *
   * Because `exoproc-ide.exe`-style processes are permanently parked this
   * way, **every snapshot of a live session will normally carry at least
   * one warning** -- this is expected, not a bug, and a caller's UI should
   * present it as routine information, not an alarming exception.
   */
  public getSnapshotWarnings(): readonly string[] {
    const warnings: string[] = [];
    for (const process of this.getProcesses()) {
      for (const thread of process.getThreads()) {
        if (thread.state !== 'waiting') continue;
        const objectId = this.scheduler.findWaitedObjectId(thread);
        if (objectId === undefined) continue;
        const object = this.kernelObjects.get(objectId);
        if (object?.kind === 'nodeInvocation') {
          warnings.push(
            `Process ${process.pid} (${process.image}) has a background node.exe/FFI operation in flight (thread ${thread.tid}); it will not resume after restore.`,
          );
        }
      }
    }
    if (this.dynamicSyscallHandlers.size > 0) {
      warnings.push(
        `${this.dynamicSyscallHandlers.size} dynamic syscall handler(s) (e.g. FFI callbacks) are registered and will not be restored.`,
      );
    }
    return warnings;
  }

  private snapshotKernelObject(
    object: Win64KernelObject,
  ): Win64KernelObjectSnapshot {
    if (object.kind === 'heap') {
      const ownerPid = this.heapOwners.get(object.id);
      if (ownerPid === undefined) {
        throw new Error(
          `vm-snapshot: heap kernel object ${object.id} has no tracked owner (every createHeap() call must register one).`,
        );
      }
      const snapshot: Win64HeapObjectSnapshot = {
        id: object.id,
        kind: 'heap',
        ownerPid,
        capacity: object.heap.capacity,
        regionMappingId: object.heap.regionMappingId,
        ...object.heap.snapshotState(),
      };
      return snapshot;
    }
    if (object.kind === 'input') {
      const snapshot: Win64InputObjectSnapshot = {
        id: object.id,
        kind: 'input',
        name: object.name,
        blocking: object.blocking,
        device: this.classifyDevice(object.device),
      };
      return snapshot;
    }
    if (object.kind === 'output') {
      const snapshot: Win64OutputObjectSnapshot = {
        id: object.id,
        kind: 'output',
        name: object.name,
        device: this.classifyDevice(object.device),
      };
      return snapshot;
    }
    return object as Win64KernelObjectSnapshot;
  }

  private restoreKernelObject(snapshot: Win64KernelObjectSnapshot): void {
    if (snapshot.kind === 'heap') {
      const owner = this.getProcess(snapshot.ownerPid);
      if (!owner) {
        console.warn(
          `vm-snapshot: heap kernel object ${snapshot.id} references missing owner PID ${snapshot.ownerPid}; skipped.`,
        );
        return;
      }
      const heap = this.buildHeap(
        owner,
        snapshot.capacity,
        snapshot.regionMappingId,
      );
      heap.restoreState(snapshot);
      this.kernelObjects.set(snapshot.id, {
        id: snapshot.id,
        kind: 'heap',
        heap,
      });
      this.heapOwners.set(snapshot.id, snapshot.ownerPid);
      return;
    }
    if (snapshot.kind === 'input') {
      this.kernelObjects.set(snapshot.id, {
        id: snapshot.id,
        kind: 'input',
        name: snapshot.name,
        blocking: snapshot.blocking,
        device: this.resolveDeviceRef(snapshot.device, 'input'),
      });
      return;
    }
    if (snapshot.kind === 'output') {
      this.kernelObjects.set(snapshot.id, {
        id: snapshot.id,
        kind: 'output',
        name: snapshot.name,
        device: this.resolveDeviceRef(snapshot.device, 'output'),
      });
      return;
    }
    this.kernelObjects.set(snapshot.id, snapshot as Win64KernelObject);
  }

  /** `machine.screen` and every process's own `console` are the only `Win32Console` instances that can exist -- matched by object identity, not duck-typing. */
  private classifyDevice(
    device: Win32InputDevice | Win32OutputDevice,
  ): Win64DeviceRefSnapshot {
    if (device instanceof Win32Console) {
      if (device === this.screen) return { kind: 'console', owner: 'screen' };
      for (const process of this.processes.values()) {
        if (process.console === device)
          return { kind: 'console', owner: 'process', pid: process.pid };
      }
      return { kind: 'unsupported', className: 'Win32Console' };
    }
    if (device instanceof Win32CaptureOutput) {
      return { kind: 'capture', bytes: device.snapshot() };
    }
    if (device instanceof Win32NullOutput || device instanceof Win32NullInput) {
      return { kind: 'null' };
    }
    return { kind: 'unsupported', className: device.constructor.name };
  }

  /**
   * Overloaded on `expectedKind` purely so callers get a narrowed return
   * type -- the `'capture'` case only ever appears in valid data when
   * `expectedKind === 'output'` (a `Win64InputObject.device` can never
   * have been a `Win32CaptureOutput` in the first place, since that class
   * doesn't implement `Win32InputDevice`; `classifyDevice` could only have
   * produced that tag from an actual output device).
   */
  private resolveDeviceRef(
    ref: Win64DeviceRefSnapshot,
    expectedKind: 'input',
  ): Win32InputDevice;
  private resolveDeviceRef(
    ref: Win64DeviceRefSnapshot,
    expectedKind: 'output',
  ): Win32OutputDevice;
  private resolveDeviceRef(
    ref: Win64DeviceRefSnapshot,
    expectedKind: 'input' | 'output',
  ): Win32InputDevice | Win32OutputDevice {
    switch (ref.kind) {
      case 'console':
        if (ref.owner === 'screen') return this.screen;
        return this.getProcess(ref.pid)?.console ?? this.screen;
      case 'capture': {
        const capture = new Win32CaptureOutput();
        capture.write(ref.bytes);
        return capture;
      }
      case 'null':
        return expectedKind === 'input'
          ? new Win32NullInput()
          : new Win32NullOutput();
      case 'unsupported':
        console.warn(
          `vm-snapshot: a "${ref.className}" ${expectedKind} device cannot be restored (host-injected devices beyond the engine's built-ins aren't serializable); substituting a null device.`,
        );
        return expectedKind === 'input'
          ? new Win32NullInput()
          : new Win32NullOutput();
    }
  }

  private mapKernelGateway(process: Win64Process): void {
    for (const definition of this.win32Catalog.dlls) {
      const exports = new Map<string, bigint>();
      const symbols = Object.values(definition.functions);
      const imageSize =
        Math.ceil(
          Math.max(1, symbols.length * WIN32_EXPORT_SLOT_SIZE) / DLL_PAGE_SIZE,
        ) * DLL_PAGE_SIZE;
      const compiled = symbols.map((entry) => ({
        entry,
        thunk: this.win32Catalog.compileExportThunk(entry),
      }));
      const dllMainThunk = definition.dllMain
        ? this.win32Catalog.compileExportThunk(definition.dllMain)
        : undefined;
      const iatBase = definition.imageBase + BigInt(imageSize);
      const imports: Win64Import[] = [];
      const importSlots = new Map<string, bigint>();
      const relocationSources =
        definition.dllMain && dllMainThunk
          ? [...compiled, { entry: definition.dllMain, thunk: dllMainThunk }]
          : compiled;
      for (const { entry, thunk } of relocationSources) {
        for (const relocation of thunk.relocations) {
          if (relocation.encoding !== 'iat-relative32') continue;
          const target = relocation.target;
          if (target.kind !== 'export') {
            throw new Error(
              `${entry.dllName}!${entry.name} has a non-export IAT target`,
            );
          }
          const key = importKey(target.dllName, target.functionName);
          if (importSlots.has(key)) continue;
          const targetEntry = this.win32Catalog.resolve(
            target.dllName,
            target.functionName,
          );
          if (!targetEntry) {
            throw new Error(
              `Unresolved DLL import ${target.dllName}!${target.functionName}`,
            );
          }
          const slotAddress = iatBase + BigInt(imports.length * 8);
          const targetAddress = this.win32Catalog.getExportAddress(targetEntry);
          importSlots.set(key, slotAddress);
          imports.push({
            symbol: target.functionName,
            dllName: target.dllName,
            functionName: target.functionName,
            slotAddress,
            targetAddress,
          });
        }
      }
      const page = new Uint8Array(imageSize);
      page.fill(0xcc);
      compiled.forEach(({ entry: symbol, thunk: relocatable }, index) => {
        const offset = index * WIN32_EXPORT_SLOT_SIZE;
        const codeAddress = definition.imageBase + BigInt(offset);
        const thunk = this.win32Catalog.linkExportThunk(
          symbol,
          relocatable,
          codeAddress,
          (dllName, functionName) => {
            const slot = importSlots.get(importKey(dllName, functionName));
            if (slot === undefined) {
              throw new Error(`Unresolved IAT slot ${dllName}!${functionName}`);
            }
            return slot;
          },
        );
        if (thunk.length > WIN32_EXPORT_SLOT_SIZE) {
          throw new Error(
            `${symbol.dllName}!${symbol.name} needs ${thunk.length} bytes but its export slot only has ${WIN32_EXPORT_SLOT_SIZE}`,
          );
        }
        page.set(thunk, offset);
        exports.set(symbol.name, codeAddress);
      });
      process.memory.map(
        `module:${definition.name}`,
        `${definition.name} / generated JS-kernel syscall thunks`,
        definition.imageBase,
        imageSize,
        'rx',
        page,
      );
      if (imports.length > 0) {
        const iat = new Uint8Array(imports.length * 8);
        imports.forEach((entry, index) => {
          new DataView(iat.buffer).setBigUint64(
            index * 8,
            entry.targetAddress,
            true,
          );
        });
        process.memory.map(
          `module:${definition.name}:.idata`,
          `${definition.name} / import address table`,
          iatBase,
          iat.length,
          'r',
          iat,
        );
      }
      process.modules.push({
        name: definition.name,
        base: definition.imageBase,
        size: imageSize,
        exports,
        iatBase,
        iatSize: imports.length * 8,
        imports,
      });

      // Every DLL gets a private CoW-backed "globals" page -- shared/zeroed
      // across processes until a DllMain write privatizes it -- but only
      // DLLs that actually declare a DllMain get one mapped and invoked.
      if (definition.dllMain && dllMainThunk) {
        const dllMainAddress = this.win32Catalog.getDllMainAddress(
          definition.name,
        );
        const globalsAddress = this.win32Catalog.getModuleGlobalsAddress(
          definition.name,
        );
        const linkedDllMain = this.win32Catalog.linkExportThunk(
          definition.dllMain,
          dllMainThunk,
          dllMainAddress,
          (dllName, functionName) => {
            const slot = importSlots.get(importKey(dllName, functionName));
            if (slot === undefined) {
              throw new Error(`Unresolved IAT slot ${dllName}!${functionName}`);
            }
            return slot;
          },
        );
        if (linkedDllMain.length > DLL_PAGE_SIZE) {
          throw new Error(
            `${definition.name} DllMain needs ${linkedDllMain.length} bytes but its code page only has ${DLL_PAGE_SIZE}`,
          );
        }
        const dllMainPage = new Uint8Array(DLL_PAGE_SIZE);
        dllMainPage.set(linkedDllMain, 0);
        process.memory.map(
          `module:${definition.name}:.dllmain`,
          `${definition.name} / DllMain`,
          dllMainAddress,
          DLL_PAGE_SIZE,
          'rx',
          dllMainPage,
        );
        process.memory.mapCoW(
          `module:${definition.name}:.globals`,
          `${definition.name} / globals`,
          globalsAddress,
          DLL_PAGE_SIZE,
          'rw',
          this.physicalPagePool,
        );
        process.invoke(dllMainAddress, [definition.imageBase, 1n, 0n]);
      }
    }
  }

  private resolveTargetProcess(
    caller: Win64Process,
    rawHandle: bigint,
  ): Win64Process | undefined {
    if (rawHandle === -1n || rawHandle === 0xffffffffffffffffn) {
      return caller;
    }
    const object = this.getHandleObject(caller, rawHandle);
    return object?.kind === 'process'
      ? this.processes.get(object.targetPid)
      : undefined;
  }

  private hasOpenPipeWriter(objectId: number): boolean {
    return [...this.processes.values()].some((process) =>
      [...process.handles.values()].some(
        (handle) =>
          handle.objectId === objectId && (handle.access & GENERIC_WRITE) !== 0,
      ),
    );
  }

  private registerKernelHandlers(): void {
    this.registerHandler('kernel32.dll', 'GetLastError', (process) =>
      BigInt(process.lastError),
    );
    // `advapi32!OpenProcessToken` -- process bootstrap code needs *some*
    // token handle back so it can hand it to `CreateProcessAsUser` and
    // related APIs. The simulator never inspects token permissions, so the
    // kernel object is just a tagged bag of bytes -- what matters is that a
    // numeric handle lands in the caller's out-pointer and the call returns
    // TRUE.
    this.registerHandler(
      'advapi32.dll',
      'OpenProcessToken',
      (process, _thread, registers) => {
        const processHandle = registers.RCX;
        const tokenHandlePointer = registers.R8;
        // Real `OpenProcessToken` rejects handles other than -1 or a real
        // process handle. -1 is the well-known "current process"
        // pseudo-handle; anything else needs to map to one of our
        // registered processes.
        const target =
          processHandle === 0xffffffffffffffffn ||
          processHandle === BigInt.asUintN(64, -1n)
            ? process
            : this.getHandleObject(process, processHandle)?.kind === 'process'
              ? this.getProcess(
                  (
                    this.getHandleObject(process, processHandle) as {
                      targetPid: number;
                    }
                  ).targetPid,
                )
              : undefined;
        if (!target) {
          process.lastError = 87;
          return 0n;
        }
        const tokenObjectId = this.createKernelObject({
          kind: 'token',
          owningPid: target.pid,
          accessMask: Number(registers.RDX & 0xffffffffn),
        });
        if (tokenHandlePointer !== 0n) {
          process.memory.writeU64(tokenHandlePointer, BigInt(tokenObjectId));
        }
        process.lastError = 0;
        return 1n;
      },
    );
    // `advapi32!CreateRestrictedToken` -- the dummy bring-up path uses
    // this to de-elevate its own primary token before `CreateProcessAsUser`
    // (so no `SE_ASSIGN_PRIMARYTOKEN_NAME` privilege is required).
    // The simulator doesn't enforce token restrictions, so this is the
    // same kernel-object factory as `OpenProcessToken` -- what matters is
    // that a fresh handle lands in the caller's out-pointer.
    this.registerHandler(
      'advapi32.dll',
      'CreateRestrictedToken',
      (process, _thread, registers) => {
        const newTokenHandlePointer = registers.R9;
        const tokenObjectId = this.createKernelObject({
          kind: 'token',
          owningPid: process.pid,
          accessMask: 0,
        });
        if (newTokenHandlePointer !== 0n) {
          process.memory.writeU64(newTokenHandlePointer, BigInt(tokenObjectId));
        }
        process.lastError = 0;
        return 1n;
      },
    );
    // `advapi32!CreateProcessAsUserA` -- the dummy bring-up path spawns a
    // de-elevated child process. The syscall signature is identical to
    // `kernel32!CreateProcessA` except for a leading `HANDLE hToken`
    // argument; the simulator ignores the token (no real privilege
    // tracking) and just re-binds every arg to the layout
    // `createProcessFromKernel` already understands, then dispatches.
    this.registerHandler(
      'advapi32.dll',
      'CreateProcessAsUserA',
      (process, thread, registers) => {
        const shifted: X64Registers = {
          ...registers,
          RCX: registers.RDX,
          RDX: registers.R8,
          R8: registers.R9,
          R9: process.memory.readU64(registers.RSP + 0x28n),
        };
        const tail = [
          process.memory.readU64(registers.RSP + 0x30n),
          process.memory.readU64(registers.RSP + 0x38n),
          process.memory.readU64(registers.RSP + 0x40n),
          process.memory.readU64(registers.RSP + 0x48n),
          process.memory.readU64(registers.RSP + 0x50n),
          process.memory.readU64(registers.RSP + 0x58n),
        ];
        // Adjust RSP so that createProcessFromKernel's stack-arg reads at
        // RSP+0x28 land on the shifted positions above.
        shifted.RSP = registers.RSP + 0x8n;
        for (let index = 0; index < tail.length; index += 1) {
          process.memory.writeU64(
            shifted.RSP + 0x28n + BigInt(index * 8),
            tail[index]!,
          );
        }
        return this.createProcessFromKernel(process, thread, shifted, false);
      },
    );
    this.registerHandler('kernel32.dll', 'GetCurrentProcessId', (process) =>
      BigInt(process.pid),
    );
    this.registerHandler(
      'kernel32.dll',
      'GetCurrentThreadId',
      (_process, thread) => BigInt(thread.tid),
    );
    this.registerHandler(
      'kernel32.dll',
      'GetCurrentProcess',
      () => 0xffffffffffffffffn,
    );
    this.registerHandler(
      'kernel32.dll',
      'GetCurrentThread',
      () => 0xfffffffffffffffen,
    );
    this.registerHandler(
      'kernel32.dll',
      'VirtualAlloc',
      (process, _thread, registers) =>
        process.allocate(
          Number(registers.RDX || 0x1000n),
          protectionFromWin32(registers.R9 || 0x04n),
          registers.RCX,
        ),
    );
    this.registerHandler(
      'kernel32.dll',
      'VirtualFree',
      (process, _thread, registers) => {
        // MEM_RELEASE (0x8000) releases the whole region based at RCX;
        // MEM_DECOMMIT is accepted as a no-op (this simulator doesn't
        // track decommitted sub-regions).
        const freed =
          (registers.R8 & 0x8000n) !== 0n ? process.free(registers.RCX) : true;
        process.lastError = freed ? 0 : 87; // ERROR_INVALID_PARAMETER
        return freed ? 1n : 0n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'VirtualFreeEx',
      (process, _thread, registers) => {
        const target = this.resolveTargetProcess(process, registers.RCX);
        if (!target) {
          process.lastError = 6;
          return 0n;
        }
        const address = registers.RDX;
        const freeType = Number(registers.R9 & 0xffffffffn);
        const freed = (freeType & 0x8000) !== 0 ? target.free(address) : true;
        process.lastError = freed ? 0 : 87;
        return freed ? 1n : 0n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'VirtualProtectEx',
      (process, _thread, registers) => {
        const target = this.resolveTargetProcess(process, registers.RCX);
        if (!target) {
          process.lastError = 6;
          return 0n;
        }
        const address = registers.RDX;
        const newProtect = protectionFromWin32(registers.R8);
        // 5th arg (lpflOldProtect pointer) lives on the stack: the
        // caller pushed it at RSP+0x28 (after the 4 register-arg shadow
        // space + return address).
        const oldProtectPointer = process.memory.readU64(registers.RSP + 0x28n);
        const mapping = target.memory.findMapping(address);
        if (!mapping) {
          process.lastError = 87;
          return 0n;
        }
        mapping.protection = newProtect;
        if (oldProtectPointer !== 0n) {
          process.memory.writeU32(
            oldProtectPointer,
            Number(PROTECTION_TO_WIN32[mapping.protection]),
          );
        }
        process.lastError = 0;
        return 1n;
      },
    );
    // MEM_PROTECT / MEM_STATE constants — kept local to the VirtualQuery
    // handlers so the rest of `win64-machine.ts` doesn't have to know about
    // the Windows-side encoding of `MemoryProtection`.
    const PROTECTION_TO_WIN32 = {
      r: 0x02n, // PAGE_READONLY
      rw: 0x04n, // PAGE_READWRITE
      rx: 0x20n, // PAGE_EXECUTE_READ
      rwx: 0x40n, // PAGE_EXECUTE_READWRITE
    } as const;
    const MEM_FREE = 0x10000n;
    const MEM_COMMIT = 0x1000n;
    const MEM_PRIVATE = 0x20000n;
    const ALLOCATION_GRANULARITY = 0x10000n;
    const writeMemoryBasicInformation = (
      target: Win64Process,
      lpBuffer: bigint,
      baseAddress: bigint,
      allocationBase: bigint,
      allocationProtect: bigint,
      regionSize: bigint,
      state: bigint,
      protect: bigint,
      type: bigint,
    ): void => {
      // MEMORY_BASIC_INFORMATION layout (48 bytes, 8-byte aligned): ptr,
      // ptr, DWORD, WORD, [6 bytes pad], usize, DWORD, DWORD, DWORD.
      const view = new DataView(new ArrayBuffer(48));
      view.setBigUint64(0, baseAddress, true);
      view.setBigUint64(8, allocationBase, true);
      view.setUint32(16, Number(allocationProtect & 0xffffffffn), true);
      view.setUint16(20, 0, true); // PartitionId
      view.setBigUint64(24, regionSize, true);
      view.setUint32(32, Number(state & 0xffffffffn), true);
      view.setUint32(36, Number(protect & 0xffffffffn), true);
      view.setUint32(40, Number(type & 0xffffffffn), true);
      target.memory.write(lpBuffer, new Uint8Array(view.buffer));
    };
    const queryRegionFor = (
      process: Win64Process,
      memory: Win64AddressSpace,
      lpAddress: bigint,
      lpBuffer: bigint,
    ): bigint => {
      if (lpBuffer === 0n) {
        process.lastError = 87;
        return 0n;
      }
      const mapping = memory.findMapping(lpAddress);
      if (mapping) {
        const protect = PROTECTION_TO_WIN32[mapping.protection];
        writeMemoryBasicInformation(
          process,
          lpBuffer,
          mapping.base,
          mapping.base,
          protect,
          BigInt(mapping.size),
          MEM_COMMIT,
          protect,
          MEM_PRIVATE,
        );
        // eslint-disable-next-line no-console
        console.log('[VQ write]', {
          lpBuffer: lpBuffer.toString(16),
          baseAddress: mapping.base.toString(16),
          regionSize: mapping.size,
          protect,
          bytes: process.memory.read(lpBuffer, 48).slice(0, 24),
        });
        process.lastError = 0;
        return 48n;
      }
      // MEM_FREE region: align down to allocation granularity and report
      // the gap to the next mapping (or one granularity unit if nothing
      // follows). This matches the real OS behavior closely enough that
      // memory scanners find existing allocations without false negatives.
      const aligned = lpAddress - (lpAddress % ALLOCATION_GRANULARITY);
      const nextMapping = memory
        .getMappings()
        .find((candidate) => candidate.base > aligned);
      const regionEnd = nextMapping
        ? nextMapping.base
        : aligned + ALLOCATION_GRANULARITY;
      writeMemoryBasicInformation(
        process,
        lpBuffer,
        aligned,
        aligned,
        0n,
        regionEnd - aligned,
        MEM_FREE,
        0x01n, // PAGE_NOACCESS
        0n,
      );
      process.lastError = 0;
      return 48n;
    };
    this.registerHandler(
      'kernel32.dll',
      'VirtualQuery',
      (process, _thread, registers) => {
        const result = queryRegionFor(
          process,
          process.memory,
          registers.RCX,
          registers.RDX,
        );
        // eslint-disable-next-line no-console
        {
          const lpAddress = registers.RCX;
          const mapping = process.memory.findMapping(lpAddress);
          console.log('[VQ]', {
            pid: process.pid,
            lpAddress: lpAddress.toString(16),
            mapping: mapping
              ? { base: mapping.base.toString(16), size: mapping.size }
              : null,
            result: result.toString(),
          });
        }
        return result;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'VirtualQueryEx',
      (process, _thread, registers) => {
        const target = this.resolveTargetProcess(process, registers.RCX);
        if (!target) {
          process.lastError = 6;
          return 0n;
        }
        return queryRegionFor(
          process,
          target.memory,
          registers.RDX,
          registers.R8,
        );
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'VirtualProtect',
      (process, _thread, registers) => {
        const handle = process.handles.get(Number(registers.RCX));
        const target = this.resolveTargetProcess(
          process,
          registers.RCX === 0xffffffffffffffffn ? 0n : registers.RCX,
        );
        // Fall back to the current process when RCX is a pseudo-handle
        // (-1). The real Win32 API doesn't accept process handles here,
        // but the call shape from a guest uses this idiom for the current
        // process.
        const memory = target?.memory ?? process.memory;
        const newProtect = protectionFromWin32(registers.R8);
        const oldProtectPointer = registers.R9;
        const size = Number(registers.RDX);
        const address = registers.RCX;
        const mapping = memory.findMapping(address);
        if (!mapping) {
          process.lastError = 87;
          return 0n;
        }
        mapping.protection = newProtect;
        // CoW-backed mappings (DLL globals) have a private page table,
        // but protection is tracked on the mapping itself here for
        // completeness -- a single-process simulator has no other
        // consumers to enforce against.
        if (oldProtectPointer !== 0n) {
          process.memory.writeU32(
            oldProtectPointer,
            Number(PROTECTION_TO_WIN32[mapping.protection]),
          );
        }
        process.lastError = 0;
        // Suppress unused-binding warnings for fields the Win32 API
        // reads but this minimal handler doesn't yet use.
        void handle;
        void size;
        return 1n;
      },
    );
    const standardHandleSelector = (value: bigint) =>
      Number(BigInt.asIntN(32, value));
    this.registerHandler(
      'kernel32.dll',
      'GetStdHandle',
      (process, _thread, registers) =>
        BigInt(
          process.getStandardHandle(standardHandleSelector(registers.RCX)),
        ),
    );
    this.registerHandler(
      'kernel32.dll',
      'SetStdHandle',
      (process, _thread, registers) => {
        const changed = process.setStandardHandle(
          standardHandleSelector(registers.RCX),
          Number(registers.RDX),
        );
        process.lastError = changed ? 0 : 6;
        return changed ? 1n : 0n;
      },
    );
    const resolveConsoleHandle = (process: Win64Process, rawHandle: bigint) => {
      const object = this.getHandleObject(process, rawHandle);
      if (
        (object?.kind === 'input' || object?.kind === 'output') &&
        object.device instanceof Win32Console
      ) {
        return {
          console: object.device,
          direction: object.kind,
        } as const;
      }
      return undefined;
    };
    this.registerHandler(
      'kernel32.dll',
      'GetConsoleMode',
      (process, _thread, registers) => {
        const resolved = resolveConsoleHandle(process, registers.RCX);
        if (!resolved || registers.RDX === 0n) {
          process.lastError = 6;
          return 0n;
        }
        process.memory.writeU32(
          registers.RDX,
          resolved.direction === 'input'
            ? resolved.console.inputMode
            : resolved.console.outputMode,
        );
        process.lastError = 0;
        return 1n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'SetConsoleMode',
      (process, _thread, registers) => {
        const resolved = resolveConsoleHandle(process, registers.RCX);
        if (!resolved) {
          process.lastError = 6;
          return 0n;
        }
        const mode = Number(registers.RDX) >>> 0;
        if (resolved.direction === 'input') {
          resolved.console.inputMode = mode;
        } else {
          resolved.console.outputMode = mode;
        }
        process.lastError = 0;
        return 1n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'FillConsoleOutputCharacterA',
      (process, _thread, registers) => {
        const resolved = resolveConsoleHandle(process, registers.RCX);
        if (!resolved || resolved.direction !== 'output') {
          process.lastError = 6;
          return 0n;
        }
        const coordinate = Number(registers.R9) >>> 0;
        const column = coordinate & 0xffff;
        const row = (coordinate >>> 16) & 0xffff;
        if (
          column >= resolved.console.videoOutput.columns ||
          row >= resolved.console.videoOutput.rows
        ) {
          process.lastError = 87;
          return 0n;
        }
        const written = resolved.console.videoOutput.fill(
          Number(registers.RDX) & 0xff,
          Number(registers.R8),
          column,
          row,
        );
        const writtenPointer = process.memory.readU64(registers.RSP + 0x28n);
        if (writtenPointer !== 0n) {
          process.memory.writeU32(writtenPointer, written);
        }
        process.lastError = 0;
        return 1n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'FillConsoleOutputAttribute',
      (process, _thread, registers) => {
        const resolved = resolveConsoleHandle(process, registers.RCX);
        if (!resolved || resolved.direction !== 'output') {
          process.lastError = 6;
          return 0n;
        }
        const coordinate = Number(registers.R9) >>> 0;
        const column = coordinate & 0xffff;
        const row = (coordinate >>> 16) & 0xffff;
        if (
          column >= resolved.console.videoOutput.columns ||
          row >= resolved.console.videoOutput.rows
        ) {
          process.lastError = 87;
          return 0n;
        }
        const written = resolved.console.videoOutput.fillAttribute(
          Number(registers.RDX) & 0xff,
          Number(registers.R8),
          column,
          row,
        );
        const writtenPointer = process.memory.readU64(registers.RSP + 0x28n);
        if (writtenPointer !== 0n) {
          process.memory.writeU32(writtenPointer, written);
        }
        process.lastError = 0;
        return 1n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'SetConsoleTextAttribute',
      (process, _thread, registers) => {
        const resolved = resolveConsoleHandle(process, registers.RCX);
        if (!resolved || resolved.direction !== 'output') {
          process.lastError = 6;
          return 0n;
        }
        resolved.console.videoOutput.setAttribute(Number(registers.RDX));
        process.lastError = 0;
        return 1n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'SetConsoleCursorPosition',
      (process, _thread, registers) => {
        const resolved = resolveConsoleHandle(process, registers.RCX);
        if (!resolved || resolved.direction !== 'output') {
          process.lastError = 6;
          return 0n;
        }
        const coordinate = Number(registers.RDX) >>> 0;
        const column = coordinate & 0xffff;
        const row = (coordinate >>> 16) & 0xffff;
        if (
          column >= resolved.console.videoOutput.columns ||
          row >= resolved.console.videoOutput.rows
        ) {
          process.lastError = 87;
          return 0n;
        }
        resolved.console.videoOutput.setCursor(column, row);
        process.lastError = 0;
        return 1n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'CreatePipe',
      (process, _thread, registers) => {
        if (registers.RCX === 0n || registers.RDX === 0n) {
          process.lastError = 87;
          return 0n;
        }
        const securityAttributes = registers.R8;
        const inheritable =
          securityAttributes !== 0n &&
          process.memory.readU32(securityAttributes + 16n) !== 0;
        const objectId = this.createKernelObject({
          kind: 'pipe',
          bytes: [],
        });
        const readHandle = process.attachObject(
          objectId,
          GENERIC_READ,
          inheritable,
        );
        const writeHandle = process.attachObject(
          objectId,
          GENERIC_WRITE,
          inheritable,
        );
        process.memory.writeU64(registers.RCX, BigInt(readHandle));
        process.memory.writeU64(registers.RDX, BigInt(writeHandle));
        process.lastError = 0;
        return 1n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'SetHandleInformation',
      (process, _thread, registers) => {
        const handle = process.handles.get(Number(registers.RCX));
        if (!handle) {
          process.lastError = 6;
          return 0n;
        }
        const mask = Number(registers.RDX);
        const flags = Number(registers.R8);
        if ((mask & 0x1) !== 0) {
          handle.inheritable = (flags & 0x1) !== 0;
        }
        process.lastError = 0;
        return 1n;
      },
    );
    const createFile =
      (wide: boolean): KernelHandler =>
      (process, _thread, registers) => {
        const requestedPath = wide
          ? process.memory.readWideCString(registers.RCX)
          : process.memory.readCString(registers.RCX);
        const securityAttributes = registers.R9;
        const inheritable =
          securityAttributes !== 0n &&
          process.memory.readU32(securityAttributes + 16n) !== 0;
        const device = requestedPath.toUpperCase();
        if (device === 'CONIN$' || device === 'CONOUT$') {
          // Console devices are host capabilities, not forgeable VFS paths.
          process.lastError = 5;
          return 0xffffffffffffffffn;
        }

        const fileSystem = process.machine.fileSystem;
        const path = fileSystem.normalize(
          requestedPath,
          process.currentDirectory,
        );
        const existing = fileSystem.getEntry(path);
        const creationDisposition = Number(
          process.memory.readU64(registers.RSP + 0x28n),
        );
        const canCreate =
          creationDisposition === 1 ||
          creationDisposition === 2 ||
          creationDisposition === 4;
        const mustExist =
          creationDisposition === 3 || creationDisposition === 5;

        if (existing?.kind === 'directory') {
          process.lastError = 5;
          return 0xffffffffffffffffn;
        }
        if (creationDisposition === 1 && existing) {
          process.lastError = 80;
          return 0xffffffffffffffffn;
        }
        if (!existing && mustExist) {
          process.lastError = 2;
          return 0xffffffffffffffffn;
        }
        if (!existing && !canCreate) {
          process.lastError = 87;
          return 0xffffffffffffffffn;
        }
        if (
          !existing ||
          creationDisposition === 2 ||
          creationDisposition === 5
        ) {
          try {
            fileSystem.writeFile(path, new Uint8Array());
          } catch {
            process.lastError = 3;
            return 0xffffffffffffffffn;
          }
        }
        process.lastError = 0;
        const file = fileSystem.getEntry(path);
        const append = (Number(registers.RDX) & 0x00000004) !== 0;
        return BigInt(
          process.allocateHandle(
            {
              kind: 'file',
              path,
              position: append && file?.kind === 'file' ? file.data.length : 0,
            },
            {
              access: Number(registers.RDX),
              inheritable,
            },
          ),
        );
      };
    this.registerHandler('kernel32.dll', 'CreateFileA', createFile(false));
    this.registerHandler('kernel32.dll', 'CreateFileW', createFile(true));
    this.registerHandler(
      'kernel32.dll',
      'WriteFile',
      (process, _thread, registers) => {
        const handle = process.handles.get(Number(registers.RCX));
        const object = handle
          ? this.getKernelObject(handle.objectId)
          : undefined;
        if (!handle || !object || (handle.access & GENERIC_WRITE) === 0) {
          process.lastError = 6;
          return 0n;
        }
        const requested = Number(registers.R8);
        const bytes = process.memory.read(registers.RDX, requested);
        let written: number;
        if (object.kind === 'output') {
          written = object.device.write(bytes);
        } else if (object.kind === 'pipe') {
          object.bytes.push(...bytes);
          written = bytes.length;
          this.scheduler.signalObject(handle.objectId);
          // If this write is happening on a thread the scheduler is already
          // pumping, this drains inline as a harmless no-op (the enclosing
          // pump's own loop already owns waking siblings). If it's happening
          // on a raw FFI call (`Win64Process.invoke`, not scheduler-driven),
          // this is the only thing that will ever give a waiting reader its
          // turn to actually consume the bytes just written.
          this.pumpScheduler();
        } else if (object.kind === 'file') {
          written = process.machine.fileSystem.writeFileAt(
            object.path,
            object.position,
            bytes,
          );
          object.position += written;
        } else {
          process.lastError = 6;
          return 0n;
        }
        if (registers.R9 !== 0n) {
          process.memory.writeU32(registers.R9, written);
        }
        process.lastError = 0;
        return 1n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'ReadFile',
      (process, thread, registers) => {
        const handle = process.handles.get(Number(registers.RCX));
        const object = handle
          ? this.getKernelObject(handle.objectId)
          : undefined;
        if (!handle || !object || (handle.access & GENERIC_READ) === 0) {
          process.lastError = 6;
          return 0n;
        }
        let bytes: Uint8Array;
        if (object.kind === 'pipe') {
          const length = Math.min(Number(registers.R8), object.bytes.length);
          if (length === 0 && this.hasOpenPipeWriter(handle.objectId)) {
            thread.state = 'waiting';
            this.scheduler.blockOnObject(thread, handle.objectId);
            registers.RIP -= 7n;
            return 0n;
          }
          bytes = Uint8Array.from(object.bytes.splice(0, length));
        } else if (object.kind === 'input') {
          if (!object.device.hasInput && object.blocking) {
            thread.state = 'waiting';
            this.scheduler.blockOnObject(thread, handle.objectId);
            // Retry the complete generated thunk so EAX receives the
            // automatically assigned syscall id again before `syscall`.
            registers.RIP -= 7n;
            return 0n;
          }
          bytes = object.device.read(Number(registers.R8));
        } else if (object.kind === 'file') {
          bytes = process.machine.fileSystem.readFile(
            object.path,
            object.position,
            Number(registers.R8),
          );
          object.position += bytes.length;
        } else {
          process.lastError = 6;
          return 0n;
        }
        if (bytes.length > 0) {
          process.memory.write(registers.RDX, bytes);
        }
        if (object.kind === 'input' && bytes.length < Number(registers.R8)) {
          process.memory.write(registers.RDX + BigInt(bytes.length), [0]);
        }
        if (registers.R9 !== 0n) {
          process.memory.writeU32(registers.R9, bytes.length);
        }
        process.lastError = 0;
        return 1n;
      },
    );
    const getCurrentDirectory =
      (wide: boolean): KernelHandler =>
      (process, _thread, registers) => {
        const bytes = encodeWin32String(process.currentDirectory, wide);
        const characters = process.currentDirectory.length;
        const capacity = Number(registers.RCX);
        if (capacity <= characters) {
          return BigInt(characters + 1);
        }
        process.memory.write(registers.RDX, bytes);
        return BigInt(characters);
      };
    const setCurrentDirectory =
      (wide: boolean): KernelHandler =>
      (process, _thread, registers) => {
        const path = wide
          ? process.memory.readWideCString(registers.RCX)
          : process.memory.readCString(registers.RCX);
        const directory = process.machine.fileSystem.getEntry(
          path,
          process.currentDirectory,
        );
        if (!directory || directory.kind !== 'directory') {
          process.lastError = 3;
          return 0n;
        }
        process.currentDirectory = directory.path;
        process.lastError = 0;
        return 1n;
      };
    this.registerHandler(
      'kernel32.dll',
      'GetCurrentDirectoryA',
      getCurrentDirectory(false),
    );
    this.registerHandler(
      'kernel32.dll',
      'GetCurrentDirectoryW',
      getCurrentDirectory(true),
    );
    this.registerHandler(
      'kernel32.dll',
      'SetCurrentDirectoryA',
      setCurrentDirectory(false),
    );
    this.registerHandler(
      'kernel32.dll',
      'SetCurrentDirectoryW',
      setCurrentDirectory(true),
    );
    const getEnvironmentVariable =
      (wide: boolean): KernelHandler =>
      (process, _thread, registers) => {
        const name = wide
          ? process.memory.readWideCString(registers.RCX)
          : process.memory.readCString(registers.RCX);
        const value = process.environment.get(name);
        if (value === undefined) {
          process.lastError = 203;
          return 0n;
        }
        const capacity = Number(registers.R8);
        if (capacity <= value.length) {
          return BigInt(value.length + 1);
        }
        process.memory.write(registers.RDX, encodeWin32String(value, wide));
        process.lastError = 0;
        return BigInt(value.length);
      };
    const setEnvironmentVariable =
      (wide: boolean): KernelHandler =>
      (process, _thread, registers) => {
        const name = wide
          ? process.memory.readWideCString(registers.RCX)
          : process.memory.readCString(registers.RCX);
        if (!name.includes('=') && name.length > 0) {
          if (registers.RDX === 0n) {
            process.environment.delete(name);
          } else {
            const value = wide
              ? process.memory.readWideCString(registers.RDX)
              : process.memory.readCString(registers.RDX);
            process.environment.set(name, value);
          }
          process.lastError = 0;
          return 1n;
        }
        process.lastError = 87;
        return 0n;
      };
    this.registerHandler(
      'kernel32.dll',
      'GetEnvironmentVariableA',
      getEnvironmentVariable(false),
    );
    this.registerHandler(
      'kernel32.dll',
      'GetEnvironmentVariableW',
      getEnvironmentVariable(true),
    );
    this.registerHandler(
      'kernel32.dll',
      'SetEnvironmentVariableA',
      setEnvironmentVariable(false),
    );
    this.registerHandler(
      'kernel32.dll',
      'SetEnvironmentVariableW',
      setEnvironmentVariable(true),
    );
    const writeFindData = (
      process: Win64Process,
      address: bigint,
      entry: {
        name: string;
        directory: boolean;
        size: number;
      },
    ) => {
      const data = new Uint8Array(320);
      const view = new DataView(data.buffer);
      view.setUint32(0, entry.directory ? 0x10 : 0x80, true);
      view.setUint32(28, Math.floor(entry.size / 0x100000000), true);
      view.setUint32(32, entry.size >>> 0, true);
      data.set(new TextEncoder().encode(`${entry.name}\0`).slice(0, 260), 44);
      process.memory.write(address, data);
    };
    this.registerHandler(
      'kernel32.dll',
      'FindFirstFileA',
      (process, _thread, registers) => {
        const requested = process.memory
          .readCString(registers.RCX)
          .replace(/[\\/]?\*.*$/u, '');
        const directory = process.machine.fileSystem.getEntry(
          requested || '.',
          process.currentDirectory,
        );
        if (!directory || directory.kind !== 'directory') {
          process.lastError = 3;
          return 0xffffffffffffffffn;
        }
        const entries = process.machine.fileSystem
          .readDirectory(directory.path)
          .map((entry) => ({
            name: entry.name,
            directory: entry.kind === 'directory',
            size: entry.kind === 'file' ? entry.data.length : 0,
          }));
        const firstEntry = entries[0];
        if (!firstEntry) {
          process.lastError = 18;
          return 0xffffffffffffffffn;
        }
        writeFindData(process, registers.RDX, firstEntry);
        process.lastError = 0;
        return BigInt(
          process.allocateHandle({
            kind: 'find',
            position: 1,
            findEntries: entries,
          }),
        );
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'FindNextFileA',
      (process, _thread, registers) => {
        const object = this.getHandleObject(process, registers.RCX);
        if (object?.kind !== 'find') {
          process.lastError = 6;
          return 0n;
        }
        const index = object.position;
        const entry = object.findEntries[index];
        if (!entry) {
          process.lastError = 18;
          return 0n;
        }
        writeFindData(process, registers.RDX, entry);
        object.position = index + 1;
        process.lastError = 0;
        return 1n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'FindClose',
      (process, _thread, registers) => {
        const handle = process.handles.get(Number(registers.RCX));
        const object = handle
          ? this.getKernelObject(handle.objectId)
          : undefined;
        if (!handle || object?.kind !== 'find') {
          process.lastError = 6;
          return 0n;
        }
        process.handles.delete(handle.value);
        process.lastError = 0;
        return 1n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'SearchPathA',
      (process, _thread, registers) => {
        const executable = process.memory.readCString(registers.RDX);
        const extension =
          registers.R8 === 0n ? '' : process.memory.readCString(registers.R8);
        const candidate =
          executable.includes('.') || !extension
            ? executable
            : `${executable}${extension}`;
        const resolution = process.environment.resolveExecutable(
          process.machine.fileSystem,
          candidate,
          process.currentDirectory,
        );
        if (!resolution) {
          process.lastError = 2;
          return 0n;
        }
        const capacity = Number(registers.R9);
        const output = process.memory.readU64(registers.RSP + 0x28n);
        const filePart = process.memory.readU64(registers.RSP + 0x30n);
        if (capacity <= resolution.path.length) {
          return BigInt(resolution.path.length + 1);
        }
        process.memory.write(
          output,
          new TextEncoder().encode(`${resolution.path}\0`),
        );
        if (filePart !== 0n) {
          const separator = Math.max(
            resolution.path.lastIndexOf('\\'),
            resolution.path.lastIndexOf('/'),
          );
          process.memory.writeU64(filePart, output + BigInt(separator + 1));
        }
        process.lastError = 0;
        return BigInt(resolution.path.length);
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'CreateProcessA',
      (process, thread, registers) =>
        this.createProcessFromKernel(process, thread, registers, false),
    );
    this.registerHandler(
      'kernel32.dll',
      'CreateProcessW',
      (process, thread, registers) =>
        this.createProcessFromKernel(process, thread, registers, true),
    );
    this.registerHandler(
      'kernel32.dll',
      'WaitForSingleObject',
      (process, thread, registers) => {
        const handle = process.handles.get(Number(registers.RCX));
        const object = handle
          ? this.getKernelObject(handle.objectId)
          : undefined;
        if (!handle || !object) {
          process.lastError = 6;
          return 0xffffffffn;
        }
        if (this.isObjectSignaled(object)) return 0n; // WAIT_OBJECT_0
        thread.state = 'waiting';
        this.scheduler.blockOnObject(thread, handle.objectId);
        registers.RIP -= 7n;
        return 0n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'GetExitCodeProcess',
      (process, _thread, registers) => {
        const handle = process.handles.get(Number(registers.RCX));
        const object = handle
          ? this.getKernelObject(handle.objectId)
          : undefined;
        if (!handle || !object || object.kind !== 'process') {
          process.lastError = 6;
          return 0n;
        }
        const target = this.getProcess(object.targetPid);
        const exitCode = target?.exitCode;
        if (registers.RDX !== 0n) {
          // STILL_ACTIVE (259) while the target hasn't terminated yet, same
          // as real Windows -- the call still succeeds, it just reports that.
          process.memory.writeU32(registers.RDX, exitCode ?? 259);
        }
        if (exitCode !== undefined) {
          // Real cmd.exe reads this into its own %ERRORLEVEL% bookkeeping;
          // this mirrors that without needing the guest to expose a value
          // back to the host through memory.
          process.lastChildExitCode = exitCode;
        }
        return 1n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'Sleep',
      (_process, thread, registers) => {
        const milliseconds = Number(registers.RCX & 0xffffffffn);
        if (milliseconds > 0) {
          thread.state = 'waiting';
          this.scheduler.blockOnTimer(thread, milliseconds);
        }
        return 0n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'ExitProcess',
      (process, _thread, registers) => {
        const exitCode = registers.RCX & 0xffffffffn;
        this.finalizeProcessExit(process, Number(exitCode));
        return exitCode;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'TerminateProcess',
      (process, _thread, registers) => {
        const target = this.resolveTargetProcess(process, registers.RCX);
        if (!target) {
          process.lastError = 6;
          return 0n;
        }
        // Real TerminateProcess succeeds on an already-exited process too, it
        // just has nothing left to do -- so this only reports the handle error.
        this.terminateProcess(target.pid, Number(registers.RDX & 0xffffffffn));
        return 1n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'OpenProcess',
      (process, _thread, registers) => {
        const target = this.processes.get(Number(registers.R8));
        if (!target) {
          process.lastError = 87;
          return 0n;
        }
        return BigInt(
          process.allocateHandle({
            kind: 'process',
            targetPid: target.pid,
          }),
        );
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'VirtualAllocEx',
      (process, _thread, registers) => {
        const target = this.resolveTargetProcess(process, registers.RCX);
        if (!target) {
          process.lastError = 6;
          return 0n;
        }
        return target.allocate(
          Number(registers.R8 || 0x1000n),
          protectionFromWin32(
            process.memory.readU64(registers.RSP + 0x28n) || 0x04n,
          ),
          registers.RDX,
          `VirtualAllocEx from PID ${process.pid}`,
        );
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'WriteProcessMemory',
      (process, _thread, registers) => {
        const target = this.resolveTargetProcess(process, registers.RCX);
        if (!target) {
          process.lastError = 6;
          return 0n;
        }
        const size = Number(registers.R9);
        const bytes = process.memory.read(registers.R8, size);
        // eslint-disable-next-line no-console
        console.log('[WPM before]', {
          caller: process.pid,
          target: target.pid,
          rdx: registers.RDX.toString(16),
          size,
          bytes: Array.from(bytes),
          prev: Array.from(target.memory.read(registers.RDX, 8)),
        });
        target.memory.write(registers.RDX, bytes);
        // eslint-disable-next-line no-console
        console.log('[WPM after]', {
          at: target.memory.read(registers.RDX, size),
        });
        const writtenPointer = process.memory.readU64(registers.RSP + 0x28n);
        if (writtenPointer !== 0n) {
          process.memory.writeU64(writtenPointer, BigInt(size));
        }
        return 1n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'ReadProcessMemory',
      (process, _thread, registers) => {
        const target = this.resolveTargetProcess(process, registers.RCX);
        if (!target) {
          process.lastError = 6;
          return 0n;
        }
        const size = Number(registers.R9);
        const bytes = target.memory.read(registers.RDX, size);
        process.memory.write(registers.R8, bytes);
        // eslint-disable-next-line no-console
        console.log('[RPM]', {
          caller: process.pid,
          target: target.pid,
          rdx: registers.RDX.toString(16),
          size,
          bytes_16_28: Array.from(bytes.slice(16, 28)),
        });
        const bytesReadPointer = process.memory.readU64(registers.RSP + 0x28n);
        if (bytesReadPointer !== 0n) {
          process.memory.writeU64(bytesReadPointer, BigInt(bytes.byteLength));
        }
        process.lastError = 0;
        return 1n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'CreateRemoteThread',
      (process, _thread, registers) => {
        const target = this.resolveTargetProcess(process, registers.RCX);
        if (!target) {
          process.lastError = 6;
          return 0n;
        }
        const parameter = process.memory.readU64(registers.RSP + 0x28n);
        const remoteThread = target.createThread(
          `Remote thread from PID ${process.pid}`,
          registers.R9,
          parameter,
        );
        return BigInt(
          process.allocateHandle({
            kind: 'thread',
            targetPid: target.pid,
            targetTid: remoteThread.tid,
          }),
        );
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'CloseHandle',
      (process, _thread, registers) => {
        const handleValue = Number(registers.RCX);
        const handle = process.handles.get(handleValue);
        const closed = process.closeHandle(handleValue);
        // A pipe reader may be waiting on "no more writers" (see ReadFile's
        // pipe branch); closing any handle to the object re-checks that.
        if (closed && handle) {
          this.scheduler.signalObject(handle.objectId);
          this.pumpScheduler();
        }
        return closed ? 1n : 0n;
      },
    );
    this.registerHandler('kernel32.dll', 'ExitThread', (_process, thread) => {
      thread.state = 'terminated';
      return 0n;
    });
    const resolveThreadHandle = (process: Win64Process, rawHandle: bigint) => {
      const handle = process.handles.get(Number(rawHandle));
      const object = handle ? this.getKernelObject(handle.objectId) : undefined;
      if (!handle || !object || object.kind !== 'thread') return undefined;
      return this.getProcess(object.targetPid)?.getThread(object.targetTid);
    };
    this.registerHandler(
      'kernel32.dll',
      'SuspendThread',
      (process, _thread, registers) => {
        const target = resolveThreadHandle(process, registers.RCX);
        if (!target) {
          process.lastError = 6;
          return 0xffffffffn;
        }
        const previousCount = target.suspendCount;
        target.suspendCount += 1;
        return BigInt(previousCount);
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'ResumeThread',
      (process, _thread, registers) => {
        const target = resolveThreadHandle(process, registers.RCX);
        if (!target) {
          process.lastError = 6;
          return 0xffffffffn;
        }
        const previousCount = target.suspendCount;
        if (target.suspendCount > 0) target.suspendCount -= 1;
        if (target.suspendCount === 0) {
          this.scheduler.enqueue(target);
          this.pumpScheduler();
        }
        return BigInt(previousCount);
      },
    );
    this.registerHandler(
      'psapi.dll',
      'GetModuleInformation',
      (process, _thread, registers) => {
        const target = this.resolveTargetProcess(process, registers.RCX);
        if (!target) {
          process.lastError = 6; // ERROR_INVALID_HANDLE
          return 0n;
        }
        if (registers.R8 === 0n || registers.R9 < 24n) {
          process.lastError = 87; // ERROR_INVALID_PARAMETER
          return 0n;
        }
        const module = target.modules.find(
          (candidate) => candidate.base === registers.RDX,
        );
        if (!module) {
          process.lastError = 126; // ERROR_MOD_NOT_FOUND
          return 0n;
        }

        // MODULEINFO on Win64: lpBaseOfDll@0, SizeOfImage@8,
        // 4 bytes of alignment, EntryPoint@16.
        process.memory.writeU64(registers.R8, module.base);
        process.memory.writeU32(registers.R8 + 8n, module.size);
        process.memory.writeU32(registers.R8 + 12n, 0);
        process.memory.writeU64(registers.R8 + 16n, module.base);
        process.lastError = 0;
        return 1n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'GetModuleHandleA',
      (process, _thread, registers) =>
        this.moduleHandle(process, process.memory.readCString(registers.RCX)),
    );
    this.registerHandler(
      'kernel32.dll',
      'GetModuleHandleW',
      (process, _thread, registers) =>
        this.moduleHandle(
          process,
          process.memory.readWideCString(registers.RCX),
        ),
    );
    this.registerHandler(
      'kernel32.dll',
      'LoadLibraryA',
      (process, _thread, registers) =>
        this.moduleHandle(process, process.memory.readCString(registers.RCX)),
    );
    this.registerHandler(
      'kernel32.dll',
      'LoadLibraryW',
      (process, _thread, registers) =>
        this.moduleHandle(
          process,
          process.memory.readWideCString(registers.RCX),
        ),
    );
    this.registerHandler(
      'kernel32.dll',
      'GetProcAddress',
      (process, _thread, registers) => {
        const module = process.modules.find(
          (candidate) => candidate.base === registers.RCX,
        );
        const name = process.memory.readCString(registers.RDX);
        return module?.exports.get(name) ?? 0n;
      },
    );
    this.registerHandler('kernel32.dll', 'GetProcessHeap', (process) => {
      process.defaultHeapObjectId ??= this.createHeap(
        process,
        DEFAULT_HEAP_CAPACITY,
      );
      return BigInt(process.defaultHeapObjectId);
    });
    this.registerHandler(
      'kernel32.dll',
      'HeapCreate',
      (process, _thread, registers) => {
        const maximumSize = Number(registers.R8);
        const initialSize = Number(registers.RDX);
        const capacity =
          maximumSize > 0
            ? maximumSize
            : Math.max(initialSize, DEFAULT_HEAP_CAPACITY);
        return BigInt(this.createHeap(process, capacity));
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'HeapDestroy',
      (process, _thread, registers) => {
        const objectId = Number(registers.RCX);
        const heap = this.resolveHeap(registers.RCX);
        if (!heap) return 0n;
        heap.destroyAll();
        this.kernelObjects.delete(objectId);
        this.heapOwners.delete(objectId);
        if (process.defaultHeapObjectId === objectId) {
          process.defaultHeapObjectId = undefined;
        }
        return 1n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'HeapAlloc',
      (process, _thread, registers) => {
        const heap = this.resolveHeap(registers.RCX);
        if (!heap) {
          process.lastError = 87; // ERROR_INVALID_PARAMETER
          return 0n;
        }
        const size = Number(registers.R8);
        const offset = heap.alloc(size);
        if (offset === undefined) {
          process.lastError = 8; // ERROR_NOT_ENOUGH_MEMORY
          return 0n;
        }
        const pointer = heap.base + BigInt(offset);
        if ((registers.RDX & BigInt(HEAP_ZERO_MEMORY)) !== 0n) {
          process.memory.write(pointer, new Uint8Array(size));
        }
        process.lastError = 0;
        return pointer;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'HeapFree',
      (process, _thread, registers) => {
        const heap = this.resolveHeap(registers.RCX);
        if (!heap) return 0n;
        if (registers.R8 === 0n) return 1n;
        const freed = heap.free(Number(registers.R8 - heap.base));
        if (!freed) process.lastError = 87; // ERROR_INVALID_PARAMETER
        return freed ? 1n : 0n;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'HeapReAlloc',
      (process, _thread, registers) => {
        const heap = this.resolveHeap(registers.RCX);
        if (!heap) {
          process.lastError = 87; // ERROR_INVALID_PARAMETER
          return 0n;
        }
        const pointer = registers.R8;
        const oldOffset = Number(pointer - heap.base);
        const oldSize = heap.sizeOf(oldOffset);
        if (oldSize === undefined) {
          process.lastError = 87;
          return 0n;
        }
        const newSize = Number(registers.R9);
        // Shrinking (or same-size) always succeeds in place -- the chunk
        // just keeps its existing (larger) bookkeeping size.
        if (newSize <= oldSize) return pointer;

        if (registers.RDX & BigInt(HEAP_REALLOC_IN_PLACE_ONLY)) {
          process.lastError = 8; // ERROR_NOT_ENOUGH_MEMORY
          return 0n;
        }
        const newOffset = heap.alloc(newSize);
        if (newOffset === undefined) {
          process.lastError = 8;
          return 0n;
        }
        const newPointer = heap.base + BigInt(newOffset);
        process.memory.write(newPointer, process.memory.read(pointer, oldSize));
        if ((registers.RDX & BigInt(HEAP_ZERO_MEMORY)) !== 0n) {
          process.memory.write(
            newPointer + BigInt(oldSize),
            new Uint8Array(newSize - oldSize),
          );
        }
        heap.free(oldOffset);
        return newPointer;
      },
    );
    this.registerHandler(
      'kernel32.dll',
      'HeapSize',
      (_process, _thread, registers) => {
        const heap = this.resolveHeap(registers.RCX);
        if (!heap) return 0xffffffffffffffffn;
        const size = heap.sizeOf(Number(registers.R8 - heap.base));
        return size === undefined ? 0xffffffffffffffffn : BigInt(size);
      },
    );
    this.registerHandler(
      'msvcrt.dll',
      'strlen',
      (process, _thread, registers) =>
        BigInt(process.memory.readCString(registers.RCX).length),
    );
    this.registerHandler(
      'msvcrt.dll',
      'memcpy',
      (process, _thread, registers) => {
        const destination = registers.RCX;
        const source = registers.RDX;
        const length = Number(registers.R8 & 0xffffffffffffffffn);
        if (length <= 0) return destination;
        try {
          const bytes = process.memory.read(source, length);
          process.memory.write(destination, bytes);
          return destination;
        } catch (error) {
          process.lastError = 13;
          return 0n;
        }
      },
    );
    this.registerHandler(
      'msvcrt.dll',
      '__getmainargs',
      (process, _thread, registers) => {
        const mainArguments = process.mainArguments;
        if (!mainArguments) {
          process.lastError = 87;
          return -1n;
        }
        process.memory.writeU32(registers.RCX, Number(mainArguments.argc));
        process.memory.writeU64(registers.RDX, mainArguments.argv);
        if (registers.R8 !== 0n) {
          process.memory.writeU64(registers.R8, mainArguments.envp);
        }
        return 0n;
      },
    );
    this.registerHandler(
      'msvcrt.dll',
      '_putenv',
      (process, _thread, registers) => {
        const expression = process.memory.readCString(registers.RCX);
        const separator = expression.indexOf('=');
        if (separator <= 0) return -1n;
        const name = expression.slice(0, separator);
        const value = expression.slice(separator + 1);
        if (value) process.environment.set(name, value);
        else process.environment.delete(name);
        return 0n;
      },
    );
    this.registerWinsockHandlers();
  }

  private registerWinsockHandlers(): void {
    const fail = (
      process: Win64Process,
      error: number,
      result = SOCKET_ERROR,
    ) => {
      process.winsockLastError = error;
      return result;
    };
    const socketFor = (
      process: Win64Process,
      rawHandle: bigint,
    ): Win64SocketObject | undefined => {
      const object = this.getHandleObject(process, rawHandle);
      return object?.kind === 'socket' ? object : undefined;
    };
    const swap16 = (value: number) =>
      ((value & 0xff) << 8) | ((value >>> 8) & 0xff);
    const swap32 = (value: number) =>
      (((value & 0xff) << 24) |
        ((value & 0xff00) << 8) |
        ((value >>> 8) & 0xff00) |
        ((value >>> 24) & 0xff)) >>>
      0;

    this.registerHandler(
      'ws2_32.dll',
      'WSAStartup',
      (process, _thread, registers) => {
        const requestedVersion = Number(registers.RCX & 0xffffn);
        const major = requestedVersion & 0xff;
        if (major !== 2 || registers.RDX === 0n) {
          process.winsockLastError = WSAEINVAL;
          return BigInt(WSAEINVAL);
        }
        const version = Uint8Array.from([
          requestedVersion & 0xff,
          (requestedVersion >>> 8) & 0xff,
          0x02,
          0x02,
        ]);
        process.memory.write(registers.RDX, version);
        process.winsockStarted = true;
        process.winsockLastError = 0;
        return 0n;
      },
    );
    this.registerHandler('ws2_32.dll', 'WSACleanup', (process) => {
      if (!process.winsockStarted) {
        return fail(process, WSANOTINITIALISED);
      }
      process.winsockStarted = false;
      process.winsockLastError = 0;
      return 0n;
    });
    this.registerHandler('ws2_32.dll', 'WSAGetLastError', (process) =>
      BigInt(process.winsockLastError),
    );
    this.registerHandler(
      'ws2_32.dll',
      'socket',
      (process, _thread, registers) => {
        if (!process.winsockStarted) {
          return fail(process, WSANOTINITIALISED, INVALID_SOCKET);
        }
        const family = Number(registers.RCX);
        const type = Number(registers.RDX);
        const protocol = Number(registers.R8);
        if (family !== AF_INET) {
          return fail(process, WSAEAFNOSUPPORT, INVALID_SOCKET);
        }
        if (type !== SOCK_RAW) {
          return fail(process, WSAESOCKTNOSUPPORT, INVALID_SOCKET);
        }
        if (protocol !== IPPROTO_ICMP) {
          return fail(process, WSAEPROTONOSUPPORT, INVALID_SOCKET);
        }
        process.winsockLastError = 0;
        return BigInt(
          process.allocateHandle({
            kind: 'socket',
            socketFamily: family,
            socketType: type,
            socketProtocol: protocol,
            receiveQueue: [],
          }),
        );
      },
    );
    this.registerHandler(
      'ws2_32.dll',
      'closesocket',
      (process, _thread, registers) => {
        const socket = socketFor(process, registers.RCX);
        if (!socket) return fail(process, WSAENOTSOCK);
        process.handles.delete(Number(registers.RCX));
        process.winsockLastError = 0;
        return 0n;
      },
    );
    this.registerHandler(
      'ws2_32.dll',
      'inet_addr',
      (process, _thread, registers) => {
        const requested = process.memory.readCString(registers.RCX);
        const parsed = parseIPv4Address(
          requested.toLowerCase() === 'localhost' ? '127.0.0.1' : requested,
        );
        if (!parsed) return 0xffffffffn;
        return BigInt(parsed.winsockValue);
      },
    );
    this.registerHandler(
      'ws2_32.dll',
      'bind',
      (process, _thread, registers) => {
        if (!process.winsockStarted) {
          return fail(process, WSANOTINITIALISED);
        }
        const socket = socketFor(process, registers.RCX);
        if (!socket) return fail(process, WSAENOTSOCK);
        if (Number(registers.R8) < 8) {
          return fail(process, WSAEINVAL);
        }
        const sockaddr = process.memory.read(registers.RDX, 8);
        const family = new DataView(
          sockaddr.buffer,
          sockaddr.byteOffset,
          sockaddr.byteLength,
        ).getUint16(0, true);
        if (family !== AF_INET || sockaddr[4] !== 127) {
          return fail(process, WSAEHOSTUNREACH);
        }
        process.winsockLastError = 0;
        return 0n;
      },
    );
    for (const functionName of ['send', 'recv'] as const) {
      this.registerHandler(
        'ws2_32.dll',
        functionName,
        (process, _thread, registers) => {
          if (!process.winsockStarted) {
            return fail(process, WSANOTINITIALISED);
          }
          if (!socketFor(process, registers.RCX)) {
            return fail(process, WSAENOTSOCK);
          }
          return fail(process, WSAENOTCONN);
        },
      );
    }
    for (const functionName of ['htons', 'ntohs'] as const) {
      this.registerHandler(
        'ws2_32.dll',
        functionName,
        (_process, _thread, registers) => BigInt(swap16(Number(registers.RCX))),
      );
    }
    for (const functionName of ['htonl', 'ntohl'] as const) {
      this.registerHandler(
        'ws2_32.dll',
        functionName,
        (_process, _thread, registers) => BigInt(swap32(Number(registers.RCX))),
      );
    }
    this.registerHandler(
      'ws2_32.dll',
      'sendto',
      (process, _thread, registers) => {
        if (!process.winsockStarted) {
          return fail(process, WSANOTINITIALISED);
        }
        const socket = socketFor(process, registers.RCX);
        if (!socket) return fail(process, WSAENOTSOCK);
        const sockaddr = process.memory.readU64(registers.RSP + 0x28n);
        const sockaddrLength = Number(
          process.memory.readU64(registers.RSP + 0x30n),
        );
        if (sockaddr === 0n || sockaddrLength < 8) {
          return fail(process, WSAEINVAL);
        }
        const destination = process.memory.read(sockaddr, 8);
        const family = new DataView(
          destination.buffer,
          destination.byteOffset,
          destination.byteLength,
        ).getUint16(0, true);
        if (family !== AF_INET) {
          return fail(process, WSAEAFNOSUPPORT);
        }
        const address = destination.slice(4, 8);
        const request = process.memory.read(
          registers.RDX,
          Number(registers.R8),
        );
        if (!this.network.sendIcmpEcho(socket, address, request)) {
          return fail(process, WSAEHOSTUNREACH);
        }
        process.winsockLastError = 0;
        return BigInt(request.length);
      },
    );
    this.registerHandler(
      'ws2_32.dll',
      'recvfrom',
      (process, _thread, registers) => {
        if (!process.winsockStarted) {
          return fail(process, WSANOTINITIALISED);
        }
        const socket = socketFor(process, registers.RCX);
        if (!socket) return fail(process, WSAENOTSOCK);
        const packet = this.network.receive(socket);
        if (!packet) return fail(process, WSAEWOULDBLOCK);

        const length = Math.min(Number(registers.R8), packet.payload.length);
        process.memory.write(registers.RDX, packet.payload.slice(0, length));

        const from = process.memory.readU64(registers.RSP + 0x28n);
        const fromLength = process.memory.readU64(registers.RSP + 0x30n);
        if (from !== 0n && fromLength !== 0n) {
          const sockaddr = new Uint8Array(16);
          const view = new DataView(sockaddr.buffer);
          view.setUint16(0, AF_INET, true);
          sockaddr.set(packet.address, 4);
          process.memory.write(from, sockaddr);
          process.memory.writeU32(fromLength, sockaddr.length);
        }
        process.winsockLastError = 0;
        return BigInt(length);
      },
    );
  }

  public registerHandler(
    dllName: string,
    functionName: string,
    handler: KernelHandler,
  ): void {
    const dll = this.win32Catalog.dllByName.get(dllName.toLowerCase());
    const fn = dll?.functions[functionName];
    if (!fn) {
      throw new Error(
        `Cannot register missing ABI definition ${dllName}!${functionName}`,
      );
    }
    this.handlers.set(fn.syscallId, handler);
  }

  private createProcessFromKernel(
    parent: Win64Process,
    parentThread: Win64Thread,
    registers: X64Registers,
    wide: boolean,
  ): bigint {
    const readString = (address: bigint) =>
      wide
        ? parent.memory.readWideCString(address)
        : parent.memory.readCString(address);
    const application = registers.RCX === 0n ? '' : readString(registers.RCX);
    const commandLine = parent.environment
      .expand(registers.RDX === 0n ? '' : readString(registers.RDX))
      .trim();
    const parsed = commandLine.match(/^\s*(?:"([^"]+)"|(\S+))(?:\s+(.*))?$/);
    const executable = application || parsed?.[1] || parsed?.[2] || '';
    const args =
      parsed?.[3]
        ?.match(/"[^"]*"|\S+/g)
        ?.map((value) => value.replace(/^"|"$/g, '')) ?? [];
    if (!executable) {
      parent.lastChildExitCode = 0;
      parent.lastError = 0;
      return 1n;
    }
    const resolution = parent.environment.resolveExecutable(
      this.fileSystem,
      executable,
      parent.currentDirectory,
    );
    if (!resolution) {
      parent.lastError = 2;
      parent.lastChildExitCode = 9009;
      return 0n;
    }
    const inheritHandles = parent.memory.readU64(registers.RSP + 0x28n) !== 0n;
    const creationFlags = Number(
      parent.memory.readU64(registers.RSP + 0x30n) & 0xffffffffn,
    );
    const inheritedByValue = new Map<number, Win64Handle>();
    for (const value of [
      parent.standardHandles.input,
      parent.standardHandles.output,
      parent.standardHandles.error,
    ]) {
      const handle = parent.handles.get(value);
      if (handle) inheritedByValue.set(value, handle);
    }
    if (inheritHandles) {
      for (const handle of parent.handles.values()) {
        if (handle.inheritable) {
          inheritedByValue.set(handle.value, handle);
        }
      }
    }
    const inheritedHandles = [...inheritedByValue.values()];
    const inheritedValues = new Set(
      inheritedHandles.map((handle) => handle.value),
    );
    const standardHandles: Win32StandardHandles = {
      input: inheritedValues.has(parent.standardHandles.input)
        ? parent.standardHandles.input
        : 0,
      output: inheritedValues.has(parent.standardHandles.output)
        ? parent.standardHandles.output
        : 0,
      error: inheritedValues.has(parent.standardHandles.error)
        ? parent.standardHandles.error
        : 0,
    };
    const startupInfo = parent.memory.readU64(registers.RSP + 0x48n);
    if (startupInfo !== 0n) {
      const startupFlags = parent.memory.readU32(startupInfo + 60n);
      if ((startupFlags & 0x100) !== 0) {
        if (!inheritHandles) {
          parent.lastError = 87;
          parent.lastChildExitCode = 87;
          return 0n;
        }
        standardHandles.input = Number(
          parent.memory.readU64(startupInfo + 80n),
        );
        standardHandles.output = Number(
          parent.memory.readU64(startupInfo + 88n),
        );
        standardHandles.error = Number(
          parent.memory.readU64(startupInfo + 96n),
        );
        if (
          ![
            standardHandles.input,
            standardHandles.output,
            standardHandles.error,
          ].every((value) => inheritedValues.has(value))
        ) {
          parent.lastError = 6;
          parent.lastChildExitCode = 6;
          return 0n;
        }
      }
    }
    const hasInheritedStandardHandles = Object.values(standardHandles).some(
      (value) => value !== 0,
    );
    const spawned = this.programs.spawn(parent, resolution.path, args, {
      initializeStandardHandles: !hasInheritedStandardHandles,
      inheritedHandles,
      standardHandles: hasInheritedStandardHandles
        ? standardHandles
        : undefined,
    });
    if (!spawned) {
      parent.lastError = 193;
      parent.lastChildExitCode = 193;
      return 0n;
    }
    if ((creationFlags & CREATE_SUSPENDED) !== 0) {
      // Real debuggers launch their target this way: created, but its main
      // thread never runs a single instruction until something explicitly
      // resumes it (or single-steps it directly, bypassing the scheduler
      // entirely -- see `Win64Debugger.vue`).
      spawned.thread.suspendCount = 1;
    }
    // CreateProcessA only creates the process/thread. Actually running it --
    // and, transitively, waking any sibling process already parked waiting
    // on an object this one signals -- goes through the same scheduler every
    // other kernel wait uses, not a loop nested in this syscall dispatch.
    this.scheduler.enqueue(spawned.thread);
    this.pumpScheduler();

    const exitCode = spawned.process.exitCode ?? 0;
    parent.lastChildExitCode = exitCode;
    if (exitCode === CMD_EXIT_REQUEST) {
      parentThread.state = 'terminated';
    }

    const processHandle = parent.allocateHandle({
      kind: 'process',
      targetPid: spawned.process.pid,
    });
    const threadHandle = parent.allocateHandle({
      kind: 'thread',
      targetPid: spawned.process.pid,
      targetTid: spawned.thread.tid,
    });
    const processInformation = parent.memory.readU64(registers.RSP + 0x50n);
    if (processInformation !== 0n) {
      parent.memory.writeU64(processInformation, BigInt(processHandle));
      parent.memory.writeU64(processInformation + 8n, BigInt(threadHandle));
      parent.memory.writeU32(processInformation + 16n, spawned.process.pid);
      parent.memory.writeU32(processInformation + 20n, spawned.thread.tid);
    }
    parent.lastError = 0;
    return 1n;
  }

  private moduleHandle(process: Win64Process, moduleName: string): bigint {
    if (!moduleName) return process.imageBase;
    const normalized = moduleName
      .replace(/\//g, '\\')
      .split('\\')
      .pop()
      ?.toLowerCase();
    if (normalized === 'kernelbase.dll' || normalized === 'kernelbase') {
      return process.getModule('kernel32.dll')?.base ?? 0n;
    }
    return process.getModule(normalized ?? moduleName)?.base ?? 0n;
  }
}

const GLOBAL_MACHINE_KEY = Symbol.for('@exoproc/simulate/win64-machine');

export function getGlobalWin64Machine(): Win64Machine {
  const scope = globalThis as typeof globalThis & {
    [GLOBAL_MACHINE_KEY]?: Win64Machine;
  };
  scope[GLOBAL_MACHINE_KEY] ??= new Win64Machine();
  return scope[GLOBAL_MACHINE_KEY];
}

export const encodePointer = qword;
