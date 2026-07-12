import { ExoprocError } from 'exoproc-utils';

abstract class BaseError extends ExoprocError {
  constructor(
    message: string,
    options?: { data?: unknown; code?: string; cause?: Error },
  ) {
    super(message, options);
  }
}

export class NshmError extends BaseError {}

export class CreateFileMappingFailedError extends NshmError {
  constructor(public readonly lastError: number) {
    super(
      `CreateFileMappingA failed in target process (GetLastError=${lastError})`,
    );
  }
}

export class SpawnDummyProcessFailedError extends NshmError {
  constructor(public readonly executable: string) {
    super(`Failed to spawn dummy relay process (${executable})`);
  }
}

export class OpenDummyProcessFailedError extends NshmError {
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

export class DuplicateHandleFailedError extends NshmError {
  constructor(
    public readonly lastError: number,
    public readonly inTarget: boolean,
  ) {
    super(
      `DuplicateHandle failed ${inTarget ? 'in target process' : 'in local process'} (GetLastError=${lastError})`,
    );
  }
}

export class MapViewOfFileFailedError extends NshmError {
  constructor(public readonly lastError: number) {
    super(`MapViewOfFile failed in local process (GetLastError=${lastError})`);
  }
}
