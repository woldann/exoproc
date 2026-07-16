import {
  isMiddlewareAccessor,
  type ISyncCallableMemoryAccessor,
  type IHostAccessor,
  type IInittableAccessor,
} from 'bun-xffi';
import { Thread } from 'bun-winapi';
import { NThread, type NThreadOptions } from 'bun-nthread';
import {
  HostAccessor,
  ThrowingMemoryAccessor,
  RedirectorHostAccessor,
  BootstrapHostAccessor,
  RaceHostAccessor,
  IndirectCallRedirectorAccessor,
  MachineCodePoolMiddleware,
  MemsetWriteAccessor,
  MemcmpReadAccessor,
  FileTransferWriteAccessor,
  FileTransferReadAccessor,
  ScannerMiddleware,
  MarshallingCallableAccessor,
} from './middleware-accessor.js';

/**
 * A {@link HostAccessor} whose base "call" mechanism is {@link NThread} (x64
 * thread redirection) instead of `RemoteCallableMemoryAccessor` (a fresh
 * `CreateRemoteThread` per call). This directly replaces the old
 * `IndirectCallableAccessor` + manual `NThread`/`RedirectorHostAccessor`
 * wiring -- it builds the same indirect chain
 * (`IndirectCallRedirectorAccessor` → machineCode pool → memset write →
 * memcmp read → file-transfer R/W → scanner → marshalling) on top of an
 * `NThread`-*like* backend directly.
 *
 * Only the thing that actually executes remote calls changes: no
 * `CreateRemoteThread` at all -- a live thread in the target is redirected,
 * parked at a `jmp $` stub, and driven per call. This also sidesteps a
 * GHA/Wine bug where WinAPI calls (VirtualAlloc, malloc, fopen, ...) executed
 * on a freshly-created thread (local or remote) are unreliable -- see CLAUDE.md.
 *
 * Accepts an already-constructed `NThread`, a `(pid, threadId, options)`
 * triple to build one internally, or a {@link NThreadRaceAccessor} standing
 * in for a not-yet-known winner among every thread of a process (the
 * `idType: 'processAllThreadIds'` support behind `createAccessor` --  see
 * that class's own doc comment):
 *
 *   const memory = new IndirectNThreadHostAccessor(pid, tid);
 *   const addr = await memory.alloc(64);              // VirtualAlloc via redirect
 *   await memory.call(SomeFunc, addr);                // executed on the thread
 *
 *   const race = new NThreadRaceAccessor(pid);
 *   const memory = new IndirectNThreadHostAccessor(race); // built once, synchronously
 *   await memory.init();                                  // races, resolves `race` internally
 *
 * With the `(pid, threadId, options)` form, this accessor builds the
 * `NThread`'s `RedirectorHostAccessor` root itself and wires its `target`
 * to `this` -- it owns that object, nothing else could reach it.
 *
 * With the `backend: NThread | NThreadRaceAccessor` form, the backend (and
 * whatever `root` it was constructed with) belongs to the caller. This
 * accessor does not reach into its `root` to rewire it -- if its bootstrap
 * stub calls need to route through this indirect chain (e.g. `root` is a
 * `RedirectorHostAccessor`), the caller sets `root.target = indirect` itself
 * after construction, same as building the chain by hand:
 *
 *   const redirector = new RedirectorHostAccessor(pid);
 *   const nthread = new NThread(backend, tid, options, redirector);
 *   const indirect = new IndirectNThreadHostAccessor(nthread);
 *   redirector.target = indirect;
 */
export class IndirectNThreadHostAccessor extends HostAccessor {
  private readonly nthreadRef: NThread | NThreadRaceAccessor;
  private bootstrapRoot: BootstrapHostAccessor;

  /**
   * The real `NThread` this accessor's chain ultimately runs on. When built
   * from a {@link NThreadRaceAccessor} (the `idType: 'processAllThreadIds'`
   * case), that accessor's own `backend` is the winning `NThread` by the
   * time `init()` resolves (see its doc comment), so this drills through to
   * it rather than exposing the race stand-in itself -- callers that reach
   * past the generic `HostAccessor` surface into `NThread`-specific members
   * (e.g. `.savedContext`, `.setContext()`) need the genuine instance.
   */
  get nthread(): NThread {
    return this.nthreadRef instanceof NThreadRaceAccessor
      ? (this.nthreadRef.backend as NThread)
      : this.nthreadRef;
  }

  constructor(backend: NThread | NThreadRaceAccessor);
  constructor(pid: number, threadId: number, options?: NThreadOptions);
  constructor(
    backendOrPid: NThread | NThreadRaceAccessor | number,
    threadId?: number,
    options: NThreadOptions = {},
  ) {
    let nthread: NThread | NThreadRaceAccessor;
    let nthreadRoot: RedirectorHostAccessor | undefined;
    // `typeof ... === 'number'` rather than `instanceof NThread`: NThread now
    // lives in a different package than this class, so a caller's own
    // cross-package-resolved `NThread` copy can fail an `instanceof` check
    // here even though it's structurally identical (same root cause as
    // `isMiddlewareAccessor` elsewhere in this codebase -- see its doc
    // comment on why `instanceof` against a concrete class is unreliable
    // across a package boundary under Wine).
    if (typeof backendOrPid === 'number') {
      nthreadRoot = new RedirectorHostAccessor(backendOrPid);
      nthread = new NThread(backendOrPid, threadId!, options, nthreadRoot);
    } else {
      nthread = backendOrPid;
    }

    const pid = nthread.processId;
    super(new ThrowingMemoryAccessor(pid));

    const bootstrap = new BootstrapHostAccessor(pid, this);
    this.bootstrapRoot = bootstrap;
    bootstrap.backend = nthread;

    const redirector = new IndirectCallRedirectorAccessor(nthread, bootstrap);
    const machineCodePool = new MachineCodePoolMiddleware(
      redirector,
      bootstrap,
    );
    const memsetWrite = new MemsetWriteAccessor(machineCodePool, bootstrap);
    const memcmpRead = new MemcmpReadAccessor(memsetWrite, bootstrap);
    const fileWriter = new FileTransferWriteAccessor(memcmpRead, bootstrap);
    const fileReader = new FileTransferReadAccessor(fileWriter, bootstrap);
    const scanner = new ScannerMiddleware(fileReader, bootstrap);
    const marshalling = new MarshallingCallableAccessor(scanner, bootstrap);

    this.backend = marshalling;
    let b: ISyncCallableMemoryAccessor = marshalling;
    while (isMiddlewareAccessor(b)) {
      b = b.backend;
    }
    if (b) {
      this._processId = b.processId;
    }

    // Only for the (pid, threadId, options) form: we built `nthreadRoot`
    // ourselves above, so we're the only one who could ever wire it -- route
    // its bootstrap stub calls down through this indirect chain. For the
    // `backend: NThread | NThreadRaceAccessor` form, `nthreadRoot` is
    // undefined here and the caller's own `root` (whatever it is) is left
    // untouched -- see the class doc comment.
    if (nthreadRoot) {
      nthreadRoot.target = this;
    }

    this.nthreadRef = nthread;
  }

  protected override async onInit(): Promise<void> {
    await this.bootstrapRoot.init();
  }

  protected override onInitSync(): void {
    this.bootstrapRoot.initSync();
  }
}

/**
 * {@link RaceHostAccessor} subclass that also knows how to cancel a losing
 * `NThread` candidate immediately, instead of only cleaning it up once its
 * own `init()` eventually settles. `NThreadRaceAccessor` (below) records each
 * candidate's `AbortController` here via {@link trackAbort} right after
 * building it; `releaseLoser` fires that abort as soon as a winner is picked
 * -- `NThread.onInit()`'s landing-wait honors it (`waitForLanding(timeoutMs,
 * this.options.signal)`), throwing `WaitAbortedError` promptly, so a losing
 * candidate stops hammering `SuspendThread`/`SetThreadContext`/`ResumeThread`
 * on the target process within (roughly) one poll interval instead of
 * continuing for up to its own `timeoutMs` in the background. Racing
 * multiple threads of the *same* process concurrently without this turned
 * out to destabilize it badly enough to fail unrelated, later tests against
 * the same shared target -- this is why cancellation isn't optional.
 */
export class NThreadRaceHelperAccessor extends RaceHostAccessor {
  // Keyed by reference only (a plain Map lookup), so the concrete accessor
  // classes involved (e.g. HostAccessor) don't need to structurally satisfy
  // IInittableAccessor themselves at this call site -- their `isInitializing`
  // is `protected`, not `public`, so a direct `object is IInittableAccessor`
  // assignment wouldn't type-check even though `isInittableAccessor()`'s
  // runtime check (used by the base class to populate `racers`) passes fine.
  private readonly aborts = new Map<object, () => void>();

  /** `abort` is invoked immediately if `racer` turns out to lose the race. */
  trackAbort(racer: object, abort: () => void): void {
    this.aborts.set(racer, abort);
  }

  protected override releaseLoser(
    racer: IInittableAccessor,
    settled: Promise<void>,
  ): void {
    this.aborts.get(racer)?.();
    super.releaseLoser(racer, settled);
  }
}

/**
 * Stands in for a not-yet-known `NThread` inside an
 * {@link IndirectNThreadHostAccessor}'s own chain -- pass an instance of
 * this directly as that class's `backend` (its `backend: NThread |
 * NThreadRaceAccessor` constructor form). The whole `IndirectNThreadHostAccessor`
 * chain gets built exactly once, synchronously, right alongside every other
 * `idType`; only the actual thread hijack is deferred to `init()`, same as
 * the rest of this class's own machinery.
 *
 * Races one `NThread` candidate per thread of the process for the hijack
 * (via `backend`, a {@link NThreadRaceHelperAccessor}), then replaces that
 * backend with the winning `NThread` directly -- "puts the `NThread` where
 * the race helper used to be" -- so every op this class forwards (inherited
 * from `HostAccessor`/`MiddlewareAccessor`) transparently reaches the winner
 * from then on, with nothing above it (in `IndirectNThreadHostAccessor`'s own
 * chain) ever needing to change.
 *
 * Only initializes the *raw* `NThread` hijack per candidate, not a full
 * `IndirectNThreadHostAccessor` chain -- that chain is built exactly once,
 * around *this* accessor rather than around any particular candidate, so the
 * real extra work beyond landing the hijack (`IndirectCallRedirectorAccessor`,
 * `MachineCodePoolMiddleware`, an msvcrt check, opening a remote temp file for
 * `FileTransferWriteAccessor`, ...) naturally only ever happens once, no
 * matter which candidate wins. Each candidate is entered into the race as a
 * thin, cheap `HostAccessor(nthread, backend)` wrapper (auto-registers via
 * `registerChild`, inherited by `backend` from `RaceHostAccessor`; its
 * `init()` cascades straight through to `nthread.init()` and nothing more --
 * `HostAccessor.onInit()` is a no-op, `initNext()` just walks `backend` and
 * inits whatever `InittableMiddlewareAccessor` it finds there). Each
 * candidate's own root is a *separate* self-looping `RedirectorHostAccessor`
 * (`target` initially points back at the `NThread` itself), so
 * `NThread.onInit()`'s bootstrap `this.root.call(...)` calls land on that
 * exact candidate's own `call()` -- exactly the primitive register-context
 * calls the hijack itself needs, unrelated to (and unable to use) the racing
 * machinery, whose own effective backend isn't real until the race is over.
 */
export class NThreadRaceAccessor extends HostAccessor {
  constructor(
    pid: number,
    nthreadOptions: NThreadOptions = {},
    root?: IHostAccessor,
  ) {
    const helper = new NThreadRaceHelperAccessor(pid);
    super(helper, root);

    const threads = Thread.getThreads(pid);
    if (threads.length === 0) {
      throw new Error(
        `createAccessor: process ${pid} has no threads to redirect`,
      );
    }

    const callerSignal = nthreadOptions.signal;
    for (const t of threads) {
      const controller = new AbortController();
      // Compose with a caller-supplied signal (if any) -- either one aborts this candidate.
      if (callerSignal) {
        if (callerSignal.aborted) controller.abort(callerSignal.reason);
        else
          callerSignal.addEventListener(
            'abort',
            () => controller.abort(callerSignal.reason),
            { once: true },
          );
      }

      // nthread's own root is this self-looping redirector, unrelated to
      // racing -- NThread.onInit()'s bootstrap `this.root.call(...)` calls
      // need to land on this exact nthread's own call(), so it can't be
      // `helper` (whose own backend isn't a real accessor until the race is
      // over -- see class doc comment).
      const redirector = new RedirectorHostAccessor(pid);
      const nthread = new NThread(
        pid,
        t.tid,
        { ...nthreadOptions, signal: controller.signal },
        redirector,
      );
      redirector.target = nthread;
      // Auto-registers with `helper` via HostAccessor's constructor (root =
      // helper triggers `helper.registerChild(this)`).
      const registration = new HostAccessor(nthread, helper);
      helper.trackAbort(registration, () => controller.abort());
    }
  }

  protected override async onInit(): Promise<void> {
    // initNext() (run before onInit()) already inited `this.backend` (the
    // helper), racing every candidate -- helper.backend is now the winning
    // candidate's thin registration wrapper.
    const helper = this.backend as NThreadRaceHelperAccessor;
    const winnerWrapper = helper.backend as HostAccessor;
    this.backend = winnerWrapper.backend as NThread;
  }

  protected override onInitSync(): never {
    throw new Error('NThreadRaceAccessor does not support initSync()');
  }
}
