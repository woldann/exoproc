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
  HostAccessor,
} from 'exoproc';
import { getGlobalDummyProcess } from 'exoproc-dummy';

describe('createAccessorWithoutInit', () => {
  test('returns synchronously (not a Promise), without initializing', () => {
    const proc = getGlobalDummyProcess();
    const thread = Thread.getThreads(proc.pid)[0];
    if (!thread) throw new Error('No thread found in the spawned process');

    // idType: 'thread' explicitly -- the default (idType: 'processAllThreadIds')
    // can't be resolved synchronously, see below.
    const memory = createAccessorWithoutInit(thread.tid, {
      idType: 'thread',
    });
    expect(memory).not.toBeInstanceOf(Promise);
    expect(memory).toBeInstanceOf(IndirectNThreadHostAccessor);
    memory.close();
  });

  test('throws by default, since idType now defaults to "processAllThreadIds"', () => {
    const proc = getGlobalDummyProcess();
    expect(() => createAccessorWithoutInit(proc.pid)).toThrow(
      /can't be resolved synchronously/,
    );
  });

  test('rejects idType: "processAllThreadIds" explicitly too', () => {
    expect(() =>
      createAccessorWithoutInit(0, { idType: 'processAllThreadIds' }),
    ).toThrow(/can't be resolved synchronously/);
  });
});

describe('createAccessor', () => {
  test('is async and awaits init before resolving', () => {
    const proc = getGlobalDummyProcess();

    const result = createAccessor(proc.pid);
    expect(result).toBeInstanceOf(Promise);
    return result.then((memory) => memory.deinit());
  }, 30000);

  test('defaults to a process id and races all its threads', async () => {
    const proc = getGlobalDummyProcess();

    const memory = await createAccessor(proc.pid);
    expect(memory).toBeInstanceOf(IndirectNThreadHostAccessor);

    try {
      const remoteTid = await memory.call(Kernel32Impl.GetCurrentThreadId);
      expect(Thread.getThreads(proc.pid).some((t) => t.tid === remoteTid)).toBe(
        true,
      );

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

  test('idType: "thread" names one specific thread directly', async () => {
    const proc = getGlobalDummyProcess();
    const thread = Thread.getThreads(proc.pid)[0];
    if (!thread) throw new Error('No thread found in the spawned process');

    const memory = await createAccessor(thread.tid, { idType: 'thread' });
    try {
      const remoteTid = await memory.call(Kernel32Impl.GetCurrentThreadId);
      expect(Number(remoteTid)).toBe(thread.tid);
    } finally {
      await memory.deinit();
    }
  }, 30000);

  test('idType: "process" auto-picks the process\'s first thread', async () => {
    const proc = getGlobalDummyProcess();
    const memory = await createAccessor(proc.pid, { idType: 'process' });
    try {
      const remoteTid = await memory.call(Kernel32Impl.GetCurrentThreadId);
      expect(Thread.getThreads(proc.pid).some((t) => t.tid === remoteTid)).toBe(
        true,
      );
    } finally {
      await memory.deinit();
    }
  }, 30000);

  test('idType: "processAllThreadIds" races every thread and returns whichever one initializes', async () => {
    const proc = getGlobalDummyProcess();
    const memory = await createAccessor(proc.pid, {
      idType: 'processAllThreadIds',
      nthreadOptions: { timeoutMs: 20000 },
    });
    try {
      // The winner is a real, already-initialized accessor on one of the
      // process's own threads -- same observable contract as idType: 'process'.
      const remoteTid = await memory.call(Kernel32Impl.GetCurrentThreadId);
      expect(Thread.getThreads(proc.pid).some((t) => t.tid === remoteTid)).toBe(
        true,
      );

      const addr = await memory.alloc(64);
      const data = Buffer.from('processAllThreadIds race winner!');
      await memory.write(addr, data);
      expect((await memory.read(addr, data.byteLength)).toString()).toBe(
        data.toString(),
      );
      await memory.free(addr);
    } finally {
      await memory.deinit();
    }
  }, 30000);

  test('idType: "processAllThreadIds" throws when the process has no threads', async () => {
    const bogusPid = 999999;
    await expect(
      createAccessor(bogusPid, { idType: 'processAllThreadIds' }),
    ).rejects.toThrow(/no threads to redirect/);
  });

  test('options.backend is returned directly, without touching id/idType', () => {
    const sentinel = {} as unknown as HostAccessor;

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
    // synchronously before any accessor is built. idType: 'thread' explicit
    // -- the default (idType: 'processAllThreadIds') would throw for an
    // entirely different reason (can't be resolved synchronously at all).
    expect(() =>
      createAccessorWithoutInit(bogusThreadId, { idType: 'thread' }),
    ).toThrow(/no thread with id/);
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

    // NShm (the default sharedMemory provider) is itself a HostAccessor, so
    // memory.deinit() below cascades to deinit its backend too -- no need to
    // separately build/track the base accessor just to clean it up.
    const memory = await createAccessor(thread.tid, {
      idType: 'thread',
      sharedMemory: true,
    });
    expect(memory).toBeInstanceOf(HostAccessor);

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
      await memory.call(Kernel32Impl.UnmapViewOfFile, addr);
      await memory.free(addr);
      await memory.deinit();
    }
  }, 30000);
});

describe('createAccessorOptions', () => {
  test('defaults to the gentle (level 1) preset, with shared memory off', () => {
    expect(createAccessorOptions()).toEqual(createAccessorOptions(1));
    expect(createAccessorOptions(1)).toEqual({
      nthreadOptions: { timeoutMs: 20000, pollIntervalMs: 100 },
      sharedMemory: false,
    });
  });

  test('level 2 is more aggressive (shorter timeout) and turns shared memory on', () => {
    const gentle = createAccessorOptions(1);
    const balanced = createAccessorOptions(2);

    expect(balanced.nthreadOptions!.timeoutMs!).toBeLessThan(
      gentle.nthreadOptions!.timeoutMs!,
    );
    expect(gentle.sharedMemory).toBe(false);
    expect(balanced.sharedMemory).toBe(true);
  });

  test('the returned template drives a real createAccessor call', async () => {
    const proc = getGlobalDummyProcess();
    const options = createAccessorOptions(1);
    options.idType = 'process';

    const memory = await createAccessor(proc.pid, options);
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
