import type { X64Register64, X64XmmRegister } from 'exoproc-asm';
import { normalizeType, type CTypeOrString } from 'bun-xffi';

/** Register-argument slots (RCX/RDX/R8/R9 or XMM0-3) a variant mask covers. */
export const CALL_REGISTER_SLOTS = 4;
/** One variant per integer/floating-point combination of the register slots. */
export const CALL_VARIANT_COUNT = 1 << CALL_REGISTER_SLOTS;

export const GPR_FOR_SLOT = [
  'rcx',
  'rdx',
  'r8',
  'r9',
] as const satisfies readonly X64Register64[];

export const XMM_FOR_SLOT = [
  'xmm0',
  'xmm1',
  'xmm2',
  'xmm3',
] as const satisfies readonly X64XmmRegister[];

export function gprForSlot(slot: number): X64Register64 {
  const register = GPR_FOR_SLOT[slot];
  if (register === undefined) {
    throw new RangeError(
      `register argument slot must be between 0 and ${CALL_REGISTER_SLOTS - 1}, got ${slot}`,
    );
  }
  return register;
}

export function xmmForSlot(slot: number): X64XmmRegister {
  const register = XMM_FOR_SLOT[slot];
  if (register === undefined) {
    throw new RangeError(
      `XMM argument slot must be between 0 and ${CALL_REGISTER_SLOTS - 1}, got ${slot}`,
    );
  }
  return register;
}

export function assertValidMask(mask: number): void {
  if (!Number.isInteger(mask) || mask < 0 || mask >= CALL_VARIANT_COUNT) {
    throw new RangeError(
      `Variant mask must be an integer in [0, ${CALL_VARIANT_COUNT - 1}], got ${mask}`,
    );
  }
}

/**
 * Sets bit i when argument i (of the first four) is passed through XMM_i rather
 * than the corresponding integer argument register.
 */
export function maskFromArgTypes(argTypes: readonly CTypeOrString[]): number {
  let mask = 0;
  for (
    let slot = 0;
    slot < CALL_REGISTER_SLOTS && slot < argTypes.length;
    slot++
  ) {
    const type = normalizeType(argTypes[slot]);
    if (type === 'f32' || type === 'f64') mask |= 1 << slot;
  }
  return mask;
}

/** A fixed immediate or an explicitly selected runtime source register. */
export type Operand = bigint | X64Register64;
