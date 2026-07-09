import { decodeEnvelope, encodeEnvelope } from './protocol.js';

export interface RelayClientOptions {
  readonly hostname?: string;
  readonly port: number;
}

/**
 * Pure-JS client for a RelayServer, connected to one fixed peer. Native
 * callers (injected machinecode) build their own tiny client out of raw
 * socket calls instead of this — this class exists for JS-to-JS use (tests,
 * or a future package that wants to talk to a relay opcode from JS without
 * touching xffi at all).
 */
export class RelayClient {
  private socket: Bun.udp.ConnectedSocket<'buffer'> | null = null;
  private readonly pending = new Map<
    number,
    { resolve: (buf: Buffer) => void; reject: (err: Error) => void }
  >();
  private nextCallId = 1;

  constructor(private readonly options: RelayClientOptions) {}

  async connect(): Promise<void> {
    if (this.socket) return;

    this.socket = await Bun.udpSocket({
      hostname: this.options.hostname ?? '127.0.0.1',
      binaryType: 'buffer',
      connect: {
        hostname: this.options.hostname ?? '127.0.0.1',
        port: this.options.port,
      },
      socket: {
        data: (_socket, data) => {
          this.onDatagram(data);
        },
      },
    });
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
    for (const { reject } of this.pending.values()) {
      reject(
        new Error('bun-relay: RelayClient closed with a request in flight.'),
      );
    }
    this.pending.clear();
  }

  /** Fire-and-forget send: no reply is awaited. */
  send(opcode: number, payload: Buffer = Buffer.alloc(0)): void {
    if (!this.socket) {
      throw new Error('bun-relay: RelayClient is not connected.');
    }
    this.socket.send(encodeEnvelope(opcode, this.nextCallId++, payload));
  }

  /** Request/response: resolves with the handler's reply payload. */
  async call(
    opcode: number,
    payload: Buffer = Buffer.alloc(0),
    timeoutMs = 5000,
  ): Promise<Buffer> {
    if (!this.socket) {
      throw new Error('bun-relay: RelayClient is not connected.');
    }
    const callId = this.nextCallId++;

    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(callId);
        reject(
          new Error(
            `bun-relay: call ${callId} (opcode ${opcode}) timed out after ${timeoutMs}ms.`,
          ),
        );
      }, timeoutMs);

      this.pending.set(callId, {
        resolve: (buf) => {
          clearTimeout(timer);
          resolve(buf);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.socket!.send(encodeEnvelope(opcode, callId, payload));
    });
  }

  private onDatagram(data: Buffer): void {
    const envelope = decodeEnvelope(data);
    const pending = this.pending.get(envelope.callId);
    if (!pending) return;
    this.pending.delete(envelope.callId);
    pending.resolve(envelope.payload);
  }
}
