import { log } from './logger.js';
import { decodeEnvelope, encodeEnvelope } from './protocol.js';

export interface RelayRequestInfo {
  readonly callId: number;
  readonly port: number;
  readonly address: string;
}

export type RelayHandlerResult = Buffer | undefined | void;

/**
 * Handles one opcode's datagrams. Returning a `Buffer` sends it back to the
 * original sender as a reply (request/response); returning `undefined`/void
 * treats the datagram as fire-and-forget (no reply sent).
 */
export type RelayHandler = (
  payload: Buffer,
  info: RelayRequestInfo,
) => RelayHandlerResult | Promise<RelayHandlerResult>;

export interface RelayServerOptions {
  /** Defaults to '127.0.0.1' — this is a loopback-only relay, never bind 0.0.0.0. */
  readonly hostname?: string;
  /** Defaults to 0 (OS-assigned ephemeral port). */
  readonly port?: number;
}

/**
 * A single well-known UDP endpoint that any number of independent clients —
 * local threads, injected machinecode in another process, whatever — can
 * send fixed-header datagrams to. RelayServer has no idea what any of those
 * datagrams mean; it only reads the opcode out of the header and dispatches
 * to whichever package registered that opcode via `register()`. This is the
 * one piece of shared infrastructure; everything else (what a given opcode's
 * payload looks like, whether the caller waits for a reply) is up to the
 * package that owns that opcode.
 */
export class RelayServer {
  private socket: Bun.udp.Socket<'buffer'> | null = null;
  private readonly handlers = new Map<number, RelayHandler>();
  private readonly hostname: string;
  private readonly requestedPort: number;

  constructor(options: RelayServerOptions = {}) {
    this.hostname = options.hostname ?? '127.0.0.1';
    this.requestedPort = options.port ?? 0;
  }

  get isStarted(): boolean {
    return this.socket !== null;
  }

  get port(): number {
    if (!this.socket) {
      throw new Error('bun-relay: RelayServer is not started.');
    }
    return this.socket.port;
  }

  get address(): string {
    if (!this.socket) {
      throw new Error('bun-relay: RelayServer is not started.');
    }
    return this.socket.hostname;
  }

  /**
   * Registers a handler for `opcode`. Only one handler per opcode at a time —
   * bun-relay is a dispatcher, not a pub/sub bus, so a second registration
   * for the same opcode is almost certainly a bug (two packages picked the
   * same opcode by accident) rather than something to silently allow.
   */
  register(opcode: number, handler: RelayHandler): void {
    if (this.handlers.has(opcode)) {
      throw new Error(`bun-relay: opcode ${opcode} is already registered.`);
    }
    this.handlers.set(opcode, handler);
  }

  unregister(opcode: number): void {
    this.handlers.delete(opcode);
  }

  async start(): Promise<number> {
    if (this.socket) {
      return this.socket.port;
    }

    this.socket = await Bun.udpSocket({
      hostname: this.hostname,
      port: this.requestedPort,
      binaryType: 'buffer',
      socket: {
        data: (socket, data, port, address) => {
          this.onDatagram(socket, data, port, address);
        },
        error: (_socket, err) => {
          log.error(`RelayServer socket error: ${err.message}`);
        },
      },
    });

    return this.socket.port;
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
    this.handlers.clear();
  }

  private onDatagram(
    socket: Bun.udp.Socket<'buffer'>,
    data: Buffer,
    port: number,
    address: string,
  ): void {
    let envelope;
    try {
      envelope = decodeEnvelope(data);
    } catch (err) {
      log.warn(
        `RelayServer dropped malformed datagram from ${address}:${port}: ${(err as Error).message}`,
      );
      return;
    }

    const handler = this.handlers.get(envelope.opcode);
    if (!handler) {
      log.warn(
        `RelayServer has no handler registered for opcode ${envelope.opcode} (from ${address}:${port}).`,
      );
      return;
    }

    Promise.resolve(
      handler(envelope.payload, {
        callId: envelope.callId,
        port,
        address,
      }),
    )
      .then((response) => {
        if (response === undefined) return;
        socket.send(
          encodeEnvelope(envelope.opcode, envelope.callId, response),
          port,
          address,
        );
      })
      .catch((err) => {
        log.error(
          `RelayServer handler for opcode ${envelope.opcode} threw: ${err instanceof Error ? err.message : err}`,
        );
      });
  }
}
