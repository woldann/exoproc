import { DEFAULT_RELAY_PORT } from './protocol.js';
import { RelayServer } from './relay-server.js';
import { log } from './logger.js';

let globalRelay: RelayServer | null = null;
let startPromise: Promise<number> | null = null;

/**
 * The one shared, process-wide RelayServer every package should register
 * its opcodes against, instead of each constructing a private RelayServer
 * (which would each want the same default port and step on each other).
 * Constructing it here does not bind a socket by itself -- the actual bind
 * is driven by the auto-start below, or by calling
 * `ensureGlobalRelayStarted()` explicitly.
 */
export function getGlobalRelay(): RelayServer {
  if (!globalRelay) {
    globalRelay = new RelayServer();
  }
  return globalRelay;
}

/**
 * Binds and starts the global relay if it isn't already; safe to call
 * repeatedly or concurrently -- callers all await the same in-flight start.
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

/**
 * Resolves `true` if this process holds DEFAULT_RELAY_PORT (i.e. it won the
 * race to bind the well-known port and every later process on this machine
 * will find it there), `false` if another process already had it (this
 * process's relay fell back to an OS-assigned ephemeral port). A `false`
 * result is not an error -- this process's relay still works fully, it's
 * just not the one a fixed-port peer will discover.
 */
export function isPrimaryRelayInstance(): Promise<boolean> {
  return ensureGlobalRelayStarted()
    .then(() => getGlobalRelay().port === DEFAULT_RELAY_PORT)
    .catch((err) => {
      log.error(
        `bun-relay: failed to start the global relay: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    });
}

/** Test-only: drops the singleton so the next getGlobalRelay() builds a fresh one. */
export function resetGlobalRelayForTests(): void {
  globalRelay?.close();
  globalRelay = null;
  startPromise = null;
}

// Try to open the well-known relay port as soon as this module loads --
// fire-and-forget (isPrimaryRelayInstance() never throws), never blocks
// module evaluation. This is what actually establishes "am I the first
// process on this machine to load bun-relay" for anyone who cares, without
// every consumer having to remember to kick it off themselves.
void isPrimaryRelayInstance();
