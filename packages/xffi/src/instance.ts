import {
  DEFAULT_RELAY_PORT,
  ensureGlobalRelayStarted,
  getGlobalRelay,
} from 'bun-relay';
import { log } from './logger.js';

let isPrimaryPromise: Promise<boolean> | null = null;

/**
 * exoproc is meant to run as one coordinating process per machine: whichever
 * process gets here first binds the well-known relay port and effectively
 * *is* the daemon for every other exoproc process on the machine, while
 * continuing to run as a completely normal application otherwise -- there is
 * no separate daemon binary to install or manage.
 *
 * Resolves `true` if this process won that race (holds DEFAULT_RELAY_PORT),
 * `false` if another process already had it (this one's relay fell back to
 * an ephemeral port -- bun-relay itself doesn't know or care why, this is
 * where that fallback gets its meaning). A `false` result is not an error:
 * this process keeps running fully, it's just not the one a fixed-port
 * native client will find.
 */
export function isPrimaryExoprocInstance(): Promise<boolean> {
  if (!isPrimaryPromise) {
    isPrimaryPromise = ensureGlobalRelayStarted()
      .then(() => getGlobalRelay().port === DEFAULT_RELAY_PORT)
      .catch((err) => {
        log.error(
          `Failed to start the exoproc relay: ${err instanceof Error ? err.message : err}`,
        );
        return false;
      });
  }
  return isPrimaryPromise;
}

// Kick this off as soon as xffi loads -- fire-and-forget, never throws (see
// the .catch above), never blocks module evaluation. Every real consumer of
// this toolkit depends on xffi, so this is the earliest common point to
// establish which process is primary.
void isPrimaryExoprocInstance();
