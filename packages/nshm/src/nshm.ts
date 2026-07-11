import { toArrayBuffer } from 'bun:ffi';
import {
  Kernel32Impl,
  StartupInfoA,
  ProcessInformation,
  ProcessCreationFlags,
  ProcessAccess,
  MemoryProtection,
  FileMapAccess,
  DuplicateHandleOptions,
  INVALID_HANDLE_VALUE,
  resolveAddress,
  type ICallableMemoryAccessor,
} from 'bun-xffi';
import {
  CreateFileMappingFailedError,
  CreateDummyProcessFailedError,
  OpenDummyProcessFailedError,
  DuplicateHandleFailedError,
  MapViewOfFileFailedError,
} from './errors.js';

/** Access mask requested on every `OpenProcess` of the dummy process (target-side and local). */
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
   * Executable spawned as the relay ("dummy") process the first time a
   * global dummy needs to be created, as a child of whichever target
   * happens to trigger that. Must exist on the target's PATH. Default:
   * `cmd.exe`. Ignored once a global dummy process already exists.
   */
  dummyExecutable?: string;
  /** Extra command-line arguments appended after the quoted executable path. */
  dummyArgs?: string;
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

// A single relay process is shared by every `createSharedMemory` call,
// regardless of which target/accessor/pid asked for it -- different shared
// memory regions all get relayed through the same dummy, so there is no
// need to spawn a new one per call. Lazily created on first use.
let globalDummy: Promise<GlobalDummyProcess> | undefined;

// Each target process must independently OpenProcess the (shared) dummy
// within its own handle table before it can DuplicateHandle into it -- that
// per-target handle is cached too, keyed by target PID, so repeat calls
// against the same target skip straight to DuplicateHandle.
const targetDummyHandles = new Map<number, Promise<bigint>>();

async function getGlobalDummyProcess(
  target: ICallableMemoryAccessor,
  options: NshmOptions,
): Promise<GlobalDummyProcess> {
  if (!globalDummy) {
    globalDummy = spawnGlobalDummyProcess(target, options);
  }
  return globalDummy;
}

async function spawnGlobalDummyProcess(
  target: ICallableMemoryAccessor,
  options: NshmOptions,
): Promise<GlobalDummyProcess> {
  const dummyExecutable = options.dummyExecutable ?? 'cmd.exe';
  const dummyArgs = options.dummyArgs ?? '';
  const commandLine = `"${dummyExecutable}"${dummyArgs ? ` ${dummyArgs}` : ''}`;
  const commandLinePtr = await writeTargetBuffer(
    target,
    Buffer.concat([cstr(commandLine), Buffer.alloc(32)]),
  );

  const startupInfo = await StartupInfoA.alloc(target);
  await startupInfo.assign({
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

  const processInfo = await ProcessInformation.alloc(target);
  await processInfo.assign({
    hProcess: 0n,
    hThread: 0n,
    dwProcessId: 0,
    dwThreadId: 0,
  });

  const created = await target.call(
    Kernel32Impl.CreateProcessA,
    0,
    commandLinePtr,
    0,
    0,
    0,
    ProcessCreationFlags.combine(
      ProcessCreationFlags.CREATE_SUSPENDED,
      ProcessCreationFlags.CREATE_NO_WINDOW,
    ),
    0,
    0,
    resolveAddress(startupInfo),
    resolveAddress(processInfo),
  );
  if (!created) {
    throw new CreateDummyProcessFailedError(await getLastError(target));
  }

  const pid = Number(await processInfo.get('dwProcessId'));

  // The one direct OpenProcess this (Bun) process ever makes -- on the
  // dummy, never on a target -- done once and cached for every future call.
  const localHandle = Number(
    Kernel32Impl.OpenProcess(DUMMY_PROCESS_ACCESS, 0, pid),
  );
  if (localHandle === 0) {
    throw new OpenDummyProcessFailedError(
      pid,
      Number(Kernel32Impl.GetLastError()),
      false,
    );
  }

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
 * Releases this (Bun) process's cached handle to the global dummy process
 * and forgets the cached global/per-target state, so the next
 * {@link createSharedMemory} call spawns a fresh dummy. Existing `Nshm`
 * instances remain valid (their own local mapping handle/view are
 * independent), but the dummy process itself is left running -- terminate
 * it yourself (e.g. via `Kernel32Impl.TerminateProcess`) if that's desired.
 */
export async function closeGlobalDummyProcess(): Promise<void> {
  const dummy = globalDummy;
  globalDummy = undefined;
  targetDummyHandles.clear();
  if (!dummy) return;
  const { localHandle } = await dummy;
  Kernel32Impl.CloseHandle(localHandle);
}

/**
 * Creates a shared memory section reachable from both `target` (an already
 * hijacked/attached process, e.g. via `IndirectNThreadHostAccessor`) and this
 * (Bun) process -- without this process ever calling `OpenProcess` on the
 * target.
 *
 * Flow (see CLAUDE.md / task notes for the full rationale):
 *  1. Inside the target (via `target.call`): `CreateFileMappingA` creates the
 *     section. A single relay ("dummy") process is shared globally -- it is
 *     spawned once (as the first-ever target's own child, suspended and
 *     low-privilege) and reused for every subsequent call regardless of
 *     which target/accessor/pid is asking, since different shared memory
 *     regions can all be relayed through the same dummy. Each target still
 *     independently `OpenProcess`es that shared dummy PID within its own
 *     handle table the first time it's used (cached per target), then
 *     `DuplicateHandle`s the mapping handle from the target's own handle
 *     table into the dummy's.
 *  2. This process `OpenProcess`es the dummy only once ever (the only direct
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

  // ── CreateFileMappingA inside the target ──────────────────────────────────
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

  // ── The shared global dummy + this target's handle to it ─────────────────
  const dummy = await getGlobalDummyProcess(target, options);
  const hDummyInTarget = await getTargetDummyHandle(target, dummy.pid);

  // ── DuplicateHandle inside the target: relay the mapping into the dummy ──
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
