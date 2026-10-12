/**
 * Engine-side AES-GCM-256 Authenticated Encryption for Neptune Bridge.
 * Protects all MDX layouts, configuration values, and telemetry.
 */

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function importBridgeCryptoKey(
  hexKey: string,
): Promise<CryptoKey> {
  const rawBytes = hexToBytes(hexKey);
  const subtle = globalThis.crypto?.subtle || (globalThis as any).subtle;
  return await subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptedPacket {
  __encrypted: true;
  iv: string; // 12-byte hex
  ciphertext: string; // Hex payload + 16-byte auth tag
  seq?: number;
  ts?: number;
}

let outgoingSeq = 0;
let lastIncomingSeq = 0;

export function resetBridgeCryptoSeq() {
  outgoingSeq = 0;
  lastIncomingSeq = 0;
}

export function getBridgeCryptoLastSeq() {
  return { outgoingSeq, lastIncomingSeq };
}

export async function encryptBridgePacket(
  data: any,
  key: CryptoKey,
  explicitSeq?: number,
): Promise<EncryptedPacket> {
  const subtle = globalThis.crypto?.subtle || (globalThis as any).subtle;
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const currentSeq = explicitSeq !== undefined ? explicitSeq : ++outgoingSeq;
  const currentTs = Date.now();

  const payloadWithMeta = {
    ...data,
    __seq: currentSeq,
    __ts: currentTs,
  };

  const enc = new TextEncoder();
  const encoded = enc.encode(JSON.stringify(payloadWithMeta));

  const cipherBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );

  return {
    __encrypted: true,
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(cipherBuffer)),
    seq: currentSeq,
    ts: currentTs,
  };
}

export async function decryptBridgePacket(
  packet: EncryptedPacket | any,
  key: CryptoKey,
  enforceReplayGuard: boolean = true,
): Promise<any> {
  if (!packet || !packet.__encrypted || !packet.iv || !packet.ciphertext) {
    return packet;
  }

  const subtle = globalThis.crypto?.subtle || (globalThis as any).subtle;
  const iv = hexToBytes(packet.iv);
  const cipherBytes = hexToBytes(packet.ciphertext);

  const decryptedBuffer = await subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipherBytes,
  );

  const dec = new TextDecoder();
  const text = dec.decode(decryptedBuffer);
  const parsed = JSON.parse(text);

  if (enforceReplayGuard && typeof parsed === 'object' && parsed !== null) {
    if (parsed.__ts && Math.abs(Date.now() - parsed.__ts) > 60000) {
      throw new Error(
        `[BridgeCrypto] Stale packet detected! Packet timestamp delta (${Date.now() - parsed.__ts}ms) exceeds max allowable window`,
      );
    }
    if (parsed.__seq !== undefined) {
      if (lastIncomingSeq > 0 && parsed.__seq <= lastIncomingSeq) {
        throw new Error(
          `[BridgeCrypto] Replay attack detected! Inbound seq (${parsed.__seq}) <= lastSeenSeq (${lastIncomingSeq})`,
        );
      }
      lastIncomingSeq = parsed.__seq;
    }
  }

  return parsed;
}
