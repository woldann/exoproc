import { expect, test, describe, beforeEach } from 'bun:test';
import {
  importBridgeCryptoKey,
  encryptBridgePacket,
  decryptBridgePacket,
  resetBridgeCryptoSeq,
} from '../../packages/exoproc/src/crypto/bridge-crypto.js';

describe('exoproc > BridgeCrypto & Replay Attack Hardening', () => {
  const TEST_KEY_HEX =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  let cryptoKey: CryptoKey;

  beforeEach(async () => {
    resetBridgeCryptoSeq();
    cryptoKey = await importBridgeCryptoKey(TEST_KEY_HEX);
  });

  test('successfully encrypts and decrypts payload', async () => {
    const original = { action: 'toggle', moduleId: 'velocity', enabled: true };
    const packet = await encryptBridgePacket(original, cryptoKey);

    expect(packet.__encrypted).toBe(true);
    expect(packet.iv).toBeDefined();
    expect(packet.ciphertext).toBeDefined();
    expect(packet.seq).toBe(1);
    expect(packet.ts).toBeGreaterThan(0);

    const decrypted = await decryptBridgePacket(packet, cryptoKey);
    expect(decrypted.action).toBe('toggle');
    expect(decrypted.moduleId).toBe('velocity');
    expect(decrypted.enabled).toBe(true);
    expect(decrypted.__seq).toBe(1);
  });

  test('increments sequence numbers monotonically', async () => {
    const p1 = await encryptBridgePacket({ num: 1 }, cryptoKey);
    const p2 = await encryptBridgePacket({ num: 2 }, cryptoKey);
    const p3 = await encryptBridgePacket({ num: 3 }, cryptoKey);

    expect(p1.seq).toBe(1);
    expect(p2.seq).toBe(2);
    expect(p3.seq).toBe(3);

    const d1 = await decryptBridgePacket(p1, cryptoKey);
    const d2 = await decryptBridgePacket(p2, cryptoKey);
    const d3 = await decryptBridgePacket(p3, cryptoKey);

    expect(d1.__seq).toBe(1);
    expect(d2.__seq).toBe(2);
    expect(d3.__seq).toBe(3);
  });

  test('blocks replayed packets with replay attack error', async () => {
    const p1 = await encryptBridgePacket({ msg: 'first' }, cryptoKey);
    const p2 = await encryptBridgePacket({ msg: 'second' }, cryptoKey);

    await decryptBridgePacket(p1, cryptoKey);
    await decryptBridgePacket(p2, cryptoKey);

    // Attempting to re-inject p1 (seq 1 <= lastSeen 2) must throw!
    expect(decryptBridgePacket(p1, cryptoKey)).rejects.toThrow(
      /Replay attack detected/,
    );
  });
});
