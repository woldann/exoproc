import { expect, test, describe } from 'bun:test';
import {
  CallRedirectorAccessor,
  IndirectCallRedirectorAccessor,
  RemoteCallableMemoryAccessor,
  BootstrapHostAccessor,
  HostAccessor,
  ThrowingMemoryAccessor,
  MemoryState,
  MemoryProtection,
  IndirectCallableAccessor,
  resolveAddress,
} from '../../packages/xffi/src/index.js';
import { TestProcess } from '../helpers.js';

describe('xffi > CallRedirectorAccessor', () => {
  test('should seamlessly redirect all memory operations to remote call execution', async () => {
    // 1. Spawn a ping process that runs for 20 seconds
    const tp = new TestProcess();
    const { pid } = tp;

    try {
      // 2. Compose our decorator chain (mirrors IndirectCallableAccessor construction):
      // accessor (CallRedirectorAccessor) -> baseAccessor
      // bootstrap acts as root: during init it routes directly to baseAccessor (bypassing
      // CallRedirectorAccessor), after init it routes through the full chain via outerHost.
      const baseAccessor = new RemoteCallableMemoryAccessor(pid);
      const outerHost = new HostAccessor(new ThrowingMemoryAccessor(pid));
      const bootstrap = new BootstrapHostAccessor(pid, outerHost);
      bootstrap.backend = baseAccessor;
      const accessor = new CallRedirectorAccessor(baseAccessor, bootstrap);
      outerHost.backend = accessor;

      try {
        // 3. Test remote alloc (runs VirtualAlloc in target process via a remote call)
        const size = 1024;
        const remoteAddr = await accessor.alloc(size);
        expect(remoteAddr).toBeDefined();
        expect(Number(remoteAddr)).toBeGreaterThan(0);

        // 4. Test write and read (delegates normally, ensuring data gets written/read)
        const testData = Buffer.from('Inter-process Redirector Test String!');
        await accessor.write(remoteAddr, testData);

        const readData = await accessor.read(remoteAddr, testData.byteLength);
        expect(readData.toString()).toBe(testData.toString());

        // 5. Test remote protect (runs VirtualProtect in target process via call + temp alloc/read/free)
        const oldProtect = await accessor.protect(
          remoteAddr,
          size,
          MemoryProtection.READONLY,
        );
        expect(oldProtect).toBe(MemoryProtection.READWRITE);

        // 6. Test remote query (runs VirtualQuery in target process via call + temp alloc/read/free)
        const info = await accessor.query(remoteAddr);

        expect(info).toBeDefined();
        expect(Number(info.BaseAddress)).toBe(Number(remoteAddr));
        expect(info.Protect).toBe(MemoryProtection.READONLY);
        expect(info.State).toBe(MemoryState.COMMIT);

        // 7. Test remote free (runs VirtualFree in target process via call)
        const freeSuccess = await accessor.free(remoteAddr);
        expect(freeSuccess).toBe(true);
      } finally {
        accessor.close();
      }
    } finally {
      // Cleanup spawned ping process
      await tp.stop();
    }
  }, 20000);

  test('allocNear runs its whole probe+alloc search inside the target via call', async () => {
    const tp = new TestProcess();
    const { pid } = tp;

    try {
      const baseAccessor = new RemoteCallableMemoryAccessor(pid);
      const outerHost = new HostAccessor(new ThrowingMemoryAccessor(pid));
      const bootstrap = new BootstrapHostAccessor(pid, outerHost);
      bootstrap.backend = baseAccessor;
      const accessor = new CallRedirectorAccessor(baseAccessor, bootstrap);
      outerHost.backend = accessor;

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
        accessor.close();
      }
    } finally {
      await tp.stop();
    }
  }, 20000);

  test('should seamlessly route READWRITE allocations via malloc and mock query/protect under IndirectCallRedirectorAccessor', async () => {
    // 1. Spawn a ping process that runs for 20 seconds
    const tp = new TestProcess();
    const { pid } = tp;

    try {
      // 2. Compose our indirect decorator chain (mirrors IndirectCallableAccessor construction):
      const baseAccessor = new RemoteCallableMemoryAccessor(pid);
      const outerHost = new HostAccessor(new ThrowingMemoryAccessor(pid));
      const bootstrap = new BootstrapHostAccessor(pid, outerHost);
      bootstrap.backend = baseAccessor;
      const accessor = new IndirectCallRedirectorAccessor(
        baseAccessor,
        bootstrap,
      );
      outerHost.backend = accessor;

      try {
        // 3. Test indirect remote alloc (READWRITE is allocated via malloc)
        const size = 512;
        const remoteAddr = await accessor.alloc(size); // Default protection is READWRITE
        expect(remoteAddr).toBeDefined();
        expect(Number(remoteAddr)).toBeGreaterThan(0);

        // 4. Test write and read on the heap memory allocated via malloc
        const testData = Buffer.from('Virtual Malloc Memory Test String!');
        await accessor.write(remoteAddr, testData);

        const readData = await accessor.read(remoteAddr, testData.byteLength);
        expect(readData.toString()).toBe(testData.toString());

        // 5. Test protect error throwing (protecting malloc heap memory to anything else should throw)
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

        // 6. Test query mocking (returns locally mocked MBI instantly, bypassing VirtualQuery call!)
        const info = await accessor.query(remoteAddr);
        expect(info).toBeDefined();
        expect(Number(info.BaseAddress)).toBe(Number(remoteAddr));
        expect(info.Protect).toBe(MemoryProtection.READWRITE);
        expect(Number(info.RegionSize)).toBe(size);
        expect(info.State).toBe(MemoryState.COMMIT);

        // 7. Test remote free (runs free in target process via call)
        const freeSuccess = await accessor.free(remoteAddr);
        expect(freeSuccess).toBe(true);

        // 8. Test fallback behaviour: non-READWRITE (e.g. EXECUTE_READWRITE) should fall back to VirtualAlloc
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
        accessor.close();
      }
    } finally {
      await tp.stop();
    }
  }, 20000);

  test('should seamlessly execute using the pre-configured IndirectCallableAccessor template', async () => {
    // 1. Spawn a ping process
    const tp = new TestProcess();
    const { pid } = tp;

    try {
      const accessor = new IndirectCallableAccessor(pid);

      try {
        // 2. Test indirect allocations via root (which maps to malloc and memset writes)
        const size = 512;
        const remoteAddr = await accessor.alloc(size);
        expect(remoteAddr).toBeDefined();
        expect(Number(remoteAddr)).toBeGreaterThan(0);

        // 3. Test writing to the allocated address using memset writes
        const testData = Buffer.from('Hello Indirect Prepackaged Accessor!');
        await accessor.write(remoteAddr, testData);

        const baseAccessor = new RemoteCallableMemoryAccessor(pid);
        const readData = await baseAccessor.read(
          remoteAddr,
          testData.byteLength,
        );
        expect(readData.toString()).toBe(testData.toString());

        // Calling read on the indirect accessor should now work via FileTransferReadAccessor
        const readDataIndirect = await accessor.read(
          remoteAddr,
          testData.byteLength,
        );
        expect(readDataIndirect.toString()).toBe(testData.toString());

        // 4. Clean up
        const freeSuccess = await accessor.free(remoteAddr);
        expect(freeSuccess).toBe(true);
      } finally {
        accessor.close();
      }
    } finally {
      await tp.stop();
    }
  }, 60000);
});
