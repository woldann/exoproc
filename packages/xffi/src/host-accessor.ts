import {
  MiddlewareAccessor,
  ThrowingMemoryAccessor,
  NamedPipeCallableAccessor,
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
import { type ICallableMemoryAccessor } from './iaccessor.js';
import { RemoteCallableMemoryAccessor } from './callable-accessor.js';

/**
 * Pre-configured Indirect Accessor template.
 * Combines IndirectCallRedirectorAccessor, MemsetWriteAccessor, MemcmpReadAccessor,
 * FileTransferWriteAccessor, FileTransferReadAccessor, and MarshallingCallableAccessor
 * to provide a fully silent, type-marshalled memory execution pipeline.
 */
export class IndirectCallableAccessor extends HostAccessor {
  private bootstrapRoot: BootstrapHostAccessor;

  constructor(processIdOrBackend?: number | ICallableMemoryAccessor) {
    let pid = -1;
    if (processIdOrBackend !== undefined) {
      if (typeof processIdOrBackend === 'number') {
        pid = processIdOrBackend;
      } else {
        pid = processIdOrBackend.processId;
      }
    }
    super(new ThrowingMemoryAccessor(pid));

    const bootstrap = new BootstrapHostAccessor(pid, this);
    this.bootstrapRoot = bootstrap;

    let initialBackend: ICallableMemoryAccessor;

    if (processIdOrBackend !== undefined) {
      if (typeof processIdOrBackend === 'number') {
        initialBackend = new NamedPipeCallableAccessor(
          new RemoteCallableMemoryAccessor(processIdOrBackend),
          bootstrap,
        );
      } else {
        initialBackend = processIdOrBackend;
      }
    } else {
      initialBackend = new NamedPipeCallableAccessor(
        new RemoteCallableMemoryAccessor(-1),
        bootstrap,
      );
    }

    bootstrap.backend = initialBackend;

    const redirector = new IndirectCallRedirectorAccessor(
      initialBackend,
      bootstrap,
    );
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
    let b: MiddlewareAccessor | ICallableMemoryAccessor = marshalling;
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
