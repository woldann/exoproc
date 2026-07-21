import { expect, test, describe } from 'bun:test';
import { Kernel32Impl, WaitReturn } from 'bun-xffi';
import { createRelayedEvent } from 'bun-nevent';
import { createAccessor } from 'exoproc-accessors';
import { getGlobalDummyProcess } from 'exoproc-dummy';

// Proves the event handle relay flow: this (Bun) process never OpenProcess's
// the target directly -- only the dummy process it spawns itself (same
// shared exoproc-dummy singleton bun-nshm's own test uses, torn down once
// for the whole suite in tests/setup.ts, not here). Unlike nshm's mapping
// relay, *both* returned handles stay independently valid -- `targetHandle`
// is never closed as a side effect -- so a signal set through either handle
// must be observable through the other, in both directions. Driven through
// IndirectNThreadHostAccessor (an already-live, hijacked thread in the
// target) per CLAUDE.md's guidance on real WinAPI/CRT calls (CreateEventA/
// OpenProcess/DuplicateHandle) never running on a freshly-created thread
// under Wine/GHA.
describe('nevent > createRelayedEvent (handle relay via a single shared dummy process)', () => {
  test('a signal set through the local handle is observed through the target handle', async () => {
    const target = getGlobalDummyProcess();
    const memory = await createAccessor(target.pid, {
      idType: 'process',
      hostOptions: { timeoutMs: 20000 },
    });

    const { targetHandle, localHandle } = await createRelayedEvent(memory, {
      manualReset: true,
      initialState: false,
    });

    try {
      expect(targetHandle).toBeGreaterThan(0n);
      expect(localHandle).toBeGreaterThan(0n);

      // Not yet signaled from either side.
      expect(
        await memory.call(Kernel32Impl.WaitForSingleObject, targetHandle, 0),
      ).toBe(WaitReturn.TIMEOUT);

      Kernel32Impl.SetEvent(localHandle);

      expect(
        await memory.call(Kernel32Impl.WaitForSingleObject, targetHandle, 0),
      ).toBe(WaitReturn.OBJECT_0);
    } finally {
      Kernel32Impl.CloseHandle(localHandle);
      await memory.call(Kernel32Impl.CloseHandle, targetHandle);
      await memory.deinit();
    }
  }, 60000);

  test('a signal set through the target handle is observed through the local handle', async () => {
    const target = getGlobalDummyProcess();
    const memory = await createAccessor(target.pid, {
      idType: 'process',
      hostOptions: { timeoutMs: 20000 },
    });

    const { targetHandle, localHandle } = await createRelayedEvent(memory, {
      manualReset: true,
      initialState: false,
    });

    try {
      expect(Kernel32Impl.WaitForSingleObject(localHandle, 0)).toBe(
        WaitReturn.TIMEOUT,
      );

      await memory.call(Kernel32Impl.SetEvent, targetHandle);

      expect(Kernel32Impl.WaitForSingleObject(localHandle, 0)).toBe(
        WaitReturn.OBJECT_0,
      );
    } finally {
      Kernel32Impl.CloseHandle(localHandle);
      await memory.call(Kernel32Impl.CloseHandle, targetHandle);
      await memory.deinit();
    }
  }, 60000);
});
