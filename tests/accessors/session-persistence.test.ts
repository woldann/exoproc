import { expect, test, describe, afterAll } from 'bun:test';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HostAccessor, type HostAccessorSession } from 'bun-xffi';
import {
  createAccessorWithoutInit,
  createAccessor,
  createAccessorFromFile,
  IndirectNThreadHostAccessor,
} from 'exoproc-accessors';
import { getGlobalDummyProcess } from 'exoproc-dummy';

describe('HostAccessor Session Persistence', () => {
  const tempFiles: string[] = [];

  const getTempPath = (name: string) => {
    const p = join(
      tmpdir(),
      `test-session-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}.json`,
    );
    tempFiles.push(p);
    return p;
  };

  afterAll(() => {
    for (const f of tempFiles) {
      try {
        if (existsSync(f)) unlinkSync(f);
      } catch {}
    }
  });

  test('HostAccessor toJSON and metadata serialization', () => {
    const proc = getGlobalDummyProcess();
    const accessor = createAccessorWithoutInit(proc.pid, {
      idType: 'processAllThreadIds',
      sharedMemory: false,
    });

    accessor.setSessionMetadata('gameName', 'Minecraft 1.8.9');
    accessor.setSessionMetadata('profileId', 'lunar-client');

    const meta = accessor.getSessionMetadata();
    expect(meta.gameName).toBe('Minecraft 1.8.9');
    expect(meta.profileId).toBe('lunar-client');

    const json = accessor.toJSON();
    expect(json.version).toBe(1);
    expect(json.processId).toBe(proc.pid);
    expect(json.accessorType).toBe('IndirectNThreadHostAccessor');
    expect(json.metadata?.gameName).toBe('Minecraft 1.8.9');
    expect(json.metadata?.profileId).toBe('lunar-client');
    expect(json.options?.idType).toBe('processAllThreadIds');
    expect(json.savedAt).toBeDefined();

    accessor.close();
  });

  test('saveToFileSync and HostAccessor.loadSession', () => {
    const proc = getGlobalDummyProcess();
    const filePath = getTempPath('sync');

    const accessor = createAccessorWithoutInit(proc.pid, {
      idType: 'processAllThreadIds',
    });
    accessor.setSessionMetadata('customKey', 42);

    const writtenPath = accessor.saveToFileSync(filePath);
    expect(writtenPath).toBe(filePath);
    expect(existsSync(filePath)).toBe(true);

    const loaded = HostAccessor.loadSession(filePath);
    expect(loaded.version).toBe(1);
    expect(loaded.processId).toBe(proc.pid);
    expect(loaded.metadata?.customKey).toBe(42);
    expect(loaded.accessorType).toBe('IndirectNThreadHostAccessor');

    accessor.close();
  });

  test('saveToFile (async)', async () => {
    const proc = getGlobalDummyProcess();
    const filePath = getTempPath('async');

    const accessor = createAccessorWithoutInit(proc.pid);
    const writtenPath = await accessor.saveToFile(filePath);
    expect(writtenPath).toBe(filePath);
    expect(existsSync(filePath)).toBe(true);

    const loaded = HostAccessor.loadSession(filePath);
    expect(loaded.processId).toBe(proc.pid);

    accessor.close();
  });

  test('HostAccessor.registerRestorer allows custom restorers', async () => {
    let called = false;
    HostAccessor.registerRestorer('CustomMockAccessor', async (session) => {
      called = true;
      return {
        processId: session.processId,
        metadata: session.metadata,
      } as any;
    });

    const filePath = getTempPath('custom-mock');
    const mockSession: HostAccessorSession = {
      version: 1,
      savedAt: new Date().toISOString(),
      processId: 12345,
      accessorType: 'CustomMockAccessor',
      metadata: { mock: true },
    };

    writeFileSync(filePath, JSON.stringify(mockSession, null, 2), 'utf8');

    const restored = await HostAccessor.restoreFromFile(filePath);
    expect(called).toBe(true);
    expect(restored.processId).toBe(12345);
  });

  test('save and restore full accessor session from live process', async () => {
    const proc = getGlobalDummyProcess();
    const filePath = getTempPath('live-session');

    // 1. Create and initialize accessor
    const accessor = await createAccessor(proc.pid);
    accessor.setSessionMetadata('attachedBy', 'test-suite');

    // 2. Save session
    await accessor.saveToFile(filePath);

    // 3. Verify session file contents
    const session = HostAccessor.loadSession(filePath);
    expect(session.processId).toBe(proc.pid);
    expect(session.threadId).toBeDefined();
    expect(typeof session.threadId).toBe('number');
    expect(session.metadata?.attachedBy).toBe('test-suite');

    // Release the thread before restoring so it can be re-hijacked cleanly
    await accessor.deinit();

    // 4. Restore using createAccessorFromFile
    const restored = await createAccessorFromFile(filePath);
    expect(restored).toBeInstanceOf(IndirectNThreadHostAccessor);
    expect(restored.processId).toBe(proc.pid);
    expect(restored.getSessionMetadata().attachedBy).toBe('test-suite');

    // 5. Verify restored accessor is functional
    const buf = Buffer.from('hello restored accessor');
    const addr = await restored.alloc(64);
    await restored.write(addr, buf);
    const back = await restored.read(addr, buf.length);
    expect(back.toString()).toBe(buf.toString());
    await restored.free(addr);

    await restored.deinit();
  }, 40000);
});
