import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
  extractClassNameFromClassBytes,
  getAgentBytecodeSync,
} from 'njava-agent';
import { ExoprocClient } from 'exoproc';
import { runDaemon, clearDaemonState } from 'exoproc/daemon';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Exoproc Agent Upgrade System (.class loading & elevation)', () => {
  const TEST_PORT = 44522;
  const tmpClassFile = join(tmpdir(), 'test-upgrade-agent.class');

  beforeAll(async () => {
    // 1. Prepare sample agent .class file
    const buildRes = getAgentBytecodeSync({ javaVersion: 8 });
    writeFileSync(tmpClassFile, buildRes.bytecode);

    // 2. Start daemon on test port
    await new Promise<void>((resolve, reject) => {
      runDaemon({
        port: TEST_PORT,
        host: '127.0.0.1',
        onReady: () => resolve(),
        onError: reject,
      }).catch(reject);

      setTimeout(() => resolve(), 1000);
    });
  });

  afterAll(async () => {
    try {
      await fetch(`http://127.0.0.1:${TEST_PORT}/shutdown`, { method: 'POST' });
    } catch {}
    clearDaemonState();
    if (existsSync(tmpClassFile)) {
      try {
        unlinkSync(tmpClassFile);
      } catch {}
    }
  });

  it('extractClassNameFromClassBytes extracts exact class name from Java bytecode', () => {
    const buildRes = getAgentBytecodeSync({ javaVersion: 8 });
    expect(buildRes.bytecode).toBeDefined();
    expect(buildRes.bytecode.length).toBeGreaterThan(100);

    const extracted = extractClassNameFromClassBytes(buildRes.bytecode);
    expect(extracted).toBe('org.exoproc.njava.agent.utils.Exoproc');
  });

  it('ExoprocClient exposes upgradeToAgent and upgrade methods', () => {
    const client = new ExoprocClient();
    expect(client.isUpgraded).toBe(false);
    expect(client.agentPort).toBeUndefined();
    expect(typeof client.upgradeToAgent).toBe('function');
    expect(typeof client.upgrade).toBe('function');
  });

  it('Daemon handles /upgrade endpoint and reports attached requirement', async () => {
    // Status before attach/upgrade
    const st0 = (await fetch(`http://127.0.0.1:${TEST_PORT}/status`).then((r) =>
      r.json(),
    )) as any;
    expect(st0.alive).toBe(true);
    expect(st0.upgraded).toBe(false);

    // Verify calling /upgrade when unattached returns friendly error
    const failRes = await fetch(`http://127.0.0.1:${TEST_PORT}/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classPath: tmpClassFile }),
    });
    expect(failRes.status).toBe(400);
    const failJson = (await failRes.json()) as any;
    expect(failJson.success).toBe(false);
    expect(failJson.error).toContain('Daemon is not attached');
  });

  it('ExoprocClient connects to daemon and verifies upgrade interface', async () => {
    const client = new ExoprocClient();
    const st = await client.connectDaemon({
      host: '127.0.0.1',
      port: TEST_PORT,
    });
    expect(st.alive).toBe(true);
    expect(client.isUpgraded).toBe(false);

    // Attempting upgrade on unattached daemon fails cleanly with error message
    expect(client.upgradeToAgent({ classPath: tmpClassFile })).rejects.toThrow(
      'Daemon is not attached',
    );
  });
});
