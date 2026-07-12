import { expect, test, describe, afterAll } from 'bun:test';
import * as Native from 'bun-winapi';
import { Kernel32Impl, FileMapAccess } from 'bun-xffi';
import { IndirectNThreadHostAccessor } from 'bun-nthread';
import { createSharedMemory, closeGlobalDummyProcess } from 'bun-nshm';
import { TestProcess } from '../helpers.js';

// Proves the full handle-relay flow: this (Bun) process never OpenProcess's
// the target directly -- only the dummy process it spawns itself. The
// target's own CreateFileMappingA/OpenProcess handles are both closed again
// inside createSharedMemory itself, so nothing is left open in the target
// once it returns -- only this process's own local mapping/view (Nshm.close)
// remains the caller's responsibility. Driven through
// IndirectNThreadHostAccessor (an already-live, hijacked thread in the
// target) per CLAUDE.md's guidance on real WinAPI/CRT calls
// (CreateFileMappingA/OpenProcess/DuplicateHandle) never running on a
// freshly-created thread under Wine/GHA.
describe('nshm > createSharedMemory (handle relay via a single shared dummy process)', () => {
  afterAll(() => {
    closeGlobalDummyProcess();
  });

  test('shares memory between target and this process, with nothing left open in the target', async () => {
    const target = new TestProcess();
    const thread = Native.Thread.getThreads(target.pid)[0];
    if (!thread) throw new Error('No thread found in the spawned process');

    const memory = new IndirectNThreadHostAccessor(target.pid, thread.tid, {
      timeoutMs: 20000,
    });

    const name = `nshm-test-${target.pid}-${Date.now()}`;
    const shm = await createSharedMemory(memory, { size: 4096, name });

    try {
      expect(shm.localView).toBeGreaterThan(0);
      expect(shm.dummyPid).toBeGreaterThan(0);
      expect(shm.dummyPid).not.toBe(target.pid);

      // createSharedMemory already closed the target's own CreateFileMappingA
      // handle by the time it returns, so re-opening the section *by name*
      // from inside the target proves two things at once: the section is
      // still alive (kept alive only by the dummy's/this process's own
      // duplicates, not anything left in the target), and the two processes
      // really do share the same physical pages.
      const nameBuf = Buffer.from(name + '\0', 'latin1');
      const nameAddr = await memory.alloc(nameBuf.byteLength);
      await memory.write(nameAddr, nameBuf);

      const mapAccess = FileMapAccess.combine(
        FileMapAccess.READ,
        FileMapAccess.WRITE,
      );
      const hReopened = await memory.call(
        Kernel32Impl.OpenFileMappingA,
        mapAccess,
        0,
        nameAddr,
      );
      expect(Number(hReopened)).toBeGreaterThan(0);

      const targetView = Number(
        await memory.call(
          Kernel32Impl.MapViewOfFile,
          hReopened,
          mapAccess,
          0,
          0,
          shm.size,
        ),
      );
      expect(targetView).toBeGreaterThan(0);

      // Local -> target
      const marker1 = Buffer.from('nshm-local-to-target!\0');
      shm.write(marker1);
      const seenInTarget = await memory.read(targetView, marker1.byteLength);
      expect(seenInTarget.toString()).toBe(marker1.toString());

      // Target -> local
      const marker2 = Buffer.from('nshm-target-to-local!\0');
      await memory.write(targetView, marker2);
      const seenLocally = shm.read(marker2.byteLength);
      expect(seenLocally.toString()).toBe(marker2.toString());

      await memory.call(Kernel32Impl.UnmapViewOfFile, targetView);
      await memory.call(Kernel32Impl.CloseHandle, hReopened);
    } finally {
      shm.close();
      await memory.deinit();
      await target.stop();
    }
  }, 60000);

  test('supports multiple independent shared memory regions on the same target', async () => {
    const target = new TestProcess();
    const thread = Native.Thread.getThreads(target.pid)[0];
    if (!thread) throw new Error('No thread found in the spawned process');

    const memory = new IndirectNThreadHostAccessor(target.pid, thread.tid, {
      timeoutMs: 20000,
    });

    const shm1 = await createSharedMemory(memory, { size: 4096 });
    const shm2 = await createSharedMemory(memory, { size: 4096 });

    try {
      expect(shm1.localMappingHandle).not.toBe(shm2.localMappingHandle);
      expect(shm1.localView).not.toBe(shm2.localView);
      // Same target, same shared dummy.
      expect(shm2.dummyPid).toBe(shm1.dummyPid);

      shm1.write(Buffer.from('region-one'));
      shm2.write(Buffer.from('region-two'));
      expect(shm1.read(10).toString()).toBe('region-one');
      expect(shm2.read(10).toString()).toBe('region-two');
    } finally {
      shm1.close();
      shm2.close();
      await memory.deinit();
      await target.stop();
    }
  }, 60000);

  test('reuses the same global dummy process across different targets and regions', async () => {
    const targetA = new TestProcess();
    const targetB = new TestProcess();
    const threadA = Native.Thread.getThreads(targetA.pid)[0];
    const threadB = Native.Thread.getThreads(targetB.pid)[0];
    if (!threadA || !threadB)
      throw new Error('No thread found in a spawned process');

    const memoryA = new IndirectNThreadHostAccessor(targetA.pid, threadA.tid, {
      timeoutMs: 20000,
    });
    const memoryB = new IndirectNThreadHostAccessor(targetB.pid, threadB.tid, {
      timeoutMs: 20000,
    });

    const shmA = await createSharedMemory(memoryA, { size: 4096 });
    const shmB = await createSharedMemory(memoryB, { size: 4096 });

    try {
      // Two different regions, two different targets -- one shared dummy.
      expect(shmB.dummyPid).toBe(shmA.dummyPid);
      expect(shmB.localDummyHandle).toBe(shmA.localDummyHandle);
      expect(shmA.localMappingHandle).not.toBe(shmB.localMappingHandle);
    } finally {
      shmA.close();
      shmB.close();
      await memoryA.deinit();
      await memoryB.deinit();
      await targetA.stop();
      await targetB.stop();
    }
  }, 90000);
});
