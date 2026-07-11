import { expect, test, describe } from 'bun:test';
import * as Native from 'bun-winapi';
import {
  CallRedirectorAccessor,
  IndirectCallRedirectorAccessor,
  RedirectorHostAccessor,
  HostAccessor,
  MemoryState,
  MemoryProtection,
  resolveAddress,
} from 'bun-xffi';
import { NThread } from 'bun-nthread';
import { TestProcess } from '../helpers.js';

// Moved from tests/xffi/call-redirector.test.ts -- CallRedirectorAccessor/
// IndirectCallRedirectorAccessor redirect alloc/free/protect/query through
// `this.root.call(VirtualAlloc/VirtualFree/...)`. Real WinAPI calls like
// VirtualAlloc/malloc need to run on an already-live thread rather than a
// freshly-created CreateRemoteThread thread (see the GHA thread-freshness bug
// in CLAUDE.md), so the backend here is NThread (hijacks an existing thread)
// instead of a bare RemoteCallableMemoryAccessor.
describe('nthread > CallRedirectorAccessor over NThread', () => {
  test('should seamlessly redirect all memory operations to remote call execution', async () => {
    const tp = new TestProcess();
    const thread = Native.Thread.getThreads(tp.pid)[0];
    if (!thread) throw new Error('No thread found in the spawned process');

    const redirector = new RedirectorHostAccessor(tp.pid);
    const nthread = new NThread(
      tp.pid,
      thread.tid,
      { timeoutMs: 20000 },
      redirector,
    );
    const accessor = new CallRedirectorAccessor(nthread, redirector);
    // RedirectorHostAccessor only routes the top-level async ops (read/write/
    // alloc/.../call) through `target` -- the sync scalar helpers inherited
    // from AbstractSyncMemoryAccessor (readUInt32Sync -> readSync, used by
    // CallRedirectorAccessor.protect()) bypass `target` and go straight to
    // `this.backend`, which defaults to a throwing dummy. Must wire both.
    redirector.backend = nthread;
    redirector.target = new HostAccessor(nthread);

    try {
      // 1. Test remote alloc (runs VirtualAlloc in target process via a redirected call)
      const size = 1024;
      const remoteAddr = await accessor.alloc(size);
      expect(remoteAddr).toBeDefined();
      expect(Number(remoteAddr)).toBeGreaterThan(0);

      // 2. Test write and read (delegates normally, ensuring data gets written/read)
      const testData = Buffer.from('Inter-process Redirector Test String!');
      await accessor.write(remoteAddr, testData);

      const readData = await accessor.read(remoteAddr, testData.byteLength);
      expect(readData.toString()).toBe(testData.toString());

      // 3. Test remote protect (runs VirtualProtect in target process via call + temp alloc/read/free)
      const oldProtect = await accessor.protect(
        remoteAddr,
        size,
        MemoryProtection.READONLY,
      );
      expect(oldProtect).toBe(MemoryProtection.READWRITE);

      // 4. Test remote query (runs VirtualQuery in target process via call + temp alloc/read/free)
      const info = await accessor.query(remoteAddr);

      expect(info).toBeDefined();
      expect(Number(info.BaseAddress)).toBe(Number(remoteAddr));
      expect(info.Protect).toBe(MemoryProtection.READONLY);
      expect(info.State).toBe(MemoryState.COMMIT);

      // 5. Test remote free (runs VirtualFree in target process via call)
      const freeSuccess = await accessor.free(remoteAddr);
      expect(freeSuccess).toBe(true);
    } finally {
      await nthread.deinit();
      await tp.stop();
    }
  }, 30000);

  test('allocNear runs its whole probe+alloc search inside the target via call', async () => {
    const tp = new TestProcess();
    const thread = Native.Thread.getThreads(tp.pid)[0];
    if (!thread) throw new Error('No thread found in the spawned process');

    const redirector = new RedirectorHostAccessor(tp.pid);
    const nthread = new NThread(
      tp.pid,
      thread.tid,
      { timeoutMs: 20000 },
      redirector,
    );
    const accessor = new CallRedirectorAccessor(nthread, redirector);
    redirector.backend = nthread;
    redirector.target = new HostAccessor(nthread);

    try {
      // An anchor address that lives inside ping.exe -- allocated via the
      // redirector, so it's VirtualAlloc *in the target*, not VirtualAllocEx
      // reaching in from our process.
      const anchor = await accessor.alloc(
        0x1000,
        null,
        MemoryProtection.EXECUTE_READWRITE,
      );
      const anchorAddr = BigInt(resolveAddress(anchor));

      // allocNear drives its entire region-walk through the same remote
      // call path (VirtualQuery/VirtualAlloc in the target), never touching
      // our own address space.
      const near = await accessor.allocNear(anchor, 64, {
        protection: MemoryProtection.EXECUTE_READWRITE,
      });
      const nearAddr = BigInt(resolveAddress(near));
      expect(nearAddr).toBeGreaterThan(0n);

      // Landed within a 5-byte rel32 jmp's reach of the anchor.
      const distance =
        nearAddr > anchorAddr ? nearAddr - anchorAddr : anchorAddr - nearAddr;
      expect(distance <= 0x7fff0000n).toBe(true);

      // And it genuinely exists in the target: a remote VirtualQuery reports
      // a committed, executable region based exactly at the returned address.
      const info = await accessor.query(near);
      expect(Number(info.BaseAddress)).toBe(Number(near));
      expect(info.State).toBe(MemoryState.COMMIT);
      expect(info.Protect).toBe(MemoryProtection.EXECUTE_READWRITE);

      expect(await accessor.free(near)).toBe(true);
      expect(await accessor.free(anchor)).toBe(true);
    } finally {
      await nthread.deinit();
      await tp.stop();
    }
  }, 60000);

  test('should seamlessly route READWRITE allocations via malloc and mock query/protect under IndirectCallRedirectorAccessor', async () => {
    const tp = new TestProcess();
    const thread = Native.Thread.getThreads(tp.pid)[0];
    if (!thread) throw new Error('No thread found in the spawned process');

    const redirector = new RedirectorHostAccessor(tp.pid);
    const nthread = new NThread(
      tp.pid,
      thread.tid,
      { timeoutMs: 20000 },
      redirector,
    );
    const accessor = new IndirectCallRedirectorAccessor(nthread, redirector);
    redirector.backend = nthread;
    redirector.target = new HostAccessor(nthread);

    try {
      // 1. Test indirect remote alloc (READWRITE is allocated via malloc)
      const size = 512;
      const remoteAddr = await accessor.alloc(size); // Default protection is READWRITE
      expect(remoteAddr).toBeDefined();
      expect(Number(remoteAddr)).toBeGreaterThan(0);

      // 2. Test write and read on the heap memory allocated via malloc
      const testData = Buffer.from('Virtual Malloc Memory Test String!');
      await accessor.write(remoteAddr, testData);

      const readData = await accessor.read(remoteAddr, testData.byteLength);
      expect(readData.toString()).toBe(testData.toString());

      // 3. Test protect error throwing (protecting malloc heap memory to anything else should throw)
      expect(
        accessor.protect(remoteAddr, size, MemoryProtection.READONLY),
      ).rejects.toThrow();

      // But changing it to READWRITE should be accepted silently as a no-op
      const selfProtect = await accessor.protect(
        remoteAddr,
        size,
        MemoryProtection.READWRITE,
      );
      expect(selfProtect).toBe(MemoryProtection.READWRITE);

      // 4. Test query mocking (returns locally mocked MBI instantly, bypassing VirtualQuery call!)
      const info = await accessor.query(remoteAddr);
      expect(info).toBeDefined();
      expect(Number(info.BaseAddress)).toBe(Number(remoteAddr));
      expect(info.Protect).toBe(MemoryProtection.READWRITE);
      expect(Number(info.RegionSize)).toBe(size);
      expect(info.State).toBe(MemoryState.COMMIT);

      // 5. Test remote free (runs free in target process via call)
      const freeSuccess = await accessor.free(remoteAddr);
      expect(freeSuccess).toBe(true);

      // 6. Test fallback behaviour: non-READWRITE (e.g. EXECUTE_READWRITE) should fall back to VirtualAlloc
      const execAddr = await accessor.alloc(
        size,
        null,
        MemoryProtection.EXECUTE_READWRITE,
      );
      expect(execAddr).toBeDefined();
      expect(Number(execAddr)).toBeGreaterThan(0);

      const execInfo = await accessor.query(execAddr);
      expect(execInfo.Protect).toBe(MemoryProtection.EXECUTE_READWRITE);

      const execFree = await accessor.free(execAddr);
      expect(execFree).toBe(true);
    } finally {
      await nthread.deinit();
      await tp.stop();
    }
  }, 60000);
});
