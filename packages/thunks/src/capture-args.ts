/**
 * The "capture my own incoming arguments" machine code, produced and stored
 * here -- `call.ts` is a thin selection API on top of what's defined in this
 * file (same split as `call-bytes.ts`).
 */

import {
  createPendingMachineCode,
  type CMachineCode,
  type CTypeOrString,
} from 'bun-xffi';
import {
  Reg,
  jmpReg,
  immOp8,
  movRegImm64,
  movRegFromMemDisp8,
  movMemDisp8FromXmm,
  movMemDisp8FromReg,
  movRegFromSibDisp8,
  movSibDisp8FromReg,
  regRegOp,
  CALL_REGISTER_SLOTS,
  GPR_FOR_SLOT,
  assertValidMask,
} from './asm.js';

/**
 * Builds the raw bytes for an ordinary Win64 function -- callable with a
 * plain `call`, entered and returning exactly like any other function with
 * `argCount+1` arguments -- that writes the first `argCount` of them (per
 * `mask`, same as everywhere else) to a target address and returns that
 * address. The target address isn't a baked-in constant: it's simply
 * argument number `argCount` (0-indexed) -- always ptr-typed, so it lands in
 * whichever register or stack slot a plain Win64 argument at that position
 * would, exactly like any other argument. Since `argCount`/`mask` are known
 * ahead of time, the whole thing is fully unrolled -- no runtime loop.
 *
 * Making the target address an ordinary trailing argument (rather than an
 * immediate) is what makes this reusable across many different target
 * addresses -- see {@link buildFixedCaptureArgsBytes}, which supplies one
 * fixed address and calls into an injected instance of this.
 */
export function buildCaptureArgsBytes(
  argCount: number,
  mask: number,
): number[] {
  assertValidMask(mask);
  if (!Number.isInteger(argCount) || argCount < 0) {
    throw new RangeError(
      `argCount must be a non-negative integer, got ${argCount}`,
    );
  }

  const bytes: number[] = [];
  const emit = (chunk: readonly number[]): void => {
    bytes.push(...chunk);
  };

  // rax = targetAddress, argument #argCount (0-indexed) -- always ptr-typed
  // (never float), so it's wherever a plain Win64 argument at that position
  // would be: a GPR if argCount<4, else the stack slot right after the last
  // real argument. rax then doubles as the base for every store below and
  // (left untouched) the return value.
  if (argCount < CALL_REGISTER_SLOTS) {
    emit(regRegOp(0x89, Reg.RAX, GPR_FOR_SLOT[argCount]!));
  } else {
    const disp8 = 0x28 + (argCount - CALL_REGISTER_SLOTS) * 8;
    emit(movRegFromSibDisp8(Reg.RAX, Reg.RSP, Reg.RSP, 1, disp8));
  }

  const registerSlots = Math.min(CALL_REGISTER_SLOTS, argCount);
  for (let slot = 0; slot < registerSlots; slot++) {
    const disp8 = slot * 8;
    const useXmm = (mask & (1 << slot)) !== 0;
    emit(
      useXmm
        ? movMemDisp8FromXmm(Reg.RAX, disp8, slot)
        : movMemDisp8FromReg(Reg.RAX, disp8, GPR_FOR_SLOT[slot]!),
    );
  }

  // Stack args (5th argument onward) sit at [rsp + 0x28 + (slot-4)*8] at
  // entry (0x28 = 8-byte return address + 0x20 shadow space) -- copy each
  // straight through to its slot in targetAddress via a scratch register.
  for (let slot = CALL_REGISTER_SLOTS; slot < argCount; slot++) {
    const stackDisp8 = 0x28 + (slot - CALL_REGISTER_SLOTS) * 8;
    emit(movRegFromSibDisp8(Reg.R10, Reg.RSP, Reg.RSP, 1, stackDisp8));
    emit(movMemDisp8FromReg(Reg.RAX, slot * 8, Reg.R10));
  }

  bytes.push(0xc3); // ret (rax already holds targetAddress)

  return bytes;
}

function captureArgsSig(argCount: number, mask: number): CTypeOrString[] {
  const args: CTypeOrString[] = [];
  for (let slot = 0; slot < argCount; slot++) {
    args.push(
      slot < CALL_REGISTER_SLOTS && (mask & (1 << slot)) !== 0 ? 'f64' : 'u64',
    );
  }
  args.push('ptr'); // the trailing target-address argument
  return args;
}

const captureArgsVariantCache = new Map<string, CMachineCode>();

/**
 * The not-yet-injected `CMachineCode` for {@link buildCaptureArgsBytes} --
 * an ordinary `(...argCount args matching mask, targetAddress: ptr) => ptr`
 * function. Built lazily on first request and cached globally by
 * `argCount`+`mask` (not by any target address -- there isn't one baked in),
 * so it's reusable across as many different target addresses as callers
 * want, each just passing its own as the trailing argument.
 *
 * The exposed signature's leading args are `f64`/`u64` per `mask` for the
 * first 4 (matching whichever register class that slot actually reads), and
 * `u64` for any beyond that -- `mask` has no opinion on stack-argument
 * types, so `u64` is just a reasonable placeholder; pass a real
 * `CFunction`/`createCFunction` signature with the exact types you need once
 * this is injected, same as with any other `CMachineCode` here.
 */
export function captureArgsMachineCode(
  argCount: number,
  mask: number,
): CMachineCode {
  const key = `${argCount}_${mask}`;
  let cached = captureArgsVariantCache.get(key);
  if (!cached) {
    cached = createPendingMachineCode(
      ['ptr', captureArgsSig(argCount, mask)],
      buildCaptureArgsBytes(argCount, mask),
    );
    captureArgsVariantCache.set(key, cached);
  }
  return cached;
}

/**
 * Builds the raw bytes for a thunk bound to one fixed target address that
 * supplies it as the trailing argument to an already-injected
 * {@link buildCaptureArgsBytes} instance (`innerAddress`) -- entered exactly
 * like the real `argCount`-argument function being captured (e.g. a hooked
 * function's own entry, landed on via a jump), so this is what actually gets
 * wired into a jump-based hook. Always a true tail call (`jmp`, never
 * `call`): the inner code's own `ret` ends up returning directly to
 * *whoever called us*, exactly as if we were never in the chain at all.
 *
 * Two shapes, chosen by where argument #argCount (targetAddress) would
 * naturally fall:
 *
 * - `argCount < 4`: that slot is a register the real `argCount` arguments
 *   never use (register-slot assignment only depends on position, not on
 *   how many total arguments there are, so the real args are already
 *   sitting in the right registers, untouched). Just set that one register
 *   to `targetAddress` and tail-`jmp` straight into `innerAddress` -- no
 *   stack touched at all, so whatever shadow space our own caller already
 *   set up for us is exactly what the inner code needs too.
 * - `argCount >= 4`: that slot would be one stack slot past the last real
 *   stack argument -- memory our caller never reserved, so writing there
 *   would corrupt whatever comes after it. Instead this builds a fresh,
 *   correctly-aligned stack-args region (relocating the real overflow
 *   arguments from our own entry stack, then appending `targetAddress`) --
 *   but since a bare `jmp` doesn't push a return address the way `call`
 *   does, it also *relocates our own incoming return address* into the new
 *   frame's return-address slot before jumping, so the inner code's `ret`
 *   still finds a valid address there and returns straight past us.
 */
export function buildFixedCaptureArgsBytes(
  targetAddress: bigint,
  innerAddress: bigint,
  argCount: number,
  mask: number,
): number[] {
  assertValidMask(mask);
  if (!Number.isInteger(argCount) || argCount < 0) {
    throw new RangeError(
      `argCount must be a non-negative integer, got ${argCount}`,
    );
  }

  const targetSlot = argCount; // 0-indexed position of the trailing argument
  const bytes: number[] = [];
  const emit = (chunk: readonly number[]): void => {
    bytes.push(...chunk);
  };

  if (targetSlot < CALL_REGISTER_SLOTS) {
    emit(movRegImm64(GPR_FOR_SLOT[targetSlot]!, targetAddress));
    emit(movRegImm64(Reg.RAX, innerAddress));
    emit(jmpReg(Reg.RAX));
    return bytes;
  }

  // r11 = snapshot of our own entry rsp -- read-only reference for both the
  // original return address and the real overflow stack args, needed since
  // we're about to move rsp out from under them.
  emit(regRegOp(0x89, Reg.R11, Reg.RSP));

  // Includes targetAddress itself as the last of these. Frame = relocated
  // return address (8) + shadow space (0x20) + these stack args, and must
  // land back on the standard "entry rsp % 16 == 8" parity after the jmp
  // (mirroring what `call` would have produced) -- since nothing here plays
  // the "push rbx" trick's role of pre-shifting parity by 8 the way
  // buildCallBytes does, paddedCount must round up to *odd*, not even, for
  // the total frame size to land on a 16-byte boundary.
  const innerStackArgCount = targetSlot - CALL_REGISTER_SLOTS + 1;
  const paddedCount = innerStackArgCount | 1;
  const totalFrameSize = 8 + 0x20 + paddedCount * 8;
  emit(immOp8(5, Reg.RSP, totalFrameSize)); // rsp -= totalFrameSize

  // Relocate our own incoming return address into the new frame's RA slot,
  // so the inner code's `ret` still returns somewhere valid -- straight
  // past us, to our own caller.
  emit(movRegFromMemDisp8(Reg.R10, Reg.R11, 0));
  emit(movSibDisp8FromReg(Reg.R10, Reg.RSP, Reg.RSP, 1, 0));

  for (let i = 0; i < innerStackArgCount; i++) {
    if (i === innerStackArgCount - 1) {
      emit(movRegImm64(Reg.R10, targetAddress));
    } else {
      // Relay a real overflow argument from our own entry stack, at
      // [entryRsp + 0x28 + i*8] (0x28 = original RA + shadow space).
      emit(movRegFromMemDisp8(Reg.R10, Reg.R11, 0x28 + i * 8));
    }
    emit(movSibDisp8FromReg(Reg.R10, Reg.RSP, Reg.RSP, 1, 0x28 + i * 8));
  }

  emit(movRegImm64(Reg.RAX, innerAddress));
  emit(jmpReg(Reg.RAX));

  return bytes;
}

const fixedCaptureArgsVariantCache = new Map<string, CMachineCode>();

/**
 * The not-yet-injected `CMachineCode` for {@link buildFixedCaptureArgsBytes}
 * (signature: `(...argCount args matching mask) => ptr`, same as the real
 * function being captured -- `targetAddress`/`innerAddress` are baked in,
 * not part of the call). Built lazily on first request and cached globally
 * by all four arguments.
 */
export function fixedCaptureArgsMachineCode(
  targetAddress: bigint,
  innerAddress: bigint,
  argCount: number,
  mask: number,
): CMachineCode {
  const key = `${targetAddress}_${innerAddress}_${argCount}_${mask}`;
  let cached = fixedCaptureArgsVariantCache.get(key);
  if (!cached) {
    const args = captureArgsSig(argCount, mask).slice(0, argCount);
    cached = createPendingMachineCode(
      ['ptr', args],
      buildFixedCaptureArgsBytes(targetAddress, innerAddress, argCount, mask),
    );
    fixedCaptureArgsVariantCache.set(key, cached);
  }
  return cached;
}
