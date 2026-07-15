import { Thread } from 'bun-winapi';
import {
  type IHostAccessor,
  type ISyncCallableMemoryAccessor,
  isInittableAccessor,
} from 'bun-xffi';
import { type NThreadOptions } from 'bun-nthread';
import { NShm, type NShmOptions } from 'bun-nshm';
import { HostAccessor } from './middleware-accessor.js';
import { IndirectNThreadHostAccessor } from './indirect-nthread-host-accessor.js';

/** What {@link createAccessor}'s `id` parameter identifies. */
export type AccessorIdType = 'thread' | 'process';

/**
 * Options for {@link createAccessor}.
 */
export interface AccessorOptions {
  /**
   * Whether `id` is a thread id or a process id. Default: `'thread'` -- the
   * whole default accessor chain is built around redirecting one specific,
   * already-live thread ({@link IndirectNThreadHostAccessor}), so naming
   * that thread directly is the precise, unambiguous form. Pass `'process'`
   * to hand in a pid instead and let this pick the process's first
   * enumerable thread ({@link Thread.getThreads}) for you.
   *
   * Either way, the resolved thread must periodically return to user mode
   * on its own (e.g. a timer wait) -- see CLAUDE.md's `ping.exe`/
   * `DummyProcess` notes for why a thread parked in an indefinite kernel
   * wait never lands the redirect.
   */
  idType?: AccessorIdType;
  /** Forwarded to the default {@link IndirectNThreadHostAccessor}'s `NThread`. Ignored when `backend` is supplied. */
  nthreadOptions?: NThreadOptions;
  /**
   * Use this accessor instead of building the default
   * {@link IndirectNThreadHostAccessor} chain -- e.g. an already-wired
   * `HostAccessor`, or a plain custom `IHostAccessor`. When supplied, `id`/
   * `idType` are never resolved at all. Still eligible for `sharedMemory`
   * wrapping, same as the default chain.
   */
  backend?: IHostAccessor;
  /**
   * Wrap the resolved accessor (the default chain, or `backend` if
   * supplied) with a shared-memory middleware: plain `READWRITE`
   * allocations get backed by cross-process shared memory, so reads/writes
   * against them skip the remote round-trip entirely after the initial
   * `alloc()`. Default: `false`.
   */
  sharedMemory?: boolean;
  /**
   * Shared-memory middleware class used when `sharedMemory` is `true`.
   * Default: {@link NShm}.
   */
  sharedMemoryProvider?: new (
    backend: ISyncCallableMemoryAccessor,
    root: HostAccessor,
    options?: NShmOptions,
  ) => IHostAccessor;
  /** Forwarded to `sharedMemoryProvider`. Ignored when `sharedMemory` is `false`. */
  sharedMemoryOptions?: NShmOptions;
}

/** Resolves `id` (a raw thread id) to its owning `{ pid, threadId }` pair. */
function resolveFromThreadId(id: number): { pid: number; threadId: number } {
  // pid=0 means "all processes" -- a bare thread id doesn't tell us which
  // process owns it, so the system-wide snapshot has to be searched.
  const entry = Thread.getThreads(0).find((t) => t.tid === id);
  if (!entry) {
    throw new Error(`createAccessor: no thread with id ${id} found`);
  }
  return { pid: entry.ownerPid, threadId: id };
}

/** Resolves `id` (a process id) to `{ pid, threadId }` via its first enumerable thread. */
function resolveFromProcessId(id: number): { pid: number; threadId: number } {
  const threadId = Thread.getThreads(id)[0]?.tid;
  if (threadId === undefined) {
    throw new Error(`createAccessor: process ${id} has no threads to redirect`);
  }
  return { pid: id, threadId };
}

/** The default chain or `options.backend`, before any `sharedMemory` wrapping. */
function resolveBaseAccessor(
  id: number,
  options: AccessorOptions,
): IHostAccessor {
  if (options.backend) {
    return options.backend;
  }

  const idType = options.idType ?? 'thread';
  const { pid, threadId } =
    idType === 'thread' ? resolveFromThreadId(id) : resolveFromProcessId(id);

  return new IndirectNThreadHostAccessor(pid, threadId, options.nthreadOptions);
}

/**
 * Builds the same {@link IHostAccessor} {@link createAccessor} does, without
 * initializing it -- the returned accessor still lazily initializes on its
 * first real operation (every {@link InittableMiddlewareAccessor} op is
 * guarded by `!isInitializing -> await this.init()`), it's just not
 * pre-initialized up front. Defaults to {@link IndirectNThreadHostAccessor}
 * (thread redirection -- no `CreateRemoteThread` and no remote allocation
 * for the call mechanism itself); pass `options.backend` to use a different
 * strategy instead.
 *
 * `id` is a thread id by default -- pass `options.idType = 'process'` to
 * hand in a pid and auto-pick a thread instead. See {@link AccessorOptions.idType}.
 *
 * Pass `options.sharedMemory = true` to wrap the result in a shared-memory
 * middleware ({@link NShm} by default) -- see {@link AccessorOptions.sharedMemory}.
 */
export function createAccessorWithoutInit(
  id: number,
  options: AccessorOptions = {},
): IHostAccessor {
  const base = resolveBaseAccessor(id, options);
  if (!options.sharedMemory) {
    return base;
  }

  const Provider = options.sharedMemoryProvider ?? NShm;
  const root = new HostAccessor(base);
  return new Provider(base, root, options.sharedMemoryOptions);
}

/**
 * {@link createAccessorWithoutInit}, followed by `await`ing the result's
 * `init()` (when it has one -- see {@link isInittableAccessor}) so the
 * accessor is already initialized by the time this resolves, instead of
 * initializing lazily on its first real operation.
 */
export async function createAccessor(
  id: number,
  options: AccessorOptions = {},
): Promise<IHostAccessor> {
  const accessor = createAccessorWithoutInit(id, options);
  if (isInittableAccessor(accessor)) {
    await accessor.init();
  }
  return accessor;
}

/**
 * How aggressively the default {@link createAccessor} chain drives the
 * redirected thread: tighter polling and shorter timeouts squeeze more
 * read/write/call throughput out of it (less latency added per operation),
 * at the cost of stressing the target harder and raising the odds of
 * destabilizing/crashing a fragile one -- see CLAUDE.md's NThread
 * timeout-tuning notes for why some targets need more slack. Purely a
 * throughput-vs-stability dial on NThread's own wait/poll timing (plus,
 * at level 2, turning on shared memory for extra throughput).
 *
 *   1 = gentle: long timeout, relaxed polling -- safest for a fragile/loaded target.
 *   2 = balanced: NThread's own defaults (5000ms timeout, 50ms poll) + shared memory.
 */
export type AccessorAggressiveness = 1 | 2;

const AGGRESSIVENESS_PRESETS: Record<
  AccessorAggressiveness,
  { nthreadOptions: NThreadOptions; sharedMemory: boolean }
> = {
  1: {
    nthreadOptions: { timeoutMs: 20000, pollIntervalMs: 100 },
    sharedMemory: false,
  },
  2: {
    nthreadOptions: { timeoutMs: 5000, pollIntervalMs: 50 },
    sharedMemory: true,
  },
};

/**
 * Returns a ready-made {@link AccessorOptions} template tuned for the given
 * {@link AccessorAggressiveness} level -- pass it straight to
 * {@link createAccessor}, or spread/extend it (e.g. to also set `idType`).
 */
export function createAccessorOptions(
  aggressiveness: AccessorAggressiveness = 2,
): AccessorOptions {
  const preset = AGGRESSIVENESS_PRESETS[aggressiveness];
  return {
    nthreadOptions: { ...preset.nthreadOptions },
    sharedMemory: preset.sharedMemory,
  };
}
