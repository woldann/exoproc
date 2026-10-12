/**
 * Win64 arbitrary-function call thunk builders. `call.ts` provides the
 * installation and payload API on top of the machine code emitted here.
 */

import { X64Assembler, qword, type X64Register64 } from 'exoproc-asm';
import type { CMachineCode, CTypeOrString } from 'bun-xffi';
import {
  assertValidMask,
  CALL_REGISTER_SLOTS,
  gprForSlot,
  maskFromArgTypes,
  xmmForSlot,
  type Operand,
} from './abi.js';
import { registerMachineCode } from './registry.js';
import type { ThunkSignature } from './types.js';

/**
 * How the thunk hands off to the resolved function pointer after staging its
 * arguments.
 *
 * - `'call'` (default) supports arbitrary stack arguments and unwinds the
 *   thunk's frame after the target returns.
 * - `'jump'` restores the incoming RSP/RBX and performs a true tail jump. It is
 *   only sound with at most four arguments because the temporary frame holding
 *   overflow arguments must be discarded before the jump.
 */
export type CallInvokeStyle = 'call' | 'jump';

/**
 * Emits the shared argument setup. RAX holds the function pointer, R10 the
 * argument count, R11 the flat eight-byte-slot argument buffer, and RBX the
 * thunk frame anchor.
 */
function emitCallSetup(assembler: X64Assembler, mask: number): void {
  assertValidMask(mask);

  // r10 = M = max(argCount - 4, 0). JAE observes SUB's unsigned no-borrow
  // result, which matches argCount's u64 interpretation.
  const overflowCountReady = assembler.createLabel('overflow-count-ready');
  assembler.sub('r10', CALL_REGISTER_SLOTS);
  assembler.jae(overflowCountReady);
  assembler.xor('r10', 'r10');
  assembler.bind(overflowCountReady);

  // Round M up to an even count so the call site remains 16-byte aligned,
  // then reserve the overflow-argument area.
  assembler.mov('r9', 'r10');
  assembler.mov('rcx', 'r10');
  assembler.and('rcx', 1);
  assembler.add('r9', 'rcx');
  assembler.shl('r9', 3);
  assembler.sub('rsp', 'r9');

  // for (i = 0; i < M; i++) stack[i] = args[4 + i]
  const copyOverflow = assembler.createLabel('copy-overflow');
  const overflowCopied = assembler.createLabel('overflow-copied');
  assembler.xor('rdx', 'rdx');
  assembler.bind(copyOverflow);
  assembler.cmp('rdx', 'r10');
  assembler.jae(overflowCopied);
  assembler.mov(
    'r8',
    qword({
      base: 'r11',
      index: 'rdx',
      scale: 8,
      displacement: CALL_REGISTER_SLOTS * 8,
    }),
  );
  assembler.mov(qword({ base: 'rsp', index: 'rdx', scale: 8 }), 'r8');
  assembler.inc('rdx');
  assembler.jmp(copyOverflow);
  assembler.bind(overflowCopied);

  assembler.sub('rsp', 0x20); // Win64 shadow space

  // Slots 0-3 are always present in the padded payload. The signature mask
  // selects the register class without altering the raw argument bits.
  for (let slot = 0; slot < CALL_REGISTER_SLOTS; slot++) {
    const source = qword('r11', slot * 8);
    if (mask & (1 << slot)) {
      assembler.movq(xmmForSlot(slot), source);
    } else {
      assembler.mov(gprForSlot(slot), source);
    }
  }
}

function emitCallInvoke(
  assembler: X64Assembler,
  invokeStyle: CallInvokeStyle,
): void {
  if (invokeStyle === 'call') {
    assembler.callRegister('rax');
    assembler.mov('rsp', 'rbx');
    assembler.pop('rbx');
    assembler.ret();
    return;
  }

  assembler.mov('rsp', 'rbx');
  assembler.pop('rbx');
  assembler.jmpRegister('rax');
}

function movRegisterIfNeeded(
  assembler: X64Assembler,
  destination: X64Register64,
  source: X64Register64,
): void {
  if (destination !== source) assembler.mov(destination, source);
}

/**
 * Rejects layouts where an earlier staging operation destroys a later source.
 * RSP and RBX are consumed by the frame prologue before any operand is staged;
 * RAX, R10, and R11 become unavailable in that order when populated.
 */
function assertSafeOperandStaging(
  functionPointer: Operand,
  argCount: Operand,
  argsRegister: X64Register64,
): void {
  const overwritten = new Set<X64Register64>(['rsp', 'rbx']);
  const stage = (
    name: string,
    source: Operand,
    destination: X64Register64,
  ): void => {
    if (typeof source !== 'bigint' && overwritten.has(source)) {
      throw new RangeError(
        `${name} source register is overwritten by the call-thunk prologue before it can be read; use a safe register layout or pre-stage through another stub`,
      );
    }
    if (typeof source === 'bigint' || source !== destination) {
      overwritten.add(destination);
    }
  };

  stage('functionPointer', functionPointer, 'rax');
  stage('argCount', argCount, 'r10');
  stage('argsRegister', argsRegister, 'r11');
}

/**
 * Builds a Win64 call dispatcher. Fixed bigint operands are embedded directly;
 * register operands are read from the exact named register. Advanced callers
 * can therefore compose custom layouts without implicit register assignment.
 */
export function buildCallBytes(
  functionPointer: Operand,
  argCount: Operand,
  argsRegister: X64Register64,
  mask: number,
  invokeStyle: CallInvokeStyle = 'call',
): Uint8Array {
  if (typeof argCount === 'bigint' && argCount < 0n) {
    throw new RangeError(`argCount must be non-negative, got ${argCount}`);
  }
  assertSafeOperandStaging(functionPointer, argCount, argsRegister);
  if (
    invokeStyle === 'jump' &&
    typeof argCount === 'bigint' &&
    argCount > BigInt(CALL_REGISTER_SLOTS)
  ) {
    throw new RangeError(
      `invokeStyle 'jump' only supports argCount<=${CALL_REGISTER_SLOTS} (no stack arguments) -- got a fixed argCount of ${argCount}. See CallInvokeStyle's doc comment for why.`,
    );
  }

  const assembler = new X64Assembler();

  // RBX anchors the pushed-RBX location, allowing both modes to restore the
  // caller without tracking the dynamic overflow allocation.
  assembler.push('rbx');
  assembler.mov('rbx', 'rsp');

  if (typeof functionPointer === 'bigint') {
    assembler.mov('rax', functionPointer);
  } else {
    movRegisterIfNeeded(assembler, 'rax', functionPointer);
  }
  if (typeof argCount === 'bigint') {
    assembler.mov('r10', argCount);
  } else {
    movRegisterIfNeeded(assembler, 'r10', argCount);
  }
  movRegisterIfNeeded(assembler, 'r11', argsRegister);

  emitCallSetup(assembler, mask);
  emitCallInvoke(assembler, invokeStyle);
  return assembler.finish();
}

function callArgsSignature(
  functionPointer: Operand,
  argCount: Operand,
): CTypeOrString[] {
  const signature: CTypeOrString[] = [];
  if (typeof functionPointer !== 'bigint') signature.push('ptr');
  if (typeof argCount !== 'bigint') signature.push('u64');
  signature.push('ptr');
  return signature;
}

export interface BuildCallThunkOptions {
  readonly signature: ThunkSignature;
  /** Runtime source register or fixed function address. Defaults to `'rcx'`. */
  readonly functionPointer?: Operand;
  /** Runtime source register or fixed count. Defaults to `'rdx'`. */
  readonly argCount?: Operand;
  /** Register containing the flat argument buffer. Defaults to `'r8'`. */
  readonly argsRegister?: X64Register64;
  /** `'jump'` is rejected when the known signature has stack arguments. */
  readonly invokeStyle?: CallInvokeStyle;
}

/** Builds call-dispatch bytes from a target ABI shape and binding options. */
export function buildCallThunkBytes({
  signature,
  functionPointer = 'rcx',
  argCount = 'rdx',
  argsRegister = 'r8',
  invokeStyle = 'call',
}: BuildCallThunkOptions): Uint8Array {
  if (invokeStyle === 'jump' && signature.args.length > CALL_REGISTER_SLOTS) {
    throw new RangeError(
      `invokeStyle 'jump' only supports signatures with at most ${CALL_REGISTER_SLOTS} arguments; got ${signature.args.length}`,
    );
  }
  return buildCallBytes(
    functionPointer,
    argCount,
    argsRegister,
    maskFromArgTypes(signature.args),
    invokeStyle,
  );
}

/** Creates typed pending machine code for one call-dispatch configuration. */
export function createCallThunk(options: BuildCallThunkOptions): CMachineCode {
  const functionPointer = options.functionPointer ?? 'rcx';
  const argCount = options.argCount ?? 'rdx';

  let runtimeSlot = 0;
  if (typeof functionPointer !== 'bigint') {
    const expected = gprForSlot(runtimeSlot++);
    if (functionPointer !== expected) {
      throw new RangeError(
        'createCallThunk requires callable ABI register placement; use buildCallBytes for custom register composition',
      );
    }
  }
  if (typeof argCount !== 'bigint') {
    const expected = gprForSlot(runtimeSlot++);
    if (argCount !== expected) {
      throw new RangeError(
        'createCallThunk requires callable ABI register placement; use buildCallBytes for custom register composition',
      );
    }
  } else if (argCount !== BigInt(options.signature.args.length)) {
    throw new RangeError(
      `fixed argCount ${argCount} does not match signature length ${options.signature.args.length}`,
    );
  }

  const argsRegister = options.argsRegister ?? 'r8';
  if (argsRegister !== gprForSlot(runtimeSlot)) {
    throw new RangeError(
      'createCallThunk requires callable ABI register placement; use buildCallBytes for custom register composition',
    );
  }

  return registerMachineCode(buildCallThunkBytes(options), [
    options.signature.returns,
    callArgsSignature(functionPointer, argCount),
  ]);
}
