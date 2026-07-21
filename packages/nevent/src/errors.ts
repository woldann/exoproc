import { ExoprocError } from 'exoproc-utils';

abstract class BaseError extends ExoprocError {
  constructor(
    message: string,
    options?: { data?: unknown; code?: string; cause?: Error },
  ) {
    super(message, options);
  }
}

export class NEventError extends BaseError {}

export class CreateEventFailedError extends NEventError {
  constructor(public readonly lastError: number) {
    super(`CreateEventA failed in target process (GetLastError=${lastError})`);
  }
}

export class OpenDummyProcessFailedError extends NEventError {
  constructor(
    public readonly pid: number,
    public readonly lastError: number,
    public readonly inTarget: boolean,
  ) {
    super(
      `OpenProcess(${pid}) failed ${inTarget ? 'in target process' : 'in local process'} (GetLastError=${lastError})`,
    );
  }
}

export class DuplicateHandleFailedError extends NEventError {
  constructor(
    public readonly lastError: number,
    public readonly inTarget: boolean,
  ) {
    super(
      `DuplicateHandle failed ${inTarget ? 'in target process' : 'in local process'} (GetLastError=${lastError})`,
    );
  }
}
