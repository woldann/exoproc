import { RelayServer } from './relay-server.js';

let globalRelay: RelayServer | null = null;
let startPromise: Promise<number> | null = null;

/**
 * The one shared, process-wide RelayServer every package should register
 * its opcodes against, instead of each constructing a private RelayServer
 * (which would each want the same default port and step on each other).
 * Constructing it here does not bind a socket -- importing bun-relay must
 * never have the side effect of opening a port. Call
 * `ensureGlobalRelayStarted()` (or `start()` on the returned instance
 * directly) when you actually need it listening.
 */
export function getGlobalRelay(): RelayServer {
  if (!globalRelay) {
    globalRelay = new RelayServer();
  }
  return globalRelay;
}

/**
 * Binds and starts the global relay if it isn't already; safe to call
 * repeatedly or concurrently from multiple packages during their own
 * init -- they'll all await the same in-flight start.
 */
export function ensureGlobalRelayStarted(): Promise<number> {
  const relay = getGlobalRelay();
  if (relay.isStarted) {
    return Promise.resolve(relay.port);
  }
  if (!startPromise) {
    startPromise = relay.start().catch((err) => {
      startPromise = null;
      throw err;
    });
  }
  return startPromise;
}

/** Test-only: drops the singleton so the next getGlobalRelay() builds a fresh one. */
export function resetGlobalRelayForTests(): void {
  globalRelay?.close();
  globalRelay = null;
  startPromise = null;
}
