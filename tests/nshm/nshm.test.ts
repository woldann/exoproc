import { expect, test, describe, afterAll } from 'bun:test';
import * as Native from 'bun-winapi';
import { Kernel32Impl, HostAccessor } from 'bun-xffi';
import { IndirectNThreadHostAccessor } from 'bun-nthread';
import { NShm, closeGlobalDummyProcess } from 'bun-nshm';
import { TestProcess } from '../helpers.js';

// Proves the full handle-relay flow: this (Bun) process never OpenProcess's
// the target directly -- only the dummy process it spawns itself.
// NShm.alloc() gives back a genuine target-side address; reads/writes
// against that address are transparently redirected to this process's own
// mapped view of the same section instead of the wrapped backend's normal
// remote path. The dummy is a pure relay vessel (its own transit copy is
// closed automatically) and the target's own mapping *handle* is closed
// automatically too, as a side effect of the relay DuplicateHandle
// (DUPLICATE_CLOSE_SOURCE) -- only the mapped view (which stays valid
// without the handle) is the target's real deliverable, so there's no
// target-side CloseHandle call anywhere in this flow, not even for the
// OpenProcess handle used to reach the dummy (left open; see NShm's doc
// comment). Driven through IndirectNThreadHostAccessor (an already-live,
// hijacked thread in the target) per CLAUDE.md's guidance on real
// WinAPI/CRT calls (CreateFileMappingA/OpenProcess/DuplicateHandle) never
// running on a freshly-created thread under Wine/GHA.
describe('nshm > NShm (handle relay via a single shared dummy process)', () => {
  afterAll(async () => {
    await closeGlobalDummyProcess();
  });

  test('shares a genuinely usable mapping/view with both the target and this process', async () => {
    const target = new TestProcess();
    const thread = Native.Thread.getThreads(target.pid)[0];
    if (!thread) throw new Error('No thread found in the spawned process');

    const memory = new IndirectNThreadHostAccessor(target.pid, thread.tid, {
      timeoutMs: 20000,
    });
    const host = new HostAccessor(memory);
    const shm = new NShm(memory, host);

    const addr = await shm.alloc(4096);

    try {
      expect(Number(addr)).toBeGreaterThan(0);

      // Local -> target: shm.write() redirects to the local mapped view
      // (same physical section), so a raw target-side read sees it too.
      const marker1 = Buffer.from('nshm-local-to-target!\0');
      await shm.write(addr, marker1);
      const seenInTarget = await memory.read(addr, marker1.byteLength);
      expect(seenInTarget.toString()).toBe(marker1.toString());

      // Target -> local: a raw target-side write, read back via shm.read()
      // (redirected to the local view -- no cross-process call).
      const marker2 = Buffer.from('nshm-target-to-local!\0');
      await memory.write(addr, marker2);
      const seenLocally = await shm.read(addr, marker2.byteLength);
      expect(seenLocally.toString()).toBe(marker2.toString());
    } finally {
      // The target's own view is its real deliverable, not relay plumbing
      // -- alloc() leaves it mapped, so unmapping it (once the target no
      // longer needs the shared memory) is on us here. shm.free() only
      // releases the *local* side (there's no target-side handle left to
      // close -- alloc() already closed the target's mapping handle itself).
      await memory.call(Kernel32Impl.UnmapViewOfFile, addr);
      await shm.free(addr);
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
    const host = new HostAccessor(memory);
    const shm = new NShm(memory, host);

    const addr1 = await shm.alloc(4096);
    const addr2 = await shm.alloc(4096);

    try {
      expect(addr1).not.toBe(addr2);

      await shm.write(addr1, Buffer.from('region-one'));
      await shm.write(addr2, Buffer.from('region-two'));
      expect((await shm.read(addr1, 10)).toString()).toBe('region-one');
      expect((await shm.read(addr2, 10)).toString()).toBe('region-two');
    } finally {
      await memory.call(Kernel32Impl.UnmapViewOfFile, addr1);
      await memory.call(Kernel32Impl.UnmapViewOfFile, addr2);
      await shm.free(addr1);
      await shm.free(addr2);
      await memory.deinit();
      await target.stop();
    }
  }, 60000);

  test('supports independent NShm instances over different targets, sharing the global dummy', async () => {
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
    const hostA = new HostAccessor(memoryA);
    const hostB = new HostAccessor(memoryB);
    const shmA = new NShm(memoryA, hostA);
    const shmB = new NShm(memoryB, hostB);

    const addrA = await shmA.alloc(4096);
    const addrB = await shmB.alloc(4096);

    try {
      // Two different regions, two different targets, one shared dummy
      // (relayed through internally) -- each region is still fully isolated.
      await shmA.write(addrA, Buffer.from('target-a-data'));
      await shmB.write(addrB, Buffer.from('target-b-data'));
      expect((await shmA.read(addrA, 13)).toString()).toBe('target-a-data');
      expect((await shmB.read(addrB, 13)).toString()).toBe('target-b-data');
    } finally {
      await memoryA.call(Kernel32Impl.UnmapViewOfFile, addrA);
      await memoryB.call(Kernel32Impl.UnmapViewOfFile, addrB);
      await shmA.free(addrA);
      await shmB.free(addrB);
      await memoryA.deinit();
      await memoryB.deinit();
      await targetA.stop();
      await targetB.stop();
    }
  }, 90000);
});
