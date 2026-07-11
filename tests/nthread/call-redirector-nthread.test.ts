import { expect, test, describe } from 'bun:test';
import * as Native from 'bun-winapi';
import { MemoryState, MemoryProtection } from 'bun-xffi';
import { IndirectNThreadHostAccessor } from 'bun-nthread';
import { TestProcess } from '../helpers.js';

// Moved from tests/xffi/call-redirector.test.ts -- CallRedirectorAccessor/
// IndirectCallRedirectorAccessor redirect alloc/free/protect/query through
// `this.root.call(VirtualAlloc/VirtualFree/...)`. Real WinAPI calls like
// VirtualAlloc/malloc need to run on an already-live thread rather than a
// freshly-created CreateRemoteThread thread (see the GHA thread-freshness bug
// in CLAUDE.md), so this drives everything through IndirectNThreadHostAccessor
// (proven wiring: its internal BootstrapHostAccessor.backend is set correctly
// by IndirectCallableAccessor's own constructor) instead of hand-rolling a
// RedirectorHostAccessor here, which is exactly where an earlier version of
// this file lost a `.backend` assignment and crashed.
//
// The standalone allocNear case is dropped -- it's already covered by
// tests/nthread/indirect-nthread-host-accessor.test.ts's own allocNear test
// against the same IndirectNThreadHostAccessor chain.
describe('nthread > CallRedirectorAccessor/IndirectCallRedirectorAccessor over IndirectNThreadHostAccessor', () => {
  test('should seamlessly route READWRITE allocations via malloc, and non-READWRITE via real VirtualAlloc/VirtualProtect/VirtualQuery/VirtualFree', async () => {
    const tp = new TestProcess();
    const thread = Native.Thread.getThreads(tp.pid)[0];
    if (!thread) throw new Error('No thread found in the spawned process');

    const accessor = new IndirectNThreadHostAccessor(tp.pid, thread.tid, {
      timeoutMs: 20000,
    });

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

      // 6. Test fallback behaviour: non-READWRITE (e.g. EXECUTE_READWRITE) falls back to
      // the real, non-mocked path -- genuine VirtualAlloc/VirtualProtect/VirtualQuery/VirtualFree
      // via `this.root.call`, all executed on the hijacked thread.
      const execAddr = await accessor.alloc(
        size,
        null,
        MemoryProtection.EXECUTE_READWRITE,
      );
      expect(execAddr).toBeDefined();
      expect(Number(execAddr)).toBeGreaterThan(0);

      const execInfo = await accessor.query(execAddr);
      expect(execInfo.Protect).toBe(MemoryProtection.EXECUTE_READWRITE);

      const oldProtect = await accessor.protect(
        execAddr,
        size,
        MemoryProtection.READONLY,
      );
      expect(oldProtect).toBe(MemoryProtection.EXECUTE_READWRITE);

      const execFree = await accessor.free(execAddr);
      expect(execFree).toBe(true);
    } finally {
      await accessor.deinit();
      await tp.stop();
    }
  }, 60000);
});
