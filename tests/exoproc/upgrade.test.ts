import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
  extractClassNameFromClassBytes,
  getAgentBytecodeSync,
} from 'njava-agent';
import { ExoprocClient } from 'exoproc';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Exoproc Agent Upgrade System (.class loading & elevation)', () => {
  const tmpClassFile = join(tmpdir(), 'test-upgrade-agent.class');

  beforeAll(() => {
    const buildRes = getAgentBytecodeSync({ javaVersion: 8 });
    writeFileSync(tmpClassFile, buildRes.bytecode);
  });

  afterAll(() => {
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
});
