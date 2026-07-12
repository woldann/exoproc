import { toArrayBuffer } from 'bun:ffi';
import {
  Kernel32Impl,
  Advapi32Impl,
  ProcessAccess,
  TokenAccess,
  CreateRestrictedTokenFlags,
  MemoryProtection,
  FileMapAccess,
  DuplicateHandleOptions,
  ProcessCreationFlags,
  StartupInfoA,
  ProcessInformation,
  INVALID_HANDLE_VALUE,
  resolveAddress,
  type ICallableMemoryAccessor,
} from 'bun-xffi';
import {
  CreateFileMappingFailedError,
  OpenProcessTokenFailedError,
  CreateRestrictedTokenFailedError,
  SpawnDummyProcessFailedError,
  OpenDummyProcessFailedError,
  DuplicateHandleFailedError,
  MapViewOfFileFailedError,
} from './errors.js';

/** Access mask requested on every target-side `OpenProcess` of the dummy process. */
const DUMMY_PROCESS_ACCESS = ProcessAccess.ALL_ACCESS;

/**
 * `GetCurrentProcess()`'s pseudo-handle is always `(HANDLE)-1` by definition
 * (MSDN), so it's used as a literal here rather than round-tripping the call
 * through `Number()`/bigint conversion, which would lose precision on the
 * full-width unsigned bit pattern.
 */
const CURRENT_PROCESS_PSEUDO_HANDLE = INVALID_HANDLE_VALUE;

export interface NshmOptions {
  /** Size in bytes of the shared memory section. */
  size: number;
  /**
   * Executable this (Bun) process spawns directly, in a de-elevated user-mode
   * token, as the relay ("dummy") process the first time a global dummy is
   * needed. Default: `ping.exe` (an idle, long-lived process). Ignored once
   * a global dummy process already exists.
   */
  dummyExecutable?: string;
  /** Arguments for `dummyExecutable`. Default: `['127.0.0.1', '-t']` (infinite ping). */
  dummyArgs?: string[];
  /** Page protection for the mapping. Default: `MemoryProtection.READWRITE`. */
  protection?: MemoryProtection;
  /** Desired access for the local `MapViewOfFile`. Default: read+write. */
  mapAccess?: FileMapAccess;
  /** Optional name for the file mapping object (`CreateFileMappingA`'s `lpName`). */
  name?: string;
}

/**
 * A shared memory section reachable from both the target process and this
 * (Bun) process, obtained without ever calling `OpenProcess` on the target
 * directly -- see {@link createSharedMemory}.
 */
export class Nshm {
  constructor(
    public readonly size: number,
    /** HANDLE value for the mapping object, valid in the target process's handle table. */
    public readonly targetMappingHandle: bigint,
    /** HANDLE value for the mapping object, valid in this (Bun) process's handle table. */
    public readonly localMappingHandle: number,
    /** Base address of the mapped view, valid in this (Bun) process's address space. */
    public readonly localView: number,
    /** PID of the (shared, global) dummy relay process. */
    public readonly dummyPid: number,
    /** HANDLE to the dummy process, opened directly by this (Bun) process. Shared across every `Nshm` -- do not close it yourself. */
    public readonly localDummyHandle: number,
  ) {}

  /** Reads `size` bytes from the local mapped view at `offset`. */
  read(size: number = this.size, offset: number = 0): Buffer {
    return Buffer.from(toArrayBuffer(this.localView as any, offset, size));
  }

  /** Writes `data` into the local mapped view at `offset`. */
  write(data: Buffer | Uint8Array, offset: number = 0): void {
    const dst = new Uint8Array(
      toArrayBuffer(this.localView as any, offset, data.byteLength),
    );
    dst.set(data);
  }

  /**
   * Unmaps and closes this mapping's own local view/handle. The dummy
   * process and its local handle are shared by every `Nshm` and are left
   * untouched -- see {@link closeGlobalDummyProcess} to release those.
   */
  close(): void {
    Kernel32Impl.UnmapViewOfFile(this.localView);
    Kernel32Impl.CloseHandle(this.localMappingHandle);
  }
}

function cstr(s: string): Buffer {
  return Buffer.from(s + '\0', 'latin1');
}

async function getLastError(target: ICallableMemoryAccessor): Promise<number> {
  return Number(await target.call(Kernel32Impl.GetLastError));
}

async function writeTargetBuffer(
  target: ICallableMemoryAccessor,
  data: Buffer,
): Promise<number> {
  const addr = await target.alloc(data.byteLength);
  await target.write(addr, data);
  return resolveAddress(addr);
}

interface GlobalDummyProcess {
  pid: number;
  /** This (Bun) process's own handle to the dummy, opened once and reused. */
  localHandle: number;
}

// This (Bun) process spawns and owns a single relay process directly -- not
// via a remote call into any target. It's shared by every `createSharedMemory`
// call regardless of which target/accessor/pid asked for it, since different
// shared memory regions all get relayed through the same dummy. Lazily
// spawned on first use.
let globalDummy: GlobalDummyProcess | undefined;

// Each target process must independently OpenProcess the (shared) dummy
// within its own handle table before it can DuplicateHandle into it -- that
// per-target handle is cached too, keyed by target PID, so repeat calls
// against the same target skip straight to DuplicateHandle.
const targetDummyHandles = new Map<number, Promise<bigint>>();

function getGlobalDummyProcess(options: NshmOptions): GlobalDummyProcess {
  if (!globalDummy) {
    globalDummy = spawnGlobalDummyProcess(options);
  }
  return globalDummy;
}

/**
 * Spawns the dummy directly via `CreateProcessAsUserA` with a token derived
 * (via `CreateRestrictedToken`) from this (Bun) process's own token, rather
 * than `child_process.spawn` -- the dummy must run in a plain user-mode
 * context even when this process itself is elevated, and `spawn` would just
 * inherit this process's token unmodified. `CreateRestrictedToken` with
 * `DISABLE_MAX_PRIVILEGE` strips administrative privileges from a duplicate
 * of the caller's own token; because the resulting token is still derived
 * from the caller's own primary token (not an arbitrary one), `SE_ASSIGN_
 * PRIMARYTOKEN_NAME` is not required to hand it to `CreateProcessAsUser`
 * (see MSDN).
 */
function spawnGlobalDummyProcess(options: NshmOptions): GlobalDummyProcess {
  const dummyExecutable = options.dummyExecutable ?? 'ping.exe';
  const dummyArgs = options.dummyArgs ?? ['127.0.0.1', '-t'];
  const commandLine = `"${dummyExecutable}"${dummyArgs.length ? ` ${dummyArgs.join(' ')}` : ''}`;
  const commandLineBuf = Buffer.concat([cstr(commandLine), Buffer.alloc(32)]);

  const tokenOut = Buffer.alloc(8);
  const gotToken = Advapi32Impl.OpenProcessToken(
    Kernel32Impl.GetCurrentProcess(),
    TokenAccess.combine(
      TokenAccess.DUPLICATE,
      TokenAccess.QUERY,
      TokenAccess.ASSIGN_PRIMARY,
      TokenAccess.ADJUST_DEFAULT,
      TokenAccess.ADJUST_SESSIONID,
    ),
    tokenOut,
  );
  if (!gotToken) {
    throw new OpenProcessTokenFailedError(Number(Kernel32Impl.GetLastError()));
  }
  const hToken = tokenOut.readBigUInt64LE(0);

  const restrictedOut = Buffer.alloc(8);
  const restricted = Advapi32Impl.CreateRestrictedToken(
    hToken,
    CreateRestrictedTokenFlags.DISABLE_MAX_PRIVILEGE,
    0,
    0,
    0,
    0,
    0,
    0,
    restrictedOut,
  );
  Kernel32Impl.CloseHandle(hToken);
  if (!restricted) {
    throw new CreateRestrictedTokenFailedError(
      Number(Kernel32Impl.GetLastError()),
    );
  }
  const hRestrictedToken = restrictedOut.readBigUInt64LE(0);

  const startupInfo = StartupInfoA.allocSync();
  startupInfo.assign({
    cb: StartupInfoA.computed.totalSize,
    lpReserved: null,
    lpDesktop: null,
    lpTitle: null,
    dwX: 0,
    dwY: 0,
    dwXSize: 0,
    dwYSize: 0,
    dwXCountChars: 0,
    dwYCountChars: 0,
    dwFillAttribute: 0,
    dwFlags: 0,
    wShowWindow: 0,
    cbReserved2: 0,
    lpReserved2: null,
    hStdInput: 0n,
    hStdOutput: 0n,
    hStdError: 0n,
  });

  const processInfo = ProcessInformation.allocSync();
  processInfo.assign({
    hProcess: 0n,
    hThread: 0n,
    dwProcessId: 0,
    dwThreadId: 0,
  });

  const created = Advapi32Impl.CreateProcessAsUserA(
    hRestrictedToken,
    0,
    commandLineBuf,
    0,
    0,
    0,
    ProcessCreationFlags.CREATE_NO_WINDOW,
    0,
    0,
    startupInfo,
    processInfo,
  );
  Kernel32Impl.CloseHandle(hRestrictedToken);
  if (!created) {
    throw new SpawnDummyProcessFailedError(
      dummyExecutable,
      Number(Kernel32Impl.GetLastError()),
    );
  }

  const pid = Number(processInfo.dwProcessId);
  // CreateProcessAsUser hands back a fully-usable process handle directly --
  // no separate local OpenProcess needed.
  const localHandle = Number(processInfo.hProcess);

  return { pid, localHandle };
}

async function getTargetDummyHandle(
  target: ICallableMemoryAccessor,
  dummyPid: number,
): Promise<bigint> {
  const cached = targetDummyHandles.get(target.processId);
  if (cached) return cached;

  const opened = (async () => {
    const hDummyInTarget = BigInt(
      await target.call(
        Kernel32Impl.OpenProcess,
        DUMMY_PROCESS_ACCESS,
        0,
        dummyPid,
      ),
    );
    if (hDummyInTarget === 0n) {
      throw new OpenDummyProcessFailedError(
        dummyPid,
        await getLastError(target),
        true,
      );
    }
    return hDummyInTarget;
  })();

  targetDummyHandles.set(target.processId, opened);
  return opened;
}

/**
 * Terminates and releases this (Bun) process's handle to the global dummy
 * process, and forgets the cached global/per-target state, so the next
 * {@link createSharedMemory} call spawns a fresh dummy. Existing `Nshm`
 * instances remain valid (their own local mapping handle/view are
 * independent of the dummy once mapped).
 */
export function closeGlobalDummyProcess(): void {
  const dummy = globalDummy;
  globalDummy = undefined;
  targetDummyHandles.clear();
  if (!dummy) return;
  Kernel32Impl.TerminateProcess(dummy.localHandle, 0);
  Kernel32Impl.CloseHandle(dummy.localHandle);
}

/**
 * Creates a shared memory section reachable from both `target` (an already
 * hijacked/attached process, e.g. via `IndirectNThreadHostAccessor`) and this
 * (Bun) process -- without this process ever calling `OpenProcess` on the
 * target.
 *
 * Flow (see CLAUDE.md / task notes for the full rationale):
 *  1. This (Bun) process spawns a single relay ("dummy") process directly,
 *     in a de-elevated user-mode token via `CreateProcessAsUserA` (never
 *     `child_process.spawn`, which would just inherit this process's own
 *     token/privilege level unmodified). The dummy is reused for every
 *     subsequent call regardless of which target/accessor/pid is asking --
 *     different shared memory regions can all be relayed through the same
 *     dummy.
 *  2. Inside the target (via `target.call`), all it ever does is:
 *     `CreateFileMappingA` creates the section, `OpenProcess` opens a
 *     target-local handle to the (shared) dummy PID (cached per target), and
 *     `DuplicateHandle` transfers the mapping handle from the target's own
 *     handle table into the dummy's.
 *  3. This process `OpenProcess`es the dummy only once ever (the only direct
 *     `OpenProcess` call this process makes, cached and reused for every
 *     call) and `DuplicateHandle`s the mapping handle out of the dummy and
 *     into itself, then `MapViewOfFile`s it locally.
 *
 * The target and this process therefore both end up with a handle to the
 * same section, but this process never touches the target process's handle
 * table directly -- only the (shared) dummy's.
 */
export async function createSharedMemory(
  target: ICallableMemoryAccessor,
  options: NshmOptions,
): Promise<Nshm> {
  const size = options.size;
  const protection = options.protection ?? MemoryProtection.READWRITE;
  const mapAccess =
    options.mapAccess ??
    FileMapAccess.combine(FileMapAccess.READ, FileMapAccess.WRITE);
  const sizeLow = size >>> 0;
  const sizeHigh = Math.floor(size / 0x100000000) >>> 0;

  // ── The shared global dummy (spawned directly by this process) ───────────
  const dummy = getGlobalDummyProcess(options);

  // ── CreateFileMappingA inside the target -- this is all the target does ──
  const namePtr = options.name
    ? await writeTargetBuffer(target, cstr(options.name))
    : 0;

  const hMapping = BigInt(
    await target.call(
      Kernel32Impl.CreateFileMappingA,
      INVALID_HANDLE_VALUE,
      0,
      protection,
      sizeHigh,
      sizeLow,
      namePtr,
    ),
  );
  if (hMapping === 0n) {
    throw new CreateFileMappingFailedError(await getLastError(target));
  }

  const hDummyInTarget = await getTargetDummyHandle(target, dummy.pid);

  // ── DuplicateHandle inside the target: transfer the mapping to the dummy ─
  const dupOutAddr = await target.alloc(8);
  const dupOk = await target.call(
    Kernel32Impl.DuplicateHandle,
    INVALID_HANDLE_VALUE, // pseudo-handle for the target's own process
    hMapping,
    hDummyInTarget,
    resolveAddress(dupOutAddr),
    0,
    0,
    DuplicateHandleOptions.SAME_ACCESS,
  );
  if (!dupOk) {
    throw new DuplicateHandleFailedError(await getLastError(target), true);
  }
  const dummyMappingHandle = (await target.read(dupOutAddr, 8)).readBigUInt64LE(
    0,
  );

  // ── DuplicateHandle locally: pull the mapping handle out of the dummy ────
  const localDupOut = Buffer.alloc(8);
  const localDupOk = Kernel32Impl.DuplicateHandle(
    dummy.localHandle,
    dummyMappingHandle,
    CURRENT_PROCESS_PSEUDO_HANDLE,
    localDupOut,
    0,
    0,
    DuplicateHandleOptions.SAME_ACCESS,
  );
  if (!localDupOk) {
    throw new DuplicateHandleFailedError(
      Number(Kernel32Impl.GetLastError()),
      false,
    );
  }
  const localMappingHandle = Number(localDupOut.readBigUInt64LE(0));

  // ── MapViewOfFile locally ─────────────────────────────────────────────────
  const localView = Number(
    Kernel32Impl.MapViewOfFile(localMappingHandle, mapAccess, 0, 0, size),
  );
  if (localView === 0) {
    throw new MapViewOfFileFailedError(Number(Kernel32Impl.GetLastError()));
  }

  return new Nshm(
    size,
    hMapping,
    localMappingHandle,
    localView,
    dummy.pid,
    dummy.localHandle,
  );
}
