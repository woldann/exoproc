/**
 * Minimal hand-rolled x64 instruction encoders -- just the handful of forms
 * needed to hand-assemble Win64 calling-convention thunks in this package.
 * Not a general assembler: every helper below covers exactly one
 * addressing-mode/opcode shape, verified by hand against the Intel SDM.
 *
 * This file also produces and stores the actual Win64 call machine code
 * itself (`buildCallBytes`/`callMachineCode`), not just the raw encoders --
 * `call.ts` is a thin selection/packing API on top of what's defined here.
 */

import {
  createPendingMachineCode,
  type CMachineCode,
  type CTypeOrString,
} from 'bun-xffi';

export const Reg = {
  RAX: 0,
  RCX: 1,
  RDX: 2,
  RBX: 3,
  RSP: 4,
  RBP: 5,
  RSI: 6,
  RDI: 7,
  R8: 8,
  R9: 9,
  R10: 10,
  R11: 11,
  R12: 12,
  R13: 13,
  R14: 14,
  R15: 15,
} as const;
export type Reg = (typeof Reg)[keyof typeof Reg];

export const JCC = {
  /** Jump if not sign (SF=0). */
  JNS: 0x79,
  /** Jump if greater-or-equal, signed (SF=OF). */
  JGE: 0x7d,
} as const;

function rex(w: boolean, r: boolean, x: boolean, b: boolean): number {
  return 0x40 | (w ? 8 : 0) | (r ? 4 : 0) | (x ? 2 : 0) | (b ? 1 : 0);
}

/**
 * `op r/m64, r64` register-register form, e.g. opcode 0x89 = MOV, 0x29 = SUB,
 * 0x01 = ADD, 0x39 = CMP, 0x31 = XOR. Semantics follow Intel order: `rm` is
 * the r/m (destination) operand, `reg` is the reg (source) operand -- so
 * `regRegOp(0x89, dst, src)` reads as "mov dst, src".
 */
export function regRegOp(opcode: number, rm: Reg, reg: Reg): number[] {
  return [
    rex(true, reg >= 8, false, rm >= 8),
    opcode,
    0xc0 | ((reg & 7) << 3) | (rm & 7),
  ];
}

/**
 * `op r/m64, imm8` (sign-extended), REX.W 83 /n ib. `opcodeExt` is the group-1
 * extension: ADD=0, OR=1, AND=4, SUB=5, CMP=7.
 */
export function immOp8(opcodeExt: number, rm: Reg, imm8: number): number[] {
  return [
    rex(true, false, false, rm >= 8),
    0x83,
    0xc0 | (opcodeExt << 3) | (rm & 7),
    imm8 & 0xff,
  ];
}

/** `shl r/m64, imm8` (REX.W C1 /4 ib). */
export function shlImm8(rm: Reg, imm8: number): number[] {
  return [
    rex(true, false, false, rm >= 8),
    0xc1,
    0xc0 | (4 << 3) | (rm & 7),
    imm8 & 0xff,
  ];
}

/** `inc r/m64` (REX.W FF /0). */
export function incReg(rm: Reg): number[] {
  return [rex(true, false, false, rm >= 8), 0xff, 0xc0 | (rm & 7)];
}

export function pushReg(reg: Reg): number[] {
  return reg >= 8 ? [0x41, 0x50 | (reg & 7)] : [0x50 | reg];
}

export function popReg(reg: Reg): number[] {
  return reg >= 8 ? [0x41, 0x58 | (reg & 7)] : [0x58 | reg];
}

/** `call r/m64` (FF /2). No REX.W needed -- near CALL is always 64-bit in long mode. */
export function callReg(reg: Reg): number[] {
  const modrm = 0xc0 | (2 << 3) | (reg & 7);
  return reg >= 8 ? [0x41, 0xff, modrm] : [0xff, modrm];
}

/** `mov r64, [base + disp8]`. `base` must not be RSP/R12 (those require a SIB byte). */
export function movRegFromMemDisp8(
  dst: Reg,
  base: Reg,
  disp8: number,
): number[] {
  return [
    rex(true, dst >= 8, false, base >= 8),
    0x8b,
    0x40 | ((dst & 7) << 3) | (base & 7),
    disp8 & 0xff,
  ];
}

/** `mov [base + disp8], r64`. `base` must not be RSP/R12 (those require a SIB byte). */
export function movMemDisp8FromReg(
  base: Reg,
  disp8: number,
  src: Reg,
): number[] {
  return [
    rex(true, src >= 8, false, base >= 8),
    0x89,
    0x40 | ((src & 7) << 3) | (base & 7),
    disp8 & 0xff,
  ];
}

/**
 * `movq xmm, [base + disp8]` (66 REX.W 0F 6E /r) -- loads 8 bytes into the low
 * 64 bits of `xmm`, zero-extending the rest. Works uniformly whether the
 * source value is actually a `float` or a `double`: the callee only ever
 * reads however many low bits its own parameter type calls for.
 */
export function movqXmmFromMemDisp8(
  xmm: number,
  base: Reg,
  disp8: number,
): number[] {
  return [
    0x66,
    rex(true, xmm >= 8, false, base >= 8),
    0x0f,
    0x6e,
    0x40 | ((xmm & 7) << 3) | (base & 7),
    disp8 & 0xff,
  ];
}

/** `movq r64, xmm` (66 REX.W 0F 7E /r) -- moves the low 64 bits of `xmm` into a GPR. */
export function movRegFromXmm(dst: Reg, xmm: number): number[] {
  return [
    0x66,
    rex(true, xmm >= 8, false, dst >= 8),
    0x0f,
    0x7e,
    0xc0 | ((xmm & 7) << 3) | (dst & 7),
  ];
}

/** `movq xmm, r64` (66 REX.W 0F 6E /r, register-direct) -- the reverse of {@link movRegFromXmm}. */
export function movXmmFromReg(xmm: number, src: Reg): number[] {
  return [
    0x66,
    rex(true, xmm >= 8, false, src >= 8),
    0x0f,
    0x6e,
    0xc0 | ((xmm & 7) << 3) | (src & 7),
  ];
}

const SIB_SCALE: Record<1 | 2 | 4 | 8, number> = { 1: 0, 2: 1, 4: 2, 8: 3 };

/** `mov r64, [base + index*scale + disp8]`. */
export function movRegFromSibDisp8(
  dst: Reg,
  base: Reg,
  index: Reg,
  scale: 1 | 2 | 4 | 8,
  disp8: number,
): number[] {
  return [
    rex(true, dst >= 8, index >= 8, base >= 8),
    0x8b,
    0x40 | ((dst & 7) << 3) | 0x04,
    (SIB_SCALE[scale] << 6) | ((index & 7) << 3) | (base & 7),
    disp8 & 0xff,
  ];
}

/** `mov [base + index*scale], r64` with zero displacement (`base` must not be RBP/R13). */
export function movSibDisp0FromReg(
  src: Reg,
  base: Reg,
  index: Reg,
  scale: 1 | 2 | 4 | 8,
): number[] {
  return [
    rex(true, src >= 8, index >= 8, base >= 8),
    0x89,
    ((src & 7) << 3) | 0x04,
    (SIB_SCALE[scale] << 6) | ((index & 7) << 3) | (base & 7),
  ];
}

export function jccShort(cc: number, rel8: number): number[] {
  return [cc, rel8 & 0xff];
}

export function jmpShort(rel8: number): number[] {
  return [0xeb, rel8 & 0xff];
}

/** Register-argument slots (RCX/RDX/R8/R9 or XMM0-3) a variant mask covers. */
export const CALL_REGISTER_SLOTS = 4;
/** 2^4 -- one variant per int/float combination of the first 4 argument slots. */
export const CALL_VARIANT_COUNT = 1 << CALL_REGISTER_SLOTS;

const GPR_FOR_SLOT: readonly Reg[] = [Reg.RCX, Reg.RDX, Reg.R8, Reg.R9];

function assertValidCallMask(mask: number): void {
  if (!Number.isInteger(mask) || mask < 0 || mask >= CALL_VARIANT_COUNT) {
    throw new RangeError(
      `Call variant mask must be an integer in [0, ${CALL_VARIANT_COUNT - 1}], got ${mask}`,
    );
  }
}

/**
 * Builds the raw bytes for a thunk that calls an arbitrary function pointer
 * with a runtime-sized argument list, per the Win64 calling convention.
 *
 * Entry (Win64 ABI): RCX=functionPointer, RDX=argCount, R8=args -- a flat
 * buffer of 8-byte slots. The caller must reserve at least 4 slots even when
 * argCount<4: slots 0-3 are always read regardless of the real argCount,
 * since an unused register/XMM the callee has no matching parameter for is
 * simply never looked at.
 *
 * `mask` bit i (0-3) selects XMM_i (1) or the GPR pair RCX/RDX/R8/R9 (0) for
 * register-argument slot i -- this has to be picked per callsite because the
 * thunk has no per-argument type tag to branch on at runtime. Arguments
 * beyond the first 4 have no such ambiguity: they're always copied onto the
 * stack as raw 8-byte values (works for int or float alike), with no upper
 * bound on argCount.
 *
 * The return value needs no variant of its own: once `call` returns, the
 * target has already left its result in RAX (int/ptr) or XMM0 (float/double)
 * per the ABI -- callers just pick which register to read via the `returns`
 * type on the `CFunction`/`CMachineCode` they wrap the injected address with.
 */
export function buildCallBytes(mask: number): number[] {
  assertValidCallMask(mask);

  const bytes: number[] = [];
  const emit = (chunk: readonly number[]): void => {
    bytes.push(...chunk);
  };

  // Preserve caller's RBX and use it as a stack-frame anchor: since RBX is
  // callee-saved, the target function preserves it across `call`, so
  // cleanup afterward is just "mov rsp,rbx; pop rbx" regardless of how much
  // stack space we used for the args -- no bookkeeping needed post-call.
  emit(pushReg(Reg.RBX));
  emit(regRegOp(0x89, Reg.RBX, Reg.RSP));

  emit(regRegOp(0x89, Reg.RAX, Reg.RCX)); // rax = functionPointer
  emit(regRegOp(0x89, Reg.R10, Reg.RDX)); // r10 = argCount
  emit(regRegOp(0x89, Reg.R11, Reg.R8)); // r11 = args pointer

  // r10 = M = max(argCount - 4, 0)
  emit(immOp8(5, Reg.R10, CALL_REGISTER_SLOTS));
  const clampBytes = regRegOp(0x31, Reg.R10, Reg.R10); // xor r10,r10
  emit(jccShort(JCC.JNS, clampBytes.length)); // argCount-4 >= 0 -> skip clamp
  emit(clampBytes);

  // paddedM = M rounded up to even (keeps the call site 16-byte aligned,
  // since entry RSP%16=8 and pushRbx leaves it at 0); reserve paddedM*8 bytes.
  emit(regRegOp(0x89, Reg.R9, Reg.R10)); // r9 = M
  emit(regRegOp(0x89, Reg.RCX, Reg.R10)); // rcx = M (scratch copy)
  emit(immOp8(4, Reg.RCX, 1)); // rcx &= 1
  emit(regRegOp(0x01, Reg.R9, Reg.RCX)); // r9 += rcx -> paddedM
  emit(shlImm8(Reg.R9, 3)); // r9 *= 8
  emit(regRegOp(0x29, Reg.RSP, Reg.R9)); // rsp -= paddedM*8

  // for (i = 0; i < M; i++) stack[i] = args[4 + i];
  emit(regRegOp(0x31, Reg.RDX, Reg.RDX)); // rdx = i = 0
  const loopBody: number[] = [
    ...movRegFromSibDisp8(Reg.R8, Reg.R11, Reg.RDX, 8, CALL_REGISTER_SLOTS * 8),
    ...movSibDisp0FromReg(Reg.R8, Reg.RSP, Reg.RDX, 8),
    ...incReg(Reg.RDX),
  ];
  const cmpBytes = regRegOp(0x39, Reg.RDX, Reg.R10); // cmp i, M
  const jmpBackLen = 2; // jmpShort is always opcode+rel8
  const jgeBytes = jccShort(JCC.JGE, loopBody.length + jmpBackLen);
  emit(cmpBytes);
  emit(jgeBytes);
  emit(loopBody);
  emit(
    jmpShort(
      -(cmpBytes.length + jgeBytes.length + loopBody.length + jmpBackLen),
    ),
  );

  emit(immOp8(5, Reg.RSP, 0x20)); // shadow space

  for (let slot = 0; slot < CALL_REGISTER_SLOTS; slot++) {
    const disp8 = slot * 8;
    const useXmm = (mask & (1 << slot)) !== 0;
    emit(
      useXmm
        ? movqXmmFromMemDisp8(slot, Reg.R11, disp8)
        : movRegFromMemDisp8(GPR_FOR_SLOT[slot]!, Reg.R11, disp8),
    );
  }

  emit(callReg(Reg.RAX));

  emit(regRegOp(0x89, Reg.RSP, Reg.RBX)); // undo everything since push rbx
  emit(popReg(Reg.RBX));
  bytes.push(0xc3); // ret

  return bytes;
}

const CALL_ARGS_SIG: CTypeOrString[] = ['ptr', 'u64', 'ptr'];

/**
 * All 16 mask variants x 2 return categories (int/ptr read from RAX, or
 * float/double read from XMM0) = 32 built once up front, not lazily on first
 * request: each is cheap (~100 bytes of pure array construction), and
 * defining the whole set as fixed globals means every caller asking for the
 * same (mask, category) always gets back the exact same `CMachineCode`
 * object -- no cache-miss branch to reason about, identity is just true by
 * construction. Both categories share the same 16 underlying byte arrays
 * (built once, reused for the float wrapper) -- only the wrapper's declared
 * `returns` tag differs, since that's all a caller (or `nthread`'s return
 * marshalling) needs to read the result from the right register correctly.
 */
const CALL_VARIANTS_INT: readonly CMachineCode[] = Array.from(
  { length: CALL_VARIANT_COUNT },
  (_unused, mask) =>
    createPendingMachineCode(['u64', CALL_ARGS_SIG], buildCallBytes(mask)),
);
const CALL_VARIANTS_FLOAT: readonly CMachineCode[] = Array.from(
  { length: CALL_VARIANT_COUNT },
  (_unused, mask) =>
    createPendingMachineCode(
      ['f64', CALL_ARGS_SIG],
      CALL_VARIANTS_INT[mask]!.bytes,
    ),
);

/**
 * The not-yet-injected `CMachineCode` for one of the 32 (mask, category)
 * variants (signature `(ptr, u64, ptr) => u64` for `'int'`, `=> f64` for
 * `'float'`) -- always the same object for the same arguments. Inject it once
 * per accessor via `accessor.machineCode(...)`, then build a
 * `createCFunction(address, sig)` from `bun-xffi` around the returned address
 * for repeat calls -- re-injecting on every call would leak remote memory,
 * same as any other `CMachineCode` in this codebase. Need the result read
 * back as something more specific than `u64`/`f64` (e.g. `f32`, `i64`,
 * `ptr`)? Just build `createCFunction(address, [returns, ['ptr','u64','ptr']])`
 * -- no new bytes needed, the ABI already put the value in the right
 * register.
 */
export function callMachineCode(
  mask: number,
  category: 'int' | 'float' = 'int',
): CMachineCode {
  assertValidCallMask(mask);
  return (category === 'float' ? CALL_VARIANTS_FLOAT : CALL_VARIANTS_INT)[
    mask
  ]!;
}
