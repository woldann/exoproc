import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  DEFAULT_RELAY_PORT,
  RelayClient,
  RelayServer,
  ensureGlobalRelayStarted,
  getGlobalRelay,
  isPrimaryRelayInstance,
  resetGlobalRelayForTests,
} from '../../packages/relay/src/index.js';

describe('bun-relay global singleton', () => {
  // bun-relay auto-starts the global singleton as soon as it's loaded (see
  // global.ts), so it may already be bound by the time the first test here
  // runs -- reset before and after each test for a clean slate either way.
  beforeEach(() => {
    resetGlobalRelayForTests();
  });
  afterEach(() => {
    resetGlobalRelayForTests();
  });

  test('getGlobalRelay() always returns the same instance', () => {
    expect(getGlobalRelay()).toBe(getGlobalRelay());
  });

  test('ensureGlobalRelayStarted() starts it exactly once even when called concurrently', async () => {
    const [portA, portB] = await Promise.all([
      ensureGlobalRelayStarted(),
      ensureGlobalRelayStarted(),
    ]);
    expect(portA).toBe(portB);
    expect(getGlobalRelay().isStarted).toBe(true);
  });

  test('isPrimaryRelayInstance() resolves true when this process holds the default port', async () => {
    expect(await isPrimaryRelayInstance()).toBe(true);
    expect(getGlobalRelay().port).toBe(DEFAULT_RELAY_PORT);
  });

  test('isPrimaryRelayInstance() resolves false when another instance already holds the default port', async () => {
    const holder = new RelayServer({ port: DEFAULT_RELAY_PORT });
    await holder.start();

    try {
      expect(await isPrimaryRelayInstance()).toBe(false);
      expect(getGlobalRelay().port).not.toBe(DEFAULT_RELAY_PORT);
    } finally {
      holder.close();
    }
  });

  test('a package can register on the global relay and a client can reach it', async () => {
    await ensureGlobalRelayStarted();
    const relay = getGlobalRelay();

    relay.register(500, (payload) => {
      const reply = Buffer.alloc(4);
      reply.writeUInt32LE(payload.readUInt32LE(0) + 1, 0);
      return reply;
    });

    const client = new RelayClient({ port: relay.port });
    await client.connect();

    try {
      const req = Buffer.alloc(4);
      req.writeUInt32LE(1, 0);
      const res = await client.call(500, req);
      expect(res.readUInt32LE(0)).toBe(2);
    } finally {
      client.close();
    }
  });
});
