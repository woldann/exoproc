import { expect, test, describe } from 'bun:test';
import {
  FileTransferWriteAccessor,
  NamedPipeCallableAccessor,
  RemoteCallableMemoryAccessor,
  HostAccessor,
} from '../../packages/xffi/src/index.js';
import { TestProcess } from '../helpers.js';

describe('xffi > FileTransferWriteAccessor', () => {
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

        // Read directly
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
