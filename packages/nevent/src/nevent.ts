import {
  Kernel32Impl,
  ProcessAccess,
  DuplicateHandleOptions,
  INVALID_HANDLE_VALUE,
  resolveAddress,
  type ICallableMemoryAccessor,
  type ISyncCallableMemoryAccessor,
} from 'bun-xffi';
import { getGlobalDummyProcess as getSharedDummyProcess } from 'exoproc-dummy';
import {
  CreateEventFailedError,
  OpenDummyProcessFailedError,
  DuplicateHandleFailedError,
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

export interface NEventOptions {
  /**
   * Executable the shared dummy process (see `exoproc-dummy`) is spawned
   * from, the first time any caller in this (Bun) process needs one --
   * shared with `bun-nshm` (same `exoproc-dummy` singleton, whichever
   * package asks for it first). Default: `ping.exe`. Ignored once a shared
   * dummy process already exists.
   */
  dummyExecutable?: string;
  /** Arguments for `dummyExecutable` (default: an effectively-infinite ping). */
  dummyArgs?: string[];
}

export interface CreateRelayedEventOptions extends NEventOptions {
  /** `bManualReset` for `CreateEventA` (default `false`: auto-reset). */
  manualReset?: boolean;
  /** `bInitialState` for `CreateEventA` (default `false`: unsignaled). */
  initialState?: boolean;
}

/**
 * A Windows event, independently valid in both the target process and this
 * (Bun) one -- both handles refer to the same underlying kernel object, so
 * either side can `SetEvent`/`WaitForSingleObject` it and have the other
 * observe it.
 */
export interface RelayedEvent {
  /**
   * Raw `HANDLE`, valid in the *target* process. Bake this into whatever
   * machinecode/thunk runs there (e.g. as a call argument) -- it is never
   * touched again once this call returns.
   */
  targetHandle: bigint;
  /**
   * Raw `HANDLE`, valid in *this* (Bun) process. Pass directly to
   * `Kernel32Impl.WaitForSingleObject`/`SetEvent`/`waitAsync`, or wrap in
   * `bun-winapi`'s `Handle`.
   */
  localHandle: bigint;
}

function getGlobalDummy(options: NEventOptions) {
  return getSharedDummyProcess({
    executable: options.dummyExecutable,
    args: options.dummyArgs,
  });
}

/** Opens a target-local handle to the (shared) dummy PID -- see `bun-nshm`'s
 * identical helper for the rationale on why it's left open target-side. */
async function openDummyHandleInTarget(
  target: ICallableMemoryAccessor,
  dummyPid: number,
): Promise<bigint> {
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
      Number(await target.call(Kernel32Impl.GetLastError)),
      true,
    );
  }
  return hDummyInTarget;
}

/** Synchronous twin of {@link openDummyHandleInTarget}. */
function openDummyHandleInTargetSync(
  target: ISyncCallableMemoryAccessor,
  dummyPid: number,
): bigint {
  const hDummyInTarget = BigInt(
    target.callSync(
      Kernel32Impl.OpenProcess,
      DUMMY_PROCESS_ACCESS,
      0,
      dummyPid,
    ),
  );
  if (hDummyInTarget === 0n) {
    throw new OpenDummyProcessFailedError(
      dummyPid,
      Number(target.callSync(Kernel32Impl.GetLastError)),
      true,
    );
  }
  return hDummyInTarget;
}

/**
 * Creates a Windows event *inside* `target` (via `target.call`, i.e. a real
 * remote call -- a hijacked thread when `target` is an
 * `IndirectNThreadHostAccessor`, never a direct `OpenProcess` from this
 * process onto the real target) and relays a second, independent handle to
 * it into this (Bun) process, through the same shared dummy relay process
 * `bun-nshm` uses (`exoproc-dummy`'s singleton, reused regardless of which
 * package asked for it first).
 *
 * Unlike `NShm.alloc()`'s file-mapping relay, the target's own handle is
 * *not* closed as a side effect here: an event has no separate "view" the
 * way a mapped section does -- the handle itself is the only way to
 * `SetEvent`/`WaitForSingleObject` it, so if target-side code (e.g. a thunk
 * that bakes in `targetHandle` as a literal) needs to signal/wait on it, it
 * needs its own still-valid handle. The relay flow is therefore:
 *
 *  1. `CreateEventA` in the target -- `targetHandle` is the real, permanent
 *     deliverable there, left open for the caller to use.
 *  2. `OpenProcess` in the target onto the shared dummy PID (see
 *     {@link openDummyHandleInTarget}; left open, same rationale as nshm).
 *  3. `DuplicateHandle` *in the target* copies `targetHandle` into the
 *     dummy's handle table *without* `DUPLICATE_CLOSE_SOURCE` -- the target
 *     keeps its own handle valid.
 *  4. `DuplicateHandle` *locally* pulls that duplicate out of the dummy and
 *     into this process, this time *with* `DUPLICATE_CLOSE_SOURCE` so the
 *     dummy's own transit copy doesn't accumulate across calls (mirrors
 *     nshm's local-side dedup step exactly -- the dummy never actively uses
 *     the event itself, so it has no reason to keep a handle to it).
 *
 * End state: `targetHandle` valid in the target, `localHandle` valid here,
 * the dummy holds neither -- two independent handles to the same kernel
 * object, obtained without this process ever calling `OpenProcess` on the
 * real target directly.
 */
export async function createRelayedEvent(
  target: ICallableMemoryAccessor,
  options: CreateRelayedEventOptions = {},
): Promise<RelayedEvent> {
  const dummy = getGlobalDummy(options);

  const targetHandle = BigInt(
    await target.call(
      Kernel32Impl.CreateEventA,
      0,
      options.manualReset ? 1 : 0,
      options.initialState ? 1 : 0,
      0,
    ),
  );
  if (targetHandle === 0n) {
    throw new CreateEventFailedError(
      Number(await target.call(Kernel32Impl.GetLastError)),
    );
  }

  const hDummyInTarget = await openDummyHandleInTarget(target, dummy.pid);

  // ── DuplicateHandle inside the target: hand a copy to the dummy, keeping
  //    the target's own `targetHandle` open (no CLOSE_SOURCE -- see the doc
  //    comment above for why, unlike nshm's mapping-handle relay) ──────────
  const dupOutAddr = await target.alloc(8);
  const dupOk = await target.call(
    Kernel32Impl.DuplicateHandle,
    INVALID_HANDLE_VALUE, // pseudo-handle for the target's own process
    targetHandle,
    hDummyInTarget,
    resolveAddress(dupOutAddr),
    0,
    0,
    DuplicateHandleOptions.SAME_ACCESS,
  );
  if (!dupOk) {
    throw new DuplicateHandleFailedError(
      Number(await target.call(Kernel32Impl.GetLastError)),
      true,
    );
  }
  const dummyEventHandle = (
    await target.read(dupOutAddr, 8)
  ).readBigUInt64LE(0);
  await target.free(dupOutAddr);

  // ── DuplicateHandle locally: pull the event handle out of the dummy,
  //    closing the dummy's own transit copy in the same call ─────────────
  const localDupOut = Buffer.alloc(8);
  const localDupOk = Kernel32Impl.DuplicateHandle(
    dummy.handle,
    dummyEventHandle,
    CURRENT_PROCESS_PSEUDO_HANDLE,
    localDupOut,
    0,
    0,
    DuplicateHandleOptions.combine(
      DuplicateHandleOptions.SAME_ACCESS,
      DuplicateHandleOptions.CLOSE_SOURCE,
    ),
  );
  if (!localDupOk) {
    throw new DuplicateHandleFailedError(
      Number(Kernel32Impl.GetLastError()),
      false,
    );
  }
  const localHandle = localDupOut.readBigUInt64LE(0);

  return { targetHandle, localHandle };
}

/**
 * Synchronous twin of {@link createRelayedEvent} -- same relay flow, driven
 * with `*Sync` calls throughout.
 */
export function createRelayedEventSync(
  target: ISyncCallableMemoryAccessor,
  options: CreateRelayedEventOptions = {},
): RelayedEvent {
  const dummy = getGlobalDummy(options);

  const targetHandle = BigInt(
    target.callSync(
      Kernel32Impl.CreateEventA,
      0,
      options.manualReset ? 1 : 0,
      options.initialState ? 1 : 0,
      0,
    ),
  );
  if (targetHandle === 0n) {
    throw new CreateEventFailedError(
      Number(target.callSync(Kernel32Impl.GetLastError)),
    );
  }

  const hDummyInTarget = openDummyHandleInTargetSync(target, dummy.pid);

  const dupOutAddr = target.allocSync(8);
  const dupOk = target.callSync(
    Kernel32Impl.DuplicateHandle,
    INVALID_HANDLE_VALUE,
    targetHandle,
    hDummyInTarget,
    resolveAddress(dupOutAddr),
    0,
    0,
    DuplicateHandleOptions.SAME_ACCESS,
  );
  if (!dupOk) {
    throw new DuplicateHandleFailedError(
      Number(target.callSync(Kernel32Impl.GetLastError)),
      true,
    );
  }
  const dummyEventHandle = target.readSync(dupOutAddr, 8).readBigUInt64LE(0);
  target.freeSync(dupOutAddr);

  const localDupOut = Buffer.alloc(8);
  const localDupOk = Kernel32Impl.DuplicateHandle(
    dummy.handle,
    dummyEventHandle,
    CURRENT_PROCESS_PSEUDO_HANDLE,
    localDupOut,
    0,
    0,
    DuplicateHandleOptions.combine(
      DuplicateHandleOptions.SAME_ACCESS,
      DuplicateHandleOptions.CLOSE_SOURCE,
    ),
  );
  if (!localDupOk) {
    throw new DuplicateHandleFailedError(
      Number(Kernel32Impl.GetLastError()),
      false,
    );
  }
  const localHandle = localDupOut.readBigUInt64LE(0);

  return { targetHandle, localHandle };
}
