import {
  createPendingMachineCode,
  normalizeType,
  type CFunction,
  type CMachineCode,
  type CTypeOrString,
} from 'bun-xffi';
import { callMachineCode, CALL_REGISTER_SLOTS } from './win64.js';

/**
 * Picks the variant mask for a real target signature: bit i is set when
 * argument i (of the first 4) is a float/double, so it lands in XMM_i instead
 * of the GPR pair. Arguments beyond the first 4 need no such distinction.
 */
export function maskFromArgTypes(argTypes: readonly CTypeOrString[]): number {
  let mask = 0;
  for (let i = 0; i < CALL_REGISTER_SLOTS && i < argTypes.length; i++) {
    const norm = normalizeType(argTypes[i]);
    if (norm === 'f32' || norm === 'f64') mask |= 1 << i;
  }
  return mask;
}

/**
 * Picks the right variant for `target` directly (mask from `target.args`,
 * signature tagged with `target.returns`) so calling code doesn't have to
 * derive the mask or the return-tagged signature itself. Reuses one of the
 * 32 globally-cached variants as-is when `target.returns` normalizes to
 * exactly `u64` or `f64` (the two defaults); otherwise builds one more
 * precisely-tagged wrapper, still reusing that variant's already-built bytes
 * rather than regenerating them.
 */
export function callMachineCodeFor(
  target: Pick<CFunction, 'args' | 'returns'>,
): CMachineCode {
  const mask = maskFromArgTypes(target.args);
  const norm = normalizeType(target.returns);
  const isFloat = norm === 'f32' || norm === 'f64';
  const base = callMachineCode(mask, isFloat ? 'float' : 'int');
  if (normalizeType(base.returns) === norm) return base;
  return createPendingMachineCode(
    [target.returns, ['ptr', 'u64', 'ptr']],
    base.bytes,
  );
}

/**
 * Packs call arguments into the flat 8-byte-per-slot buffer the call
 * machine code reads `args` from (at least `CALL_REGISTER_SLOTS` slots, even
 * if fewer real arguments are given).
 */
export function packArgs(
  values: readonly (number | bigint)[],
  argTypes: readonly CTypeOrString[],
): Buffer {
  const slotCount = Math.max(values.length, CALL_REGISTER_SLOTS);
  const buf = Buffer.alloc(slotCount * 8);
  for (let i = 0; i < values.length; i++) {
    const norm = normalizeType(argTypes[i]);
    const v = values[i]!;
    if (norm === 'f32') buf.writeFloatLE(Number(v), i * 8);
    else if (norm === 'f64') buf.writeDoubleLE(Number(v), i * 8);
    else buf.writeBigUInt64LE(BigInt(v), i * 8);
  }
  return buf;
}
