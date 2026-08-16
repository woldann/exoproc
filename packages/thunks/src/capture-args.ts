/** Win64 argument collector and fixed-destination capture-adapter builders. */

import { X64Assembler, qword } from 'exoproc-asm';
import { type CMachineCode, type CTypeOrString } from 'bun-xffi';
import {
  assertValidMask,
  CALL_REGISTER_SLOTS,
  gprForSlot,
  maskFromArgTypes,
  xmmForSlot,
} from './abi.js';
import { registerMachineCode } from './registry.js';

/**
 * Builds an ordinary Win64 `(...args, destination) => destination` collector.
 * Every argument is copied as its exact raw register/stack qword; the known
 * mask only selects GPR versus XMM storage for the first four slots.
 */
export function buildCaptureArgsBytes(
  argCount: number,
  mask: number,
): Uint8Array {
  assertValidMask(mask);
  if (!Number.isInteger(argCount) || argCount < 0) {
    throw new RangeError(
      `argCount must be a non-negative integer, got ${argCount}`,
    );
  }

  const assembler = new X64Assembler();

  // destination is trailing argument #argCount. Keep it in RAX as both the
  // store base and return value.
  if (argCount < CALL_REGISTER_SLOTS) {
    assembler.mov('rax', gprForSlot(argCount));
  } else {
    const displacement = 0x28 + (argCount - CALL_REGISTER_SLOTS) * 8;
    assembler.mov('rax', qword('rsp', displacement));
  }

  const registerSlots = Math.min(CALL_REGISTER_SLOTS, argCount);
  for (let slot = 0; slot < registerSlots; slot++) {
    const destination = qword('rax', slot * 8);
    if (mask & (1 << slot)) {
      assembler.movq(destination, xmmForSlot(slot));
    } else {
      assembler.mov(destination, gprForSlot(slot));
    }
  }

  // At entry, overflow arguments begin after the return address and 0x20-byte
  // shadow space. The assembler chooses disp8 or disp32 for each offset.
  for (let slot = CALL_REGISTER_SLOTS; slot < argCount; slot++) {
    const stackDisplacement = 0x28 + (slot - CALL_REGISTER_SLOTS) * 8;
    assembler.mov('r10', qword('rsp', stackDisplacement));
    assembler.mov(qword('rax', slot * 8), 'r10');
  }

  assembler.ret();
  return assembler.finish();
}

/** Builds collector bytes from the exact incoming argument signature. */
export function buildCaptureArgsThunkBytes(
  args: readonly CTypeOrString[],
): Uint8Array {
  return buildCaptureArgsBytes(args.length, maskFromArgTypes(args));
}

/** Creates a reusable collector with signature `(...args, destination) => ptr`. */
export function createCaptureArgsThunk(
  args: readonly CTypeOrString[],
): CMachineCode {
  return registerMachineCode(buildCaptureArgsThunkBytes(args), [
    'ptr',
    [...args, 'ptr'],
  ]);
}

/**
 * Builds a fixed-destination adapter around an installed collector.
 *
 * For fewer than four captured arguments, the destination occupies an unused
 * argument register and the adapter can tail-jump without touching the stack.
 * For four or more, the adapter preserves RBX, anchors the incoming frame,
 * creates aligned shadow/overflow space, copies every overflow argument plus
 * the destination, calls the collector, restores RSP/RBX, and returns.
 */
export function buildFixedCaptureArgsBytes(
  targetAddress: bigint,
  innerAddress: bigint,
  argCount: number,
  mask: number,
): Uint8Array {
  assertValidMask(mask);
  if (!Number.isInteger(argCount) || argCount < 0) {
    throw new RangeError(
      `argCount must be a non-negative integer, got ${argCount}`,
    );
  }

  const assembler = new X64Assembler();
  const targetSlot = argCount;

  if (targetSlot < CALL_REGISTER_SLOTS) {
    assembler.mov(gprForSlot(targetSlot), targetAddress);
    assembler.mov('rax', innerAddress);
    assembler.jmpRegister('rax');
    return assembler.finish();
  }

  // If entry RSP is S, RBX becomes S-8. The first incoming overflow argument
  // at [S+0x28] is therefore [RBX+0x30].
  assembler.push('rbx');
  assembler.mov('rbx', 'rsp');

  // Include destination as the collector's final stack argument and round the
  // stack-argument area to an even qword count. Push RBX aligned RSP to 16;
  // this allocation keeps it aligned immediately before CALL.
  const innerStackArgCount = targetSlot - CALL_REGISTER_SLOTS + 1;
  const paddedCount = innerStackArgCount + (innerStackArgCount & 1);
  const allocationSize = 0x20 + paddedCount * 8;
  assembler.sub('rsp', allocationSize);

  for (let index = 0; index < innerStackArgCount; index++) {
    if (index === innerStackArgCount - 1) {
      assembler.mov('r10', targetAddress);
    } else {
      assembler.mov('r10', qword('rbx', 0x30 + index * 8));
    }
    // Before CALL, stack arguments start at [rsp+0x20]. The pushed return
    // address makes this [collectorRsp+0x28] at collector entry.
    assembler.mov(qword('rsp', 0x20 + index * 8), 'r10');
  }

  assembler.mov('rax', innerAddress);
  assembler.callRegister('rax');
  assembler.mov('rsp', 'rbx');
  assembler.pop('rbx');
  assembler.ret();
  return assembler.finish();
}

export interface BuildCaptureAdapterThunkOptions {
  readonly args: readonly CTypeOrString[];
  readonly destination: bigint;
  readonly collectorAddress: bigint;
}

/** Builds the fixed-destination adapter used as a capture-hook landing point. */
export function buildCaptureAdapterThunkBytes({
  args,
  destination,
  collectorAddress,
}: BuildCaptureAdapterThunkOptions): Uint8Array {
  return buildFixedCaptureArgsBytes(
    destination,
    collectorAddress,
    args.length,
    maskFromArgTypes(args),
  );
}

/** Creates a fixed-destination capture adapter with signature `(...args) => ptr`. */
export function createCaptureAdapterThunk(
  options: BuildCaptureAdapterThunkOptions,
): CMachineCode {
  return registerMachineCode(buildCaptureAdapterThunkBytes(options), [
    'ptr',
    [...options.args],
  ]);
}
