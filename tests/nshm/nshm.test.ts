import { expect, test, describe, afterAll } from 'bun:test';
import * as Native from 'bun-winapi';
import { Kernel32Impl } from 'bun-xffi';
import { IndirectNThreadHostAccessor } from 'bun-nthread';
import { createSharedMemory, closeGlobalDummyProcess } from 'bun-nshm';
import { TestProcess } from '../helpers.js';

// Proves the full handle-relay flow: this (Bun) process never OpenProcess's
// the target directly -- only the dummy process it spawns itself. Target,
// dummy, and this process all end up with a handle to the same section, but
// only the target and this process actually map+use a view of it -- the
// dummy is a pure relay vessel, so its own transit copy is closed
// automatically. The target's mapping handle/view are its real deliverable
// (kept open on return), not relay plumbing -- only the OpenProcess handle
// used to reach the dummy is closed automatically inside the target.
// Driven through IndirectNThreadHostAccessor (an already-live, hijacked
// thread in the target) per CLAUDE.md's guidance on real WinAPI/CRT calls
// (CreateFileMappingA/OpenProcess/DuplicateHandle) never running on a
// freshly-created thread under Wine/GHA.
describe('nshm > createSharedMemory (handle relay via a single shared dummy process)', () => {
  afterAll(() => {
    closeGlobalDummyProcess();
  });

  test('shares a genuinely usable mapping/view with both the target and this process', async () => {
    const target = new TestProcess();
    const thread = Native.Thread.getThreads(target.pid)[0];
    if (!thread) throw new Error('No thread found in the spawned process');

    const memory = new IndirectNThreadHostAccessor(target.pid, thread.tid, {
      timeoutMs: 20000,
    });

    const shm = await createSharedMemory(memory, { size: 4096 });

    try {
      expect(shm.localView).toBeGreaterThan(0);
      expect(shm.targetView).toBeGreaterThan(0);
      expect(shm.dummyPid).toBeGreaterThan(0);
      expect(shm.dummyPid).not.toBe(target.pid);

      // Local -> target
      const marker1 = Buffer.from('nshm-local-to-target!\0');
      shm.write(marker1);
      const seenInTarget = await memory.read(
        shm.targetView,
        marker1.byteLength,
      );
      expect(seenInTarget.toString()).toBe(marker1.toString());

      // Target -> local
      const marker2 = Buffer.from('nshm-target-to-local!\0');
      await memory.write(shm.targetView, marker2);
      const seenLocally = shm.read(marker2.byteLength);
      expect(seenLocally.toString()).toBe(marker2.toString());
    } finally {
      // The target's own view/handle are its real deliverable, not relay
      // plumbing -- createSharedMemory leaves them open, so releasing them
      // (once the target no longer needs the shared memory) is on us here.
      await memory.call(Kernel32Impl.UnmapViewOfFile, shm.targetView);
      await memory.call(Kernel32Impl.CloseHandle, shm.targetMappingHandle);
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
      expect(shm1.targetView).not.toBe(shm2.targetView);
      // Same target, same shared dummy.
      expect(shm2.dummyPid).toBe(shm1.dummyPid);

      shm1.write(Buffer.from('region-one'));
      shm2.write(Buffer.from('region-two'));
      expect(shm1.read(10).toString()).toBe('region-one');
      expect(shm2.read(10).toString()).toBe('region-two');
    } finally {
      await memory.call(Kernel32Impl.UnmapViewOfFile, shm1.targetView);
      await memory.call(Kernel32Impl.CloseHandle, shm1.targetMappingHandle);
      await memory.call(Kernel32Impl.UnmapViewOfFile, shm2.targetView);
      await memory.call(Kernel32Impl.CloseHandle, shm2.targetMappingHandle);
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
      await memoryA.call(Kernel32Impl.UnmapViewOfFile, shmA.targetView);
      await memoryA.call(Kernel32Impl.CloseHandle, shmA.targetMappingHandle);
      await memoryB.call(Kernel32Impl.UnmapViewOfFile, shmB.targetView);
      await memoryB.call(Kernel32Impl.CloseHandle, shmB.targetMappingHandle);
      shmA.close();
      shmB.close();
      await memoryA.deinit();
      await memoryB.deinit();
      await targetA.stop();
      await targetB.stop();
    }
  }, 90000);
});
