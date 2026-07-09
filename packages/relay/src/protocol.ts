/**
 * Every datagram on a RelayServer's port starts with this fixed 8-byte
 * header: a `u32` opcode (which registered handler this is for) and a `u32`
 * callId (round-trip token the sender picks so it can match a reply back to
 * the request that produced it). Everything after the header is an opaque
 * payload — bun-relay never looks inside it, that's up to whichever package
 * registered the opcode.
 */
export const RELAY_HEADER_SIZE = 8;

/**
 * Default well-known loopback port RelayServer binds to when no explicit
 * port is given. Not an IANA-reserved port, just an arbitrary pick outside
 * the common dev-tool range. RelayServer falls back to an OS-assigned
 * ephemeral port if this one is already taken by another instance --
 * unless a port was explicitly requested, in which case a bind failure
 * is a real error and is surfaced as one.
 */
export const DEFAULT_RELAY_PORT = 47_101;

export interface RelayEnvelope {
  readonly opcode: number;
  readonly callId: number;
  readonly payload: Buffer;
}

export function encodeEnvelope(
  opcode: number,
  callId: number,
  payload: Buffer = Buffer.alloc(0),
): Buffer {
  const buf = Buffer.allocUnsafe(RELAY_HEADER_SIZE + payload.length);
  buf.writeUInt32LE(opcode >>> 0, 0);
  buf.writeUInt32LE(callId >>> 0, 4);
  payload.copy(buf, RELAY_HEADER_SIZE);
  return buf;
}

export function decodeEnvelope(buf: Buffer): RelayEnvelope {
  if (buf.length < RELAY_HEADER_SIZE) {
    throw new Error(
      `bun-relay: datagram too small to contain a header (${buf.length} < ${RELAY_HEADER_SIZE} bytes).`,
    );
  }
  return {
    opcode: buf.readUInt32LE(0),
    callId: buf.readUInt32LE(4),
    payload: buf.subarray(RELAY_HEADER_SIZE),
  };
}
