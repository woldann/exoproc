import {
  MiddlewareAccessor,
  ThrowingMemoryAccessor,
  IndirectCallRedirectorAccessor,
  MarshallingCallableAccessor,
  HostAccessor,
  FileTransferWriteAccessor,
  MemsetWriteAccessor,
  MemcmpReadAccessor,
  FileTransferReadAccessor,
  MachineCodePoolMiddleware,
  ScannerMiddleware,
  BootstrapHostAccessor,
} from './middleware-accessor.js';
import { type ISyncCallableMemoryAccessor } from './iaccessor.js';

/**
 * Pre-configured Indirect Accessor template.
 * Combines IndirectCallRedirectorAccessor, MemsetWriteAccessor, MemcmpReadAccessor,
 * FileTransferWriteAccessor, FileTransferReadAccessor, and MarshallingCallableAccessor
 * to provide a fully silent, type-marshalled memory execution pipeline.
 *
 * `backend` is required and must be an already-constructed `ISyncCallableMemoryAccessor`
 * (e.g. an `NThread` for proper multi-argument calls, or a bare
 * `RemoteCallableMemoryAccessor` if you explicitly want its single-argument-only
 * `CreateRemoteThread`-per-call mechanism). There is no pid-only overload that
 * silently defaults to `RemoteCallableMemoryAccessor` -- that implicit default let
 * `MsvcrtDependentMiddlewareAccessor.onInit()`'s `isModuleLoadedInProcess()` call
 * (3 arguments) run over a backend that only delivers the first argument via
 * `CreateRemoteThread`'s single `lpParameter`, leaving the output pointer
 * (`GetModuleHandleExA`'s `phModule`) as leftover register garbage -- an
 * intermittent `wine: Unhandled page fault` when that garbage isn't a writable
 * address. Picking the backend explicitly at every call site makes that
 * tradeoff visible instead of an accidental default.
 */
export class IndirectCallableAccessor extends HostAccessor {
  private bootstrapRoot: BootstrapHostAccessor;

  constructor(backend: ISyncCallableMemoryAccessor) {
    const pid = backend.processId;
    super(new ThrowingMemoryAccessor(pid));

    const bootstrap = new BootstrapHostAccessor(pid, this);
    this.bootstrapRoot = bootstrap;

    bootstrap.backend = backend;

    const redirector = new IndirectCallRedirectorAccessor(backend, bootstrap);
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
    let b: MiddlewareAccessor | ISyncCallableMemoryAccessor = marshalling;
    while (b && b instanceof MiddlewareAccessor) {
      b = b.backend;
    }
    if (b) {
      this._processId = b.processId;
    }
  }

  protected override async onInit(): Promise<void> {
    await this.bootstrapRoot.init();
  }
}
