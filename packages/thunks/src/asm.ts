/**
 * Minimal hand-rolled x64 instruction encoders -- just the handful of forms
 * needed to hand-assemble the machine code in this package. Not a general
 * assembler: every helper below covers exactly one addressing-mode/opcode
 * shape, verified by hand against the Intel SDM.
 *
 * Also holds the "first 4 argument slots map to registers or XMM per a
 * 4-bit mask" convention (`REGISTER_SLOTS`/`VARIANT_COUNT`/`GPR_FOR_SLOT`/
 * `assertValidMask`) shared by every machine code built from this file --
 * it's the same Win64 ABI mapping regardless of which one uses it.
 */

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

/** `jmp r/m64` (FF /4), near indirect -- a true tail-jump: doesn't push a return address. */
export function jmpReg(reg: Reg): number[] {
  const modrm = 0xc0 | (4 << 3) | (reg & 7);
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

/**
 * `movq [base + disp8], xmm` (66 REX.W 0F 7E /r, disp8 memory) -- stores the
 * low 64 bits of `xmm` to memory. Same opcode as {@link movRegFromXmm}
 * (0F 7E is "MOVQ r/m64, xmm" for either a register or memory r/m); only the
 * ModRM mod field differs (disp8 memory here vs register-direct there).
 */
export function movMemDisp8FromXmm(
  base: Reg,
  disp8: number,
  xmm: number,
): number[] {
  return [
    0x66,
    rex(true, xmm >= 8, false, base >= 8),
    0x0f,
    0x7e,
    0x40 | ((xmm & 7) << 3) | (base & 7),
    disp8 & 0xff,
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

/** `mov [base + index*scale + disp8], r64` -- the disp8 sibling of {@link movSibDisp0FromReg}. */
export function movSibDisp8FromReg(
  src: Reg,
  base: Reg,
  index: Reg,
  scale: 1 | 2 | 4 | 8,
  disp8: number,
): number[] {
  return [
    rex(true, src >= 8, index >= 8, base >= 8),
    0x89,
    0x40 | ((src & 7) << 3) | 0x04,
    (SIB_SCALE[scale] << 6) | ((index & 7) << 3) | (base & 7),
    disp8 & 0xff,
  ];
}

/** `mov r64, imm64` (REX.W B8+rd io) -- loads a full 64-bit immediate into a GPR. */
export function movRegImm64(dst: Reg, imm64: bigint): number[] {
  const bytes = [rex(true, false, false, dst >= 8), 0xb8 | (dst & 7)];
  let value = BigInt.asUintN(64, imm64);
  for (let i = 0; i < 8; i++) {
    bytes.push(Number(value & 0xffn));
    value >>= 8n;
  }
  return bytes;
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

export const GPR_FOR_SLOT: readonly Reg[] = [Reg.RCX, Reg.RDX, Reg.R8, Reg.R9];

export function assertValidMask(mask: number): void {
  if (!Number.isInteger(mask) || mask < 0 || mask >= CALL_VARIANT_COUNT) {
    throw new RangeError(
      `Variant mask must be an integer in [0, ${CALL_VARIANT_COUNT - 1}], got ${mask}`,
    );
  }
}
