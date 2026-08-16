import type {
  AddressLike,
  CFunction,
  CMachineCode,
  CTypeOrString,
  ICallableMemoryAccessor,
} from 'bun-xffi';
import type { CallInvokeStyle } from './call-bytes.js';

/** The ABI shape a thunk adapts without requiring a callable local address. */
export interface ThunkSignature {
  readonly returns: CTypeOrString;
  readonly args: readonly CTypeOrString[];
}

/** A machine-code thunk installed in one accessor's target process. */
export interface InstalledThunk {
  readonly accessor: ICallableMemoryAccessor;
  readonly machineCode: CMachineCode;
  readonly address: number;
  readonly fn: CFunction;
}

export type CallThunkMode = 'dynamic' | 'bound' | 'packed';

interface InstallCallThunkBase {
  readonly signature: ThunkSignature;
}

export interface InstallDynamicCallThunkOptions extends InstallCallThunkBase {
  readonly mode: 'dynamic';
  readonly invokeStyle?: CallInvokeStyle;
}

export interface InstallBoundCallThunkOptions extends InstallCallThunkBase {
  readonly mode: 'bound';
  /** Must be valid in the accessor's target process. */
  readonly target: AddressLike;
  readonly invokeStyle?: CallInvokeStyle;
}

export interface InstallPackedCallThunkOptions extends InstallCallThunkBase {
  readonly mode: 'packed';
}

export type InstallCallThunkOptions =
  | InstallDynamicCallThunkOptions
  | InstallBoundCallThunkOptions
  | InstallPackedCallThunkOptions;

export interface AllocateCallPayloadOptions {
  readonly values: readonly (number | bigint)[];
  /**
   * Required by dynamic/packed call thunks and omitted by bound thunks. Must
   * be an address in the installed thunk's target process.
   */
  readonly target?: AddressLike;
}

/** A remotely allocated call payload and the arguments needed to invoke it. */
export interface AllocatedCallPayload {
  readonly address: number;
  readonly byteLength: number;
  readonly callArgs: readonly (number | bigint)[];
  readonly isDisposed: boolean;
  dispose(): Promise<void>;
}

export interface InstalledCallThunk extends InstalledThunk {
  readonly mode: CallThunkMode;
  readonly signature: ThunkSignature;
  allocatePayload(
    options: AllocateCallPayloadOptions,
  ): Promise<AllocatedCallPayload>;
}

export interface InstallCaptureArgsThunkOptions {
  readonly args: readonly CTypeOrString[];
}

export interface InstalledCaptureArgsThunk extends InstalledThunk {
  readonly args: readonly CTypeOrString[];
}

export interface InstallCaptureHookThunkOptions {
  readonly args: readonly CTypeOrString[];
  readonly destination: AddressLike;
  /**
   * Optional reusable collector. It must have been installed through the same
   * accessor and have the exact same argument signature.
   */
  readonly collector?: InstalledCaptureArgsThunk;
}

export interface InstalledCaptureHookThunk extends InstalledThunk {
  readonly args: readonly CTypeOrString[];
  readonly destination: number;
  readonly collector: InstalledCaptureArgsThunk;
}
