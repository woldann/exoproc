import { expect, test, describe } from 'bun:test';
import {
  Kernel32Impl,
  resolveAddress,
  Thread,
  IndirectNThreadHostAccessor,
  RemoteMemoryAccessor,
  createAccessor,
  createAccessorWithoutInit,
  createAccessorOptions,
} from 'exoproc';
import { getGlobalDummyProcess } from 'exoproc-dummy';

describe('createAccessorWithoutInit', () => {
  test('returns synchronously (not a Promise), without initializing', () => {
    const proc = getGlobalDummyProcess();
    const thread = Thread.getThreads(proc.pid)[0];
    if (!thread) throw new Error('No thread found in the spawned process');

    const memory = createAccessorWithoutInit(thread.tid);
    expect(memory).not.toBeInstanceOf(Promise);
    expect(memory).toBeInstanceOf(IndirectNThreadHostAccessor);
    memory.close();
  });
});

describe('createAccessor', () => {
  test('is async and awaits init before resolving', () => {
    const proc = getGlobalDummyProcess();
    const thread = Thread.getThreads(proc.pid)[0];
    if (!thread) throw new Error('No thread found in the spawned process');

    const result = createAccessor(thread.tid);
    expect(result).toBeInstanceOf(Promise);
    return result.then((memory) =>
      (memory as IndirectNThreadHostAccessor).deinit(),
    );
  }, 30000);

  test('defaults to a thread id and resolves its owning process', async () => {
    const proc = getGlobalDummyProcess();
    const thread = Thread.getThreads(proc.pid)[0];
    if (!thread) throw new Error('No thread found in the spawned process');

    const memory = (await createAccessor(
      thread.tid,
    )) as IndirectNThreadHostAccessor;
    expect(memory).toBeInstanceOf(IndirectNThreadHostAccessor);

    try {
      const remoteTid = await memory.call(Kernel32Impl.GetCurrentThreadId);
      expect(Number(remoteTid)).toBe(thread.tid);

      const addr = await memory.alloc(64);
      expect(Number(resolveAddress(addr))).toBeGreaterThan(0);

      const data = Buffer.from('createAccessor default chain!');
      await memory.write(addr, data);
      const back = await memory.read(addr, data.byteLength);
      expect(back.toString()).toBe(data.toString());
      await memory.free(addr);
    } finally {
      await memory.deinit();
    }
  }, 30000);

  test('idType: "process" auto-picks the process\'s first thread', async () => {
    const proc = getGlobalDummyProcess();
    const memory = (await createAccessor(proc.pid, {
      idType: 'process',
    })) as IndirectNThreadHostAccessor;
    try {
      const remoteTid = await memory.call(Kernel32Impl.GetCurrentThreadId);
      expect(Thread.getThreads(proc.pid).some((t) => t.tid === remoteTid)).toBe(
        true,
      );
    } finally {
      await memory.deinit();
    }
  }, 30000);

  test('options.backend is returned directly, without touching id/idType', () => {
    const sentinel = {} as unknown as IndirectNThreadHostAccessor;

    // A bogus id would normally throw during resolution (see the two error
    // tests below) -- passing `backend` must skip that resolution entirely.
    // Sync createAccessorWithoutInit, since the sentinel isn't a real
    // inittable accessor -- no init to await here.
    const memory = createAccessorWithoutInit(0, { backend: sentinel });

    expect(memory).toBe(sentinel);
  });

  test('throws when no thread has the given id', () => {
    const bogusThreadId = 999999999;
    // createAccessorWithoutInit -- pure id-resolution failure, thrown
    // synchronously before any accessor is built.
    expect(() => createAccessorWithoutInit(bogusThreadId)).toThrow(
      /no thread with id/,
    );
  });

  test('throws when the given process has no threads to redirect', () => {
    // A pid that (almost certainly) does not correspond to a live process --
    // Thread.getThreads filters a Toolhelp32 snapshot by pid, so an unmatched
    // pid yields an empty array rather than an error.
    const bogusPid = 999999;
    expect(() =>
      createAccessorWithoutInit(bogusPid, { idType: 'process' }),
    ).toThrow(/no threads to redirect/);
  });

  test('sharedMemory: true backs plain allocations with NShm', async () => {
    const proc = getGlobalDummyProcess();
    const thread = Thread.getThreads(proc.pid)[0];
    if (!thread) throw new Error('No thread found in the spawned process');

    // Build the base accessor ourselves (via `backend`) so this test keeps a
    // handle on it for proper unmap/deinit -- createAccessor's own return
    // value is the NShm wrapper, which has no deinit() of its own. Built via
    // createAccessorWithoutInit (not `new IndirectNThreadHostAccessor`) --
    // createAccessor below initializes it as part of initializing the NShm
    // wrapper, so there's no separate init step to do here.
    const base = createAccessorWithoutInit(
      thread.tid,
    ) as IndirectNThreadHostAccessor;
    const memory = await createAccessor(thread.tid, {
      backend: base,
      sharedMemory: true,
    });

    const addr = await memory.alloc(4096);
    // Independent raw ReadProcessMemory check (not another NThread hijack of
    // the same already-hijacked thread) -- proves the write really landed in
    // the target's shared section, not just NShm's own local view.
    const raw = new RemoteMemoryAccessor(proc.pid);
    try {
      const marker = Buffer.from('createAccessor shared memory!\0');
      await memory.write(addr, marker);

      const seenInTarget = raw.readSync(addr, marker.byteLength);
      expect(seenInTarget.toString()).toBe(marker.toString());
    } finally {
      raw.close();
      await base.call(Kernel32Impl.UnmapViewOfFile, addr);
      await memory.free(addr);
      await base.deinit();
    }
  }, 30000);
});

describe('createAccessorOptions', () => {
  test('defaults to the balanced (level 2) preset, with shared memory on', () => {
    expect(createAccessorOptions()).toEqual(createAccessorOptions(2));
    expect(createAccessorOptions(2)).toEqual({
      nthreadOptions: { timeoutMs: 5000, pollIntervalMs: 50 },
      sharedMemory: true,
    });
  });

  test('level 1 is gentler (longer timeout) and has shared memory off', () => {
    const gentle = createAccessorOptions(1);
    const balanced = createAccessorOptions(2);

    expect(gentle.nthreadOptions!.timeoutMs!).toBeGreaterThan(
      balanced.nthreadOptions!.timeoutMs!,
    );
    expect(gentle.sharedMemory).toBe(false);
    expect(balanced.sharedMemory).toBe(true);
  });

  test('the returned template drives a real createAccessor call', async () => {
    const proc = getGlobalDummyProcess();
    const options = createAccessorOptions(1);
    options.idType = 'process';

    const memory = (await createAccessor(
      proc.pid,
      options,
    )) as IndirectNThreadHostAccessor;
    try {
      const remoteTid = await memory.call(Kernel32Impl.GetCurrentThreadId);
      expect(Thread.getThreads(proc.pid).some((t) => t.tid === remoteTid)).toBe(
        true,
      );
    } finally {
      await memory.deinit();
    }
  }, 30000);
});
