import { expect, test, describe } from 'bun:test';
import * as Native from 'bun-winapi';
import {
  FileTransferReadAccessor,
  FileTransferWriteAccessor,
  RedirectorHostAccessor,
  HostAccessor,
} from 'bun-xffi';
import { NThread, type NThreadOptions } from 'bun-nthread';
import { TestProcess } from '../helpers.js';

// Moved from tests/xffi/file-transfer-accessor.test.ts and write-only.test.ts
// (which was a literal duplicate of one case here, dropped). FileTransferReadAccessor/
// FileTransferWriteAccessor's onInit calls `this.root.call(MsvcrtImpl.fopen, ...)`,
// a real CRT call that needs to run on an already-live thread rather than a
// freshly-created CreateRemoteThread thread (see the GHA thread-freshness bug
// in CLAUDE.md), so the backend is NThread instead of a bare RemoteCallableMemoryAccessor.
describe('nthread > FileTransferAccessors over NThread', () => {
  function makeNThread(pid: number, tid: number): NThread {
    const redirector = new RedirectorHostAccessor(pid);
    const options: NThreadOptions = { timeoutMs: 15000 };
    const nthread = new NThread(pid, tid, options, redirector);
    redirector.target = new HostAccessor(nthread);
    return nthread;
  }

  test('should read memory via FileTransferReadAccessor independently', async () => {
    const tp = new TestProcess();
    const thread = Native.Thread.getThreads(tp.pid)[0];
    if (!thread) throw new Error('No thread found in the spawned process');

    const nthread = makeNThread(tp.pid, thread.tid);
    const host = new HostAccessor(nthread);
    const accessor = new FileTransferReadAccessor(nthread, host);
    host.backend = accessor;

    try {
      const size = 1024;
      const remoteAddr = await accessor.alloc(size);
      expect(remoteAddr).toBeDefined();
      expect(Number(remoteAddr)).toBeGreaterThan(0);

      // Write directly (routes to the base NThread write)
      const testData = Buffer.from('Independent Read Accessor Test!');
      await accessor.write(remoteAddr, testData);

      // Read via file transfer
      const readData = await accessor.read(remoteAddr, testData.byteLength);
      expect(readData.toString()).toBe(testData.toString());

      const freeSuccess = await accessor.free(remoteAddr);
      expect(freeSuccess).toBe(true);
    } finally {
      await host.deinit();
      await tp.stop();
    }
  }, 30000);

  test('should write memory via FileTransferWriteAccessor independently', async () => {
    const tp = new TestProcess();
    const thread = Native.Thread.getThreads(tp.pid)[0];
    if (!thread) throw new Error('No thread found in the spawned process');

    const nthread = makeNThread(tp.pid, thread.tid);
    const host = new HostAccessor(nthread);
    const accessor = new FileTransferWriteAccessor(nthread, host);
    host.backend = accessor;

    try {
      const size = 1024;
      const remoteAddr = await accessor.alloc(size);
      expect(remoteAddr).toBeDefined();
      expect(Number(remoteAddr)).toBeGreaterThan(0);

      // Write via file transfer
      const testData = Buffer.from('Independent Write Accessor Test!');
      await accessor.write(remoteAddr, testData);

      // Read directly (routes to the base NThread read)
      const readData = await accessor.read(remoteAddr, testData.byteLength);
      expect(readData.toString()).toBe(testData.toString());

      const freeSuccess = await accessor.free(remoteAddr);
      expect(freeSuccess).toBe(true);
    } finally {
      await host.deinit();
      await tp.stop();
    }
  }, 30000);

  test('should read and write memory via chained FileTransferReadAccessor and FileTransferWriteAccessor', async () => {
    const tp = new TestProcess();
    const thread = Native.Thread.getThreads(tp.pid)[0];
    if (!thread) throw new Error('No thread found in the spawned process');

    const nthread = makeNThread(tp.pid, thread.tid);
    const host = new HostAccessor(nthread);
    const writeAccessor = new FileTransferWriteAccessor(nthread, host);
    const accessor = new FileTransferReadAccessor(writeAccessor, host);
    host.backend = accessor;

    try {
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
      await host.deinit();
      await tp.stop();
    }
  }, 30000);
});
