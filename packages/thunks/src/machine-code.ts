export {
  assertValidMask,
  CALL_REGISTER_SLOTS,
  CALL_VARIANT_COUNT,
  GPR_FOR_SLOT,
  XMM_FOR_SLOT,
  gprForSlot,
  maskFromArgTypes,
  xmmForSlot,
  type Operand,
} from './abi.js';
export type { X64Register64, X64XmmRegister } from 'exoproc-asm';
export {
  buildCallBytes,
  buildCallThunkBytes,
  createCallThunk,
  type BuildCallThunkOptions,
  type CallInvokeStyle,
} from './call-bytes.js';
export {
  buildCaptureArgsBytes,
  buildCaptureArgsThunkBytes,
  createCaptureArgsThunk,
  buildFixedCaptureArgsBytes,
  buildCaptureAdapterThunkBytes,
  createCaptureAdapterThunk,
  type BuildCaptureAdapterThunkOptions,
} from './capture-args.js';
