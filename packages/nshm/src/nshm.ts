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

/** Access mask requested on both the target-side and the local `OpenProcess` of the dummy process. */
const DUMMY_PROCESS_ACCESS = ProcessAccess.combine(
  ProcessAccess.DUP_HANDLE,
  ProcessAccess.TERMINATE,
);

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
   * Executable spawned as the low-privilege relay ("dummy") process, launched
   * as a child of the target process. Must exist on the target's PATH.
   * Default: `cmd.exe`.
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
    /** PID of the dummy relay process. */
    public readonly dummyPid: number,
    /** HANDLE to the dummy process, opened directly by this (Bun) process. */
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
   * Unmaps and closes the local view/handle, closes the local dummy handle,
   * and terminates the (still-suspended, never-resumed) dummy process. The
   * target-side mapping handle is left as-is -- the target process owns it
   * and may still be using it for its own purposes.
   */
  close(): void {
    Kernel32Impl.UnmapViewOfFile(this.localView);
    Kernel32Impl.CloseHandle(this.localMappingHandle);
    Kernel32Impl.TerminateProcess(this.localDummyHandle, 0);
    Kernel32Impl.CloseHandle(this.localDummyHandle);
  }
}

function cstr(s: string): Buffer {
  return Buffer.from(s + '\0', 'latin1');
}

async function getLastError(target: ICallableMemoryAccessor): Promise<number> {
  return Number(await target.call(Kernel32Impl.GetLastError));
}

/**
 * Creates a shared memory section reachable from both `target` (an already
 * hijacked/attached process, e.g. via `IndirectNThreadHostAccessor`) and this
 * (Bun) process -- without this process ever calling `OpenProcess` on the
 * target.
 *
 * Flow (see CLAUDE.md / task notes for the full rationale):
 *  1. Inside the target (via `target.call`): `CreateFileMappingA` creates the
 *     section, `CreateProcessA` spawns a suspended, low-privilege dummy
 *     process as the target's own child, `OpenProcess` opens a target-local
 *     handle to that dummy, and `DuplicateHandle` relays the mapping handle
 *     from the target's own handle table into the dummy's.
 *  2. This process directly `OpenProcess`es the dummy (the only direct
 *     `OpenProcess` call this process ever makes) and `DuplicateHandle`s the
 *     mapping handle out of the dummy and into itself, then `MapViewOfFile`s
 *     it locally.
 *
 * The target and this process therefore both end up with a handle to the
 * same section, but this process never touches the target process's handle
 * table directly -- only the dummy's.
 */
export async function createSharedMemory(
  target: ICallableMemoryAccessor,
  options: NshmOptions,
): Promise<Nshm> {
  const size = options.size;
  const dummyExecutable = options.dummyExecutable ?? 'cmd.exe';
  const dummyArgs = options.dummyArgs ?? '';
  const protection = options.protection ?? MemoryProtection.READWRITE;
  const mapAccess =
    options.mapAccess ??
    FileMapAccess.combine(FileMapAccess.READ, FileMapAccess.WRITE);
  const sizeLow = size >>> 0;
  const sizeHigh = Math.floor(size / 0x100000000) >>> 0;

  // ── 1a. CreateFileMappingA inside the target ──────────────────────────────
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

  // ── 1b. CreateProcessA inside the target: spawn the suspended dummy ──────
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

  const dummyPid = Number(await processInfo.get('dwProcessId'));

  // ── 1c. OpenProcess inside the target: a target-local handle to the dummy ─
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

  // ── 1d. DuplicateHandle inside the target: relay the mapping into the dummy ─
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

  // ── 2a. This process directly OpenProcess's the dummy (the only direct
  //        OpenProcess call this process makes) ─────────────────────────────
  const localDummyHandle = Number(
    Kernel32Impl.OpenProcess(DUMMY_PROCESS_ACCESS, 0, dummyPid),
  );
  if (localDummyHandle === 0) {
    throw new OpenDummyProcessFailedError(
      dummyPid,
      Number(Kernel32Impl.GetLastError()),
      false,
    );
  }

  // ── 2b. DuplicateHandle locally: pull the mapping handle out of the dummy ─
  const localDupOut = Buffer.alloc(8);
  const localDupOk = Kernel32Impl.DuplicateHandle(
    localDummyHandle,
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

  // ── 2c. MapViewOfFile locally ──────────────────────────────────────────────
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
    dummyPid,
    localDummyHandle,
  );
}

async function writeTargetBuffer(
  target: ICallableMemoryAccessor,
  data: Buffer,
): Promise<number> {
  const addr = await target.alloc(data.byteLength);
  await target.write(addr, data);
  return resolveAddress(addr);
}
