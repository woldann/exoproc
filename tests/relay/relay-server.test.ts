import { describe, expect, test } from 'bun:test';
import { RelayClient, RelayServer } from '../../packages/relay/src/index.js';

describe('bun-relay', () => {
  test('registers an opcode and answers a request/response call', async () => {
    const server = new RelayServer();
    await server.start();

    server.register(1, (payload) => {
      const n = payload.readUInt32LE(0);
      const reply = Buffer.alloc(4);
      reply.writeUInt32LE(n * 2, 0);
      return reply;
    });

    const client = new RelayClient({ port: server.port });
    await client.connect();

    try {
      const req = Buffer.alloc(4);
      req.writeUInt32LE(21, 0);
      const res = await client.call(1, req);
      expect(res.readUInt32LE(0)).toBe(42);
    } finally {
      client.close();
      server.close();
    }
  });

  test('supports fire-and-forget sends with no reply', async () => {
    const server = new RelayServer();
    await server.start();

    const received: { value: number | null } = { value: null };
    const gotIt = new Promise<void>((resolve) => {
      server.register(2, (payload) => {
        received.value = payload.readUInt32LE(0);
        resolve();
        return undefined;
      });
    });

    const client = new RelayClient({ port: server.port });
    await client.connect();

    try {
      const payload = Buffer.alloc(4);
      payload.writeUInt32LE(7, 0);
      client.send(2, payload);
      await gotIt;
      expect(received.value).toBe(7);
    } finally {
      client.close();
      server.close();
    }
  });

  test('routes concurrent calls by callId without cross-talk', async () => {
    const server = new RelayServer();
    await server.start();

    server.register(3, async (payload) => {
      const n = payload.readUInt32LE(0);
      // Stagger responses so replies don't come back in send order.
      await new Promise((r) => setTimeout(r, n % 2 === 0 ? 5 : 0));
      const reply = Buffer.alloc(4);
      reply.writeUInt32LE(n, 0);
      return reply;
    });

    const client = new RelayClient({ port: server.port });
    await client.connect();

    try {
      const inputs = [10, 11, 12, 13, 14, 15];
      const results = await Promise.all(
        inputs.map((n) => {
          const buf = Buffer.alloc(4);
          buf.writeUInt32LE(n, 0);
          return client.call(3, buf).then((r) => r.readUInt32LE(0));
        }),
      );
      expect(results).toEqual(inputs);
    } finally {
      client.close();
      server.close();
    }
  });

  test('rejects a duplicate opcode registration', async () => {
    const server = new RelayServer();
    await server.start();
    try {
      server.register(4, () => undefined);
      expect(() => server.register(4, () => undefined)).toThrow();
    } finally {
      server.close();
    }
  });

  test('times out a call when no handler is registered for the opcode', async () => {
    const server = new RelayServer();
    await server.start();

    const client = new RelayClient({ port: server.port });
    await client.connect();

    try {
      await expect(client.call(999, Buffer.alloc(0), 100)).rejects.toThrow(
        /timed out/,
      );
    } finally {
      client.close();
      server.close();
    }
  });
});
