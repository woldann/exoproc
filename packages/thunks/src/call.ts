import {
  createPendingMachineCode,
  normalizeType,
  resolveAddress,
  MemoryProtection,
  type CFunction,
  type CMachineCode,
  type CTypeOrString,
  type ICallableMemoryAccessor,
} from 'bun-xffi';
import { CALL_REGISTER_SLOTS } from './asm.js';
import { callMachineCode, fixedCallMachineCode } from './call-bytes.js';
import {
  captureArgsMachineCode,
  fixedCaptureArgsMachineCode,
} from './capture-args.js';

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
 * Like {@link callMachineCodeFor}, but bakes `target.ptr` and
 * `target.args.length` into the machine code itself instead of taking them
 * as runtime arguments -- for a real `CFunction` they're already fixed, so
 * the resulting thunk only takes one argument (the args buffer) rather than
 * three. Cached globally by `target.ptr` + argument count (see
 * {@link fixedCallMachineCode}), so calling this again for the same target
 * returns the same object rather than re-emitting the same bytes.
 */
export function fixedCallMachineCodeFor(
  target: Pick<CFunction, 'ptr' | 'args' | 'returns'>,
): CMachineCode {
  const mask = maskFromArgTypes(target.args);
  const functionPointer = BigInt(resolveAddress(target.ptr));
  return fixedCallMachineCode(
    functionPointer,
    target.args.length,
    mask,
    target.returns,
  );
}

/**
 * Picks the mask for `argTypes` and builds the {@link captureArgsMachineCode}
 * for it -- so callers describe the signature they want to capture the same
 * way they'd describe any other target (a plain `CTypeOrString[]`) instead
 * of computing a mask by hand.
 */
export function captureArgsMachineCodeFor(
  argTypes: readonly CTypeOrString[],
): CMachineCode {
  const mask = maskFromArgTypes(argTypes);
  return captureArgsMachineCode(argTypes.length, mask);
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

const CHAINED_HEADER_SIZE = 24; // targetPtr + targetArgCount + self-pointer, 8 bytes each

// Per-accessor (the injected address is only meaningful within that one
// process), per-(mask,category) cache -- built the first time
// chainedCallMachineCode is called for a given (accessor, mask, category),
// reused after that so repeat calls don't re-inject callMachineCode into the
// same process over and over. WeakMap on the accessor so entries don't
// outlive it.
const chainedCache = new WeakMap<
  ICallableMemoryAccessor,
  Map<string, CMachineCode>
>();

/**
 * Injects a `callMachineCode(mask, category)` instance into `accessor`'s
 * process, then builds a {@link fixedCallMachineCode} bound to that (now
 * known) remote address with argCount=3, mask=0 -- i.e. a *single-argument*
 * thunk that, given the buffer {@link packChainedArgs} builds, can call any
 * function matching `(mask, category)` through that one argument alone. Two
 * genuinely separate `CMachineCode`s, never fused into one blob: inject the
 * returned one the normal way via `accessor.machineCode(...)`.
 *
 * `mask`/`category` here describe the *real* target eventually reached
 * through this chain -- e.g. a target whose 2nd argument is a `double` needs
 * `mask` with bit 1 set, same as calling `callMachineCode(mask, ...)`
 * directly would. Don't confuse this with the *outer* fixed thunk's own
 * mask, which is always 0 regardless: its 3 logical arguments (the inner
 * callMachineCode's `ptr, u64, ptr` signature) are never float, so there's
 * exactly one correct choice for that one.
 */
export async function chainedCallMachineCode(
  accessor: ICallableMemoryAccessor,
  mask: number,
  category: 'int' | 'float' = 'int',
): Promise<CMachineCode> {
  let perAccessor = chainedCache.get(accessor);
  if (!perAccessor) {
    perAccessor = new Map();
    chainedCache.set(accessor, perAccessor);
  }
  const key = `${mask}_${category}`;
  let cached = perAccessor.get(key);
  if (!cached) {
    const inner = callMachineCode(mask, category);
    const innerAddr = await accessor.machineCode(inner);
    const returns: CTypeOrString = category === 'float' ? 'f64' : 'u64';
    cached = fixedCallMachineCode(BigInt(innerAddr), 3, 0, returns);
    perAccessor.set(key, cached);
  }
  return cached;
}

/**
 * Builds the single combined buffer {@link chainedCallMachineCode}'s thunk
 * expects as its one argument: `[targetPointer, targetArgCount,
 * selfPointer, ...packArgs(values, argTypes)]`, where `selfPointer` is this
 * same buffer's own remote address + `CHAINED_HEADER_SIZE` rather than a
 * pointer into a separate allocation -- one buffer holds everything the
 * inner `callMachineCode` needs (the target's ptr/argCount/argsPtr) *and*
 * the real arguments themselves, since `argsPtr` only needs to point at
 * where the real args happen to start, which is always exactly
 * `CHAINED_HEADER_SIZE` bytes in, regardless of how many of them there are.
 * Allocates and writes it remotely (via `accessor`); returns the address to
 * pass as `chainedCallMachineCode`'s single argument.
 */
export async function packChainedArgs(
  accessor: ICallableMemoryAccessor,
  targetPointer: bigint,
  values: readonly (number | bigint)[],
  argTypes: readonly CTypeOrString[],
): Promise<number> {
  const realArgsBuf = packArgs(values, argTypes);
  const addr = Number(
    resolveAddress(
      await accessor.alloc(
        CHAINED_HEADER_SIZE + realArgsBuf.length,
        null,
        MemoryProtection.READWRITE,
      ),
    ),
  );

  const header = Buffer.alloc(CHAINED_HEADER_SIZE);
  header.writeBigUInt64LE(BigInt.asUintN(64, targetPointer), 0);
  header.writeBigUInt64LE(BigInt(values.length), 8);
  header.writeBigUInt64LE(BigInt(addr + CHAINED_HEADER_SIZE), 16);
  await accessor.write(addr, Buffer.concat([header, realArgsBuf]));

  return addr;
}

// Per-accessor, per-(argCount,mask) cache -- the injected captureArgsMachineCode
// instance is reusable across as many different targetAddresses as callers
// want (it takes targetAddress as its own trailing argument), so this only
// needs to inject it once per (accessor, argCount, mask), not once per
// targetAddress.
const chainedCaptureCache = new WeakMap<
  ICallableMemoryAccessor,
  Map<string, number>
>();

/**
 * Injects a `captureArgsMachineCode(argCount, mask)` instance into
 * `accessor`'s process (reused across calls for the same `(accessor,
 * argCount, mask)` regardless of `targetAddress`), then builds a
 * {@link fixedCaptureArgsMachineCode} bound to that address and
 * `targetAddress` -- i.e. the actual thunk to wire into a jump-based hook
 * for one specific hook site, entered exactly like the real `argCount`
 * -argument function being captured. Two genuinely separate `CMachineCode`s,
 * never fused into one blob.
 */
export async function chainedCaptureArgsMachineCode(
  accessor: ICallableMemoryAccessor,
  targetAddress: bigint,
  argCount: number,
  mask: number,
): Promise<CMachineCode> {
  let perAccessor = chainedCaptureCache.get(accessor);
  if (!perAccessor) {
    perAccessor = new Map();
    chainedCaptureCache.set(accessor, perAccessor);
  }
  const key = `${argCount}_${mask}`;
  let innerAddr = perAccessor.get(key);
  if (innerAddr === undefined) {
    innerAddr = await accessor.machineCode(
      captureArgsMachineCode(argCount, mask),
    );
    perAccessor.set(key, innerAddr);
  }
  return fixedCaptureArgsMachineCode(
    targetAddress,
    BigInt(innerAddr),
    argCount,
    mask,
  );
}
