import { IndirectCallableAccessor, RedirectorHostAccessor } from 'bun-xffi';
import { NThread, type NThreadOptions } from './nthread.js';

/**
 * An {@link IndirectCallableAccessor} whose base "call" mechanism is
 * {@link NThread} (x64 thread redirection) instead of the default
 * `RemoteCallableMemoryAccessor` (`CreateRemoteThread` + named-pipe loop).
 *
 * Everything above the backend is identical to `IndirectCallableAccessor` --
 * `IndirectCallRedirectorAccessor` (malloc/memset indirect allocs) →
 * machineCode pool → memset write → memcmp read → file-transfer R/W → scanner →
 * marshalling. Only the thing that actually executes remote calls changes: no
 * `CreateRemoteThread`, no injected pipe-loop machineCode -- a live thread in the
 * target is redirected, parked at a `jmp $` stub, and driven per call.
 *
 * This is the pre-wired form of the manual chain the nthread integration test
 * builds (`new NThread(...)` → `new IndirectCallableAccessor(nthread)` →
 * `redirector.target = indirect`). `NThread` issues its redirect-bootstrap stub
 * calls through its own `root` (a {@link RedirectorHostAccessor}); pointing
 * that root back at this accessor routes those calls down the chain to
 * `nthread.call` (the redirected thread), while the indirect chain keeps its own
 * `BootstrapHostAccessor` (from the super-constructor) for its init cycle.
 *
 *   const spinner = await spawnLoopThread();          // a redirectable thread
 *   const memory = new IndirectNThreadHostAccessor(pid, spinner.tid);
 *   const addr = await memory.alloc(64);              // VirtualAlloc via redirect
 *   await memory.call(SomeFunc, addr);                // executed on the thread
 */
export class IndirectNThreadHostAccessor extends IndirectCallableAccessor {
  public readonly nthread: NThread;

  constructor(pid: number, threadId: number, options: NThreadOptions = {}) {
    const nthreadRoot = new RedirectorHostAccessor(pid);
    const nthread = new NThread(pid, threadId, options, nthreadRoot);
    super(nthread);
    // Route NThread's bootstrap stub calls (issued via this.root) down
    // through this indirect chain to nthread.call -- the same wiring the
    // nthread integration test uses (`redirector.target = indirect`).
    nthreadRoot.target = this;
    this.nthread = nthread;
  }
}
