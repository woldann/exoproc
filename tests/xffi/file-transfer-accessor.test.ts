import { expect, test, describe } from 'bun:test';
import {
  FileTransferReadAccessor,
  FileTransferWriteAccessor,
  NamedPipeCallableAccessor,
  RemoteCallableMemoryAccessor,
  HostAccessor,
} from '../../packages/xffi/src/index.js';
import { TestProcess } from '../helpers.js';

describe('xffi > FileTransferAccessors', () => {
  test('should read memory via FileTransferReadAccessor independently', async () => {
    const tp = new TestProcess();
    const { pid } = tp;

    try {
      const baseAccessor = new RemoteCallableMemoryAccessor(pid, {
        handle: tp.handle,
        closeHandle: false,
      });
      const host = new HostAccessor(baseAccessor);
      const pipeAccessor = new NamedPipeCallableAccessor(baseAccessor, host);
      const accessor = new FileTransferReadAccessor(pipeAccessor, host);
      host.backend = accessor;

      try {
        await host.init();

        const size = 1024;
        const remoteAddr = await accessor.alloc(size);
        expect(remoteAddr).toBeDefined();
        expect(Number(remoteAddr)).toBeGreaterThan(0);

        // Write directly (routes to NamedPipeCallableAccessor write)
        const testData = Buffer.from('Independent Read Accessor Test!');
        await accessor.write(remoteAddr, testData);

        // Read via file transfer
        const readData = await accessor.read(remoteAddr, testData.byteLength);
        expect(readData.toString()).toBe(testData.toString());

        const freeSuccess = await accessor.free(remoteAddr);
        expect(freeSuccess).toBe(true);
      } finally {
        host.close();
      }
    } finally {
      await tp.stop();
    }
  }, 20000);

  test('should write memory via FileTransferWriteAccessor independently', async () => {
    const tp = new TestProcess();
    const { pid } = tp;

    try {
      const baseAccessor = new RemoteCallableMemoryAccessor(pid, {
        handle: tp.handle,
        closeHandle: false,
      });
      const host = new HostAccessor(baseAccessor);
      const pipeAccessor = new NamedPipeCallableAccessor(baseAccessor, host);
      const accessor = new FileTransferWriteAccessor(pipeAccessor, host);
      host.backend = accessor;

      try {
        await host.init();

        const size = 1024;
        const remoteAddr = await accessor.alloc(size);
        expect(remoteAddr).toBeDefined();
        expect(Number(remoteAddr)).toBeGreaterThan(0);

        // Write via file transfer
        const testData = Buffer.from('Independent Write Accessor Test!');
        await accessor.write(remoteAddr, testData);

        // Read directly (routes to NamedPipeCallableAccessor read)
        const readData = await accessor.read(remoteAddr, testData.byteLength);
        expect(readData.toString()).toBe(testData.toString());

        const freeSuccess = await accessor.free(remoteAddr);
        expect(freeSuccess).toBe(true);
      } finally {
        host.close();
      }
    } finally {
      await tp.stop();
    }
  }, 20000);

  test('should read and write memory via chained FileTransferReadAccessor and FileTransferWriteAccessor', async () => {
    const tp = new TestProcess();
    const { pid } = tp;

    try {
      const baseAccessor = new RemoteCallableMemoryAccessor(pid, {
        handle: tp.handle,
        closeHandle: false,
      });
      const host = new HostAccessor(baseAccessor);
      const pipeAccessor = new NamedPipeCallableAccessor(baseAccessor, host);
      const writeAccessor = new FileTransferWriteAccessor(pipeAccessor, host);
      const accessor = new FileTransferReadAccessor(writeAccessor, host);
      host.backend = accessor;

      try {
        await host.init();

        const size = 1024;
        const remoteAddr = await accessor.alloc(size);
        expect(remoteAddr).toBeDefined();
        expect(Number(remoteAddr)).toBeGreaterThan(0);

        // Write via write file transfer
        const testData = Buffer.from('Chained Read and Write Accessors Test!');
        await accessor.write(remoteAddr, testData);

        // Read via read file transfer
        const readData = await accessor.read(remoteAddr, testData.byteLength);
        expect(readData.toString()).toBe(testData.toString());

        const freeSuccess = await accessor.free(remoteAddr);
        expect(freeSuccess).toBe(true);
      } finally {
        host.close();
      }
    } finally {
      await tp.stop();
    }
  }, 20000);
});
