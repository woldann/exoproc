import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import {
  runDaemon,
  reflectionService,
  DaemonReflectionService,
  clearDaemonState,
} from 'exoproc/daemon';
import { AgentClient } from 'njava-agent';

describe('Exoproc Daemon: Agent Standards & Universal Reflection', () => {
  const TEST_PORT = 44521;
  let client: AgentClient;

  beforeAll(async () => {
    client = new AgentClient({ port: TEST_PORT });

    // Start daemon on test port
    await new Promise<void>((resolve, reject) => {
      runDaemon({
        port: TEST_PORT,
        host: '127.0.0.1',
        onReady: () => resolve(),
        onError: reject,
      }).catch(reject);

      setTimeout(() => resolve(), 1500);
    });
  });

  afterAll(async () => {
    try {
      await fetch(`http://127.0.0.1:${TEST_PORT}/shutdown`, { method: 'POST' });
    } catch {}
    clearDaemonState();
  });

  test('conforms to AgentStatus standard via AgentClient.getStatus()', async () => {
    const isAlive = await client.isAlive();
    expect(isAlive).toBe(true);

    const status = await client.getStatus();
    expect(status.alive).toBe(true);
    expect(status.port).toBe(TEST_PORT);
    expect(typeof status.uptime).toBe('number');
  });

  test('conforms to Agent classes endpoint via AgentClient.getClasses()', async () => {
    const classes = await client.getClasses();
    expect(Array.isArray(classes)).toBe(true);
  });

  test('executes direct eval in host runtime with return values and logs', async () => {
    const res = await client.eval('return 21 * 2;');
    expect(res.success).toBe(true);
    expect(res.result).toBe(42);

    const logRes = await client.eval('print("daemon log test"); return "ok";');
    expect(logRes.success).toBe(true);
    expect(logRes.result).toBe('ok');
    expect(logRes.logs).toContain('daemon log test');
  });

  test('evaluates code with custom globals passed from caller', async () => {
    const res = await client.eval('return factorA * factorB + offset;', {
      factorA: 6,
      factorB: 7,
      offset: 10,
    });
    expect(res.success).toBe(true);
    expect(res.result).toBe(52);
  });

  test('reflectionService correctly serializes primitive and object values', () => {
    const svc = new DaemonReflectionService();

    const nullVal = svc.serializeValue(null);
    expect(nullVal.success).toBe(true);
    expect(nullVal.isObject).toBe(false);
    expect(nullVal.value).toBe(null);

    const numVal = svc.serializeValue(1337);
    expect(numVal.success).toBe(true);
    expect(numVal.isObject).toBe(false);
    expect(numVal.value).toBe(1337);

    const strVal = svc.serializeValue('hello world');
    expect(strVal.success).toBe(true);
    expect(strVal.isObject).toBe(false);
    expect(strVal.value).toBe('hello world');

    const objVal = svc.serializeValue(0x12345678n);
    expect(objVal.success).toBe(true);
    expect(objVal.isObject).toBe(true);
    expect(typeof objVal.handle).toBe('number');
    expect(svc.objectRegistry.has(objVal.handle!)).toBe(true);

    const unwrapped = svc.unwrapHandle({ handle: objVal.handle });
    expect(unwrapped).toBe(0x12345678n);

    svc.releaseHandles([objVal.handle!]);
    expect(svc.objectRegistry.has(objVal.handle!)).toBe(false);
  });

  test('handles /reflection/object/class, /reflection/object/string, and /reflection/release over HTTP', async () => {
    // Manually register a test object into daemon reflectionService
    const handle = 999;
    reflectionService.objectRegistry.set(handle, {
      ptr: 0xdeadbeefn,
      className: 'net.minecraft.client.Minecraft',
    });

    // 1. /reflection/object/class
    const clsRes = await fetch(
      `http://127.0.0.1:${TEST_PORT}/reflection/object/class`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      },
    );
    expect(clsRes.ok).toBe(true);
    const clsJson = (await clsRes.json()) as any;
    expect(clsJson.success).toBe(true);
    expect(clsJson.name).toBe('net.minecraft.client.Minecraft');

    // 2. /reflection/object/string
    const strRes = await fetch(
      `http://127.0.0.1:${TEST_PORT}/reflection/object/string`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      },
    );
    expect(strRes.ok).toBe(true);
    const strJson = (await strRes.json()) as any;
    expect(strJson.success).toBe(true);
    expect(strJson.value).toContain('0xdeadbeef');

    // 3. /reflection/release
    const relRes = await fetch(
      `http://127.0.0.1:${TEST_PORT}/reflection/release`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handles: [handle] }),
      },
    );
    expect(relRes.ok).toBe(true);
    const relJson = (await relRes.json()) as any;
    expect(relJson.success).toBe(true);
    expect(reflectionService.objectRegistry.has(handle)).toBe(false);
  });
});
