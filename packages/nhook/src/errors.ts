import { ExoprocError } from 'exoproc-utils';

// ── Base ──────────────────────────────────────────────────────────────────────

abstract class BaseError extends ExoprocError {
  constructor(
    message: string,
    options?: { data?: unknown; code?: string; cause?: Error },
  ) {
    super(message, options);
  }
}

// ── Hook errors ───────────────────────────────────────────────────────────────

export class NHookError extends BaseError {}

export class HookAlreadyEnabledError extends NHookError {
  constructor(target: bigint) {
    super(`Hook at 0x${target.toString(16)} is already enabled`);
  }
}

export class HookNotEnabledError extends NHookError {
  constructor(target: bigint) {
    super(`Hook at 0x${target.toString(16)} is not enabled`);
  }
}

export class HookDestroyedError extends NHookError {
  constructor(target: bigint) {
    super(`Hook at 0x${target.toString(16)} has been destroyed`);
  }
}

/**
 * Thrown by {@link NHook.poll} when the target process no longer has any
 * threads -- every live process has at least one, so this means `pid` has
 * exited (or never existed).
 */
export class ProcessExitedError extends NHookError {
  constructor(
    public readonly pid: number,
    options?: { cause?: Error },
  ) {
    super(`Process ${pid} has exited (no threads found)`, options);
  }
}
