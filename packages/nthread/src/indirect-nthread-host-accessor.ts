import {
  isMiddlewareAccessor,
  type ISyncCallableMemoryAccessor,
} from 'bun-xffi';
import {
  HostAccessor,
  ThrowingMemoryAccessor,
  RedirectorHostAccessor,
  BootstrapHostAccessor,
  IndirectCallRedirectorAccessor,
  MachineCodePoolMiddleware,
  MemsetWriteAccessor,
  MemcmpReadAccessor,
  FileTransferWriteAccessor,
  FileTransferReadAccessor,
  ScannerMiddleware,
  MarshallingCallableAccessor,
} from 'exoproc-accessors';
import { NThread, type NThreadOptions } from './nthread.js';

/**
 * A {@link HostAccessor} whose base "call" mechanism is {@link NThread} (x64
 * thread redirection) instead of `RemoteCallableMemoryAccessor` (a fresh
 * `CreateRemoteThread` per call). This directly replaces the old
 * `IndirectCallableAccessor` + manual `NThread`/`RedirectorHostAccessor`
 * wiring -- it builds the same indirect chain
 * (`IndirectCallRedirectorAccessor` → machineCode pool → memset write →
 * memcmp read → file-transfer R/W → scanner → marshalling) on top of an
 * `NThread` backend directly.
 *
 * Only the thing that actually executes remote calls changes: no
 * `CreateRemoteThread` at all -- a live thread in the target is redirected,
 * parked at a `jmp $` stub, and driven per call. This also sidesteps a
 * GHA/Wine bug where WinAPI calls (VirtualAlloc, malloc, fopen, ...) executed
 * on a freshly-created thread (local or remote) are unreliable -- see CLAUDE.md.
 *
 * Accepts either an already-constructed `NThread`, or a bare
 * `(pid, threadId, options)` triple to build the `NThread` internally:
 *
 *   const memory = new IndirectNThreadHostAccessor(pid, tid);
 *   const addr = await memory.alloc(64);              // VirtualAlloc via redirect
 *   await memory.call(SomeFunc, addr);                // executed on the thread
 *
 * With the `(pid, threadId, options)` form, this accessor builds the
 * `NThread`'s `RedirectorHostAccessor` root itself and wires its `target`
 * to `this` -- it owns that object, nothing else could reach it.
 *
 * With the `backend: NThread` form, the `NThread` (and whatever `root` it
 * was constructed with) belongs to the caller. This accessor does not reach
 * into `nthread.root` to rewire it -- if `nthread`'s bootstrap stub calls
 * need to route through this indirect chain (e.g. `root` is a
 * `RedirectorHostAccessor`), the caller sets `root.target = indirect` itself
 * after construction, same as building the chain by hand:
 *
 *   const redirector = new RedirectorHostAccessor(pid);
 *   const nthread = new NThread(backend, tid, options, redirector);
 *   const indirect = new IndirectNThreadHostAccessor(nthread);
 *   redirector.target = indirect;
 */
export class IndirectNThreadHostAccessor extends HostAccessor {
  public readonly nthread: NThread;
  private bootstrapRoot: BootstrapHostAccessor;

  constructor(backend: NThread);
  constructor(pid: number, threadId: number, options?: NThreadOptions);
  constructor(
    backendOrPid: NThread | number,
    threadId?: number,
    options: NThreadOptions = {},
  ) {
    let nthread: NThread;
    let nthreadRoot: RedirectorHostAccessor | undefined;
    if (backendOrPid instanceof NThread) {
      nthread = backendOrPid;
    } else {
      nthreadRoot = new RedirectorHostAccessor(backendOrPid);
      nthread = new NThread(backendOrPid, threadId!, options, nthreadRoot);
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
    // `backend: NThread` form, `nthreadRoot` is undefined here and the
    // caller's own `root` (whatever it is) is left untouched -- see the
    // class doc comment.
    if (nthreadRoot) {
      nthreadRoot.target = this;
    }

    this.nthread = nthread;
  }

  protected override async onInit(): Promise<void> {
    await this.bootstrapRoot.init();
  }

  protected override onInitSync(): void {
    this.bootstrapRoot.initSync();
  }
}
