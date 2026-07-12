import { expect, test, describe, afterAll } from 'bun:test';
import * as Native from 'bun-winapi';
import { Kernel32Impl, FileMapAccess } from 'bun-xffi';
import { IndirectNThreadHostAccessor } from 'bun-nthread';
import { createSharedMemory, closeGlobalDummyProcess } from 'bun-nshm';
import { TestProcess } from '../helpers.js';

// Proves the full handle-relay flow: this (Bun) process never OpenProcess's
// the target directly -- only the dummy process it spawns itself. The
// target's only job is CreateFileMappingA + OpenProcess/DuplicateHandle to
// hand the mapping to the (already-running) dummy. Driven through
// IndirectNThreadHostAccessor (an already-live, hijacked thread in the
// target) per CLAUDE.md's guidance on real WinAPI/CRT calls
// (CreateFileMappingA/OpenProcess/DuplicateHandle) never running on a
// freshly-created thread under Wine/GHA.
describe('nshm > createSharedMemory (handle relay via a single shared dummy process)', () => {
  afterAll(() => {
    closeGlobalDummyProcess();
  });

  test('shares memory between the target process and this process without OpenProcess on the target', async () => {
    const target = new TestProcess();
    const thread = Native.Thread.getThreads(target.pid)[0];
    if (!thread) throw new Error('No thread found in the spawned process');

    const memory = new IndirectNThreadHostAccessor(target.pid, thread.tid, {
      timeoutMs: 20000,
    });

    const shm = await createSharedMemory(memory, { size: 4096 });

    try {
      expect(shm.localView).toBeGreaterThan(0);
      expect(shm.dummyPid).toBeGreaterThan(0);
      expect(shm.dummyPid).not.toBe(target.pid);

      // The target already owns `hMapping` directly (it created it), so it
      // can map its own view without going through the relay -- used here
      // purely to independently verify the two processes see the same
      // physical pages, not as part of the relay mechanism itself.
      const mapAccess = FileMapAccess.combine(
        FileMapAccess.READ,
        FileMapAccess.WRITE,
      );
      const targetView = Number(
        await memory.call(
          Kernel32Impl.MapViewOfFile,
          shm.targetMappingHandle,
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
    } finally {
      shm.close();
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
