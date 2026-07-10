import { Kernel32Impl } from './win/kernel32.js';

export type WaitOutcome = 'signaled' | 'timeout';

const WAIT_OBJECT_0 = 0;

/**
 * A few immediate checks (no delay at all) before backing off -- catches a
 * handle that's already signaled, or signals within microseconds, without
 * ever touching a timer.
 */
const INSTANT_CHECKS = 3;

/** Poll interval never grows past this, once the backoff ramp reaches it. */
const MAX_POLL_INTERVAL_MS = 10;

function pollDelayMs(attempt: number): number {
  if (attempt < INSTANT_CHECKS) return 0;
  return Math.min(attempt - INSTANT_CHECKS + 1, MAX_POLL_INTERVAL_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits for `handle` to signal, or `timeoutMs` to elapse (pass a negative
 * number for an infinite wait), without blocking this thread.
 *
 * Just a non-blocking `WaitForSingleObject(handle, 0)` poll loop -- each
 * check returns immediately (a real OS query, not a wait), and the `await
 * setTimeout(...)` between checks already yields to the event loop, so
 * this never blocks JS execution regardless of how long the overall wait
 * ends up taking. No separate thread is needed here.
 *
 * The poll interval ramps up (`pollDelayMs`) rather than staying fixed:
 * a few instant re-checks first (catches near-immediate signals with zero
 * delay), then 1ms, 2ms, ... up to `MAX_POLL_INTERVAL_MS`, so a wait that
 * resolves quickly is caught with low latency while one that runs long
 * settles into infrequent, cheap checks instead of polling tightly the
 * whole time.
 */
export async function waitAsync(
  handle: bigint,
  timeoutMs: number,
): Promise<WaitOutcome> {
  const deadline = timeoutMs < 0 ? Infinity : performance.now() + timeoutMs;

  for (let attempt = 0; ; attempt++) {
    if (Kernel32Impl.WaitForSingleObject(handle, 0) === WAIT_OBJECT_0) {
      return 'signaled';
    }
    if (performance.now() >= deadline) {
      return 'timeout';
    }
    const delay = pollDelayMs(attempt);
    if (delay > 0) {
      await sleep(delay);
    }
  }
}
