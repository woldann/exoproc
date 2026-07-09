import { afterEach, describe, expect, test } from 'bun:test';
import {
  RelayClient,
  ensureGlobalRelayStarted,
  getGlobalRelay,
  resetGlobalRelayForTests,
} from '../../packages/relay/src/index.js';

describe('bun-relay global singleton', () => {
  afterEach(() => {
    resetGlobalRelayForTests();
  });

  test('getGlobalRelay() does not bind a socket by itself', () => {
    const relay = getGlobalRelay();
    expect(relay.isStarted).toBe(false);
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
