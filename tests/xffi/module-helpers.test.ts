import { expect, test, describe } from 'bun:test';
import {
  isModuleLoadedInProcess,
  verifyCoreModules,
  RemoteCallableMemoryAccessor,
  Kernel32Impl,
} from '../../packages/xffi/src/index.js';
import { TestProcess } from '../helpers.js';

describe('xffi > Module Loading Helpers', () => {
  test('should check loaded modules in the current process', async () => {
    // 1. Spawn a real target process
    const tp = new TestProcess();
    const { pid } = tp;

    // isModuleLoadedInProcess/verifyCoreModules only need a single call() each
    // (GetModuleHandleExA) -- no need for the full IndirectCallableAccessor
    // chain (malloc/memset/file-transfer), which requires several WinAPI calls
    // executed on a freshly-created CreateRemoteThread thread and is unreliable
    // under Wine (see the GHA thread-freshness bug in CLAUDE.md).
    const accessor = new RemoteCallableMemoryAccessor(pid);
    try {
      // kernel32.dll and ntdll.dll must always be loaded in a valid process!
      const hKernel32 = BigInt(
        Kernel32Impl.GetModuleHandleA(Buffer.from('kernel32.dll\0')),
      );
      const hNtdll = BigInt(
        Kernel32Impl.GetModuleHandleA(Buffer.from('ntdll.dll\0')),
      );

      const isKernel32Loaded = await isModuleLoadedInProcess(
        accessor,
        hKernel32,
      );
      const isNtdllLoaded = await isModuleLoadedInProcess(accessor, hNtdll);
      const isFakeLoaded = await isModuleLoadedInProcess(
        accessor,
        0x123456780000n,
      );

      expect(isKernel32Loaded).toBe(true);
      expect(isNtdllLoaded).toBe(true);
      expect(isFakeLoaded).toBe(false);

      // Verify core modules overview
      const coreStatus = await verifyCoreModules(accessor);
      expect(coreStatus.ntdll).toBe(true);
      expect(coreStatus.kernel32).toBe(true);
      expect(coreStatus.kernelbase).toBe(true);
      expect(coreStatus.msvcrt).toBe(true);
    } finally {
      accessor.close();
      await tp.stop();
    }
  }, 30000);
});
