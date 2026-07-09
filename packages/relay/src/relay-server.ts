import * as dgram from 'dgram';
import { log } from './logger.js';
import {
  DEFAULT_RELAY_PORT,
  decodeEnvelope,
  encodeEnvelope,
} from './protocol.js';

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
  /** Defaults to DEFAULT_RELAY_PORT, with fallback to an ephemeral port if taken. */
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
 *
 * Built on node:dgram (not a Bun-native socket API) so this package also
 * runs under plain Node — the loopback UDP round trip is not where this
 * project's performance budget goes, so there's nothing to trade away.
 */
export class RelayServer {
  private socket: dgram.Socket | null = null;
  private readonly handlers = new Map<number, RelayHandler>();
  private readonly hostname: string;
  private readonly requestedPort: number;
  private readonly isExplicitPort: boolean;

  constructor(options: RelayServerOptions = {}) {
    this.hostname = options.hostname ?? '127.0.0.1';
    this.requestedPort = options.port ?? DEFAULT_RELAY_PORT;
    this.isExplicitPort = options.port !== undefined;
  }

  get isStarted(): boolean {
    return this.socket !== null;
  }

  get port(): number {
    if (!this.socket) {
      throw new Error('bun-relay: RelayServer is not started.');
    }
    return this.socket.address().port;
  }

  get address(): string {
    if (!this.socket) {
      throw new Error('bun-relay: RelayServer is not started.');
    }
    return this.socket.address().address;
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
      return this.port;
    }

    try {
      this.socket = await this.bind(this.requestedPort);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (this.isExplicitPort || code !== 'EADDRINUSE') {
        throw err;
      }
      log.warn(
        `RelayServer: default port ${this.requestedPort} is in use, falling back to an OS-assigned ephemeral port.`,
      );
      this.socket = await this.bind(0);
    }

    return this.port;
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
    this.handlers.clear();
  }

  private bind(port: number): Promise<dgram.Socket> {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');

      const onBindError = (err: Error) => {
        socket.close();
        reject(err);
      };

      socket.once('error', onBindError);
      socket.once('listening', () => {
        socket.removeListener('error', onBindError);
        socket.on('message', (data, rinfo) =>
          this.onDatagram(socket, data, rinfo),
        );
        socket.on('error', (err) => {
          log.error(`RelayServer socket error: ${err.message}`);
        });
        resolve(socket);
      });

      socket.bind(port, this.hostname);
    });
  }

  private onDatagram(
    socket: dgram.Socket,
    data: Buffer,
    rinfo: dgram.RemoteInfo,
  ): void {
    let envelope;
    try {
      envelope = decodeEnvelope(data);
    } catch (err) {
      log.warn(
        `RelayServer dropped malformed datagram from ${rinfo.address}:${rinfo.port}: ${(err as Error).message}`,
      );
      return;
    }

    const handler = this.handlers.get(envelope.opcode);
    if (!handler) {
      log.warn(
        `RelayServer has no handler registered for opcode ${envelope.opcode} (from ${rinfo.address}:${rinfo.port}).`,
      );
      return;
    }

    Promise.resolve(
      handler(envelope.payload, {
        callId: envelope.callId,
        port: rinfo.port,
        address: rinfo.address,
      }),
    )
      .then((response) => {
        if (response === undefined) return;
        socket.send(
          encodeEnvelope(envelope.opcode, envelope.callId, response),
          rinfo.port,
          rinfo.address,
        );
      })
      .catch((err) => {
        log.error(
          `RelayServer handler for opcode ${envelope.opcode} threw: ${err instanceof Error ? err.message : err}`,
        );
      });
  }
}
