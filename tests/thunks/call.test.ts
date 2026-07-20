import { describe, expect, test } from 'bun:test';
import {
  CType,
  cmachinecode,
  createCFunction,
  createPendingMachineCode,
  MemoryProtection,
  type CFunction,
  type CTypeOrString,
} from 'bun-xffi';
import { createAccessor } from 'exoproc-accessors';
import { getGlobalDummyProcess } from 'exoproc-dummy';
import {
  callMachineCode,
  callMachineCodeFor,
  packArgs,
  Reg,
  movRegFromXmm,
  movXmmFromReg,
  movRegFromSibDisp8,
  movMemDisp8FromReg,
  regRegOp,
  CALL_REGISTER_SLOTS,
  CALL_VARIANT_COUNT,
} from 'bun-thunks';

type IndirectAccessor = Awaited<ReturnType<typeof createAccessor>>;

const GPR_FOR_SLOT: readonly Reg[] = [Reg.RCX, Reg.RDX, Reg.R8, Reg.R9];

// A hand-assembled (not TCC-compiled) "callee" that XORs together the raw
// 8-byte bit pattern of every argument it received -- the first 4 read from
// whichever register `mask` says the caller should have used (GPR or XMM),
// the rest read directly off the stack -- and WRITES the checksum to an
// output pointer passed as the argument right after the last test value,
// rather than returning it.
//
// This deliberately avoids returning the checksum through accessor.call()'s
// normal return-value path: that path round-trips large 64-bit values
// through a lossy JS `number` somewhere upstream of this package (confirmed
// independently -- a probe hardcoded to `mov rax, 0x3ff800000000000b; ret`
// comes back as 0x3ff8000000000000, and 0xffffffffffffffff comes back as
// -1), a pre-existing limitation unrelated to this call machine code.
// Writing the result to memory and reading it back with accessor.read() is a
// plain byte copy, unaffected by that.
function buildChecksumProbeBytes(
  mask: number,
  stackTestArgCount: number,
): number[] {
  const bytes: number[] = [];
  const emit = (chunk: readonly number[]): void => {
    bytes.push(...chunk);
  };

  emit(regRegOp(0x31, Reg.RAX, Reg.RAX)); // rax = 0

  for (let slot = 0; slot < CALL_REGISTER_SLOTS; slot++) {
    if (mask & (1 << slot)) {
      emit(movRegFromXmm(Reg.R10, slot)); // r10 = raw bits of xmm_slot
      emit(regRegOp(0x31, Reg.RAX, Reg.R10));
    } else {
      emit(regRegOp(0x31, Reg.RAX, GPR_FOR_SLOT[slot]!));
    }
  }

  for (let j = 0; j < stackTestArgCount; j++) {
    // mov r10, [rsp + 0x28 + j*8] -- RSP as its own "index" is the standard
    // SIB encoding for "no index, base=RSP" (index field 100 is reserved to
    // mean "none", which is coincidentally RSP's own register number).
    emit(movRegFromSibDisp8(Reg.R10, Reg.RSP, Reg.RSP, 1, 0x28 + j * 8));
    emit(regRegOp(0x31, Reg.RAX, Reg.R10));
  }

  // outputPtr is the argument right after the last test value -- always a
  // stack arg here, at logical position (4 + stackTestArgCount).
  emit(
    movRegFromSibDisp8(
      Reg.R11,
      Reg.RSP,
      Reg.RSP,
      1,
      0x28 + stackTestArgCount * 8,
    ),
  );
  emit(movMemDisp8FromReg(Reg.R11, 0, Reg.RAX)); // [outputPtr] = checksum

  bytes.push(0xc3); // ret
  return bytes;
}

// Raw 8-byte patterns (as bigints), including real IEEE-754 bit patterns for
// 1.5/2.5 -- proves arbitrary bytes (not just clean small integers) survive
// the round trip intact, whichever register class carries them.
function rawBitsOf(value: number | bigint, isFloat: boolean): bigint {
  if (!isFloat) return BigInt.asUintN(64, BigInt(value));
  const buf = Buffer.alloc(8);
  buf.writeDoubleLE(Number(value), 0);
  return buf.readBigUInt64LE(0);
}

// Injects the checksum probe and the call machine code for `mask`, packs
// `values` plus a trailing output-buffer pointer into the args buffer,
// invokes the probe through it, and reads the checksum back from that
// output buffer.
async function callProbeThroughCallBytes(
  accessor: IndirectAccessor,
  mask: number,
  values: readonly (number | bigint)[],
  argTypes: readonly CTypeOrString[],
  stackTestArgCount: number,
): Promise<bigint> {
  const probe = createPendingMachineCode(
    ['u64', []],
    buildChecksumProbeBytes(mask, stackTestArgCount),
  );
  const probeAddr = await accessor.machineCode(probe);

  const caller = callMachineCode(mask);
  const callerAddr = await accessor.machineCode(caller);
  const callerFn: CFunction = createCFunction(callerAddr, [
    'u64',
    ['ptr', 'u64', 'ptr'],
  ]);

  const outputAddr = Number(
    await accessor.alloc(8, null, MemoryProtection.READWRITE),
  );
  const allValues = [...values, outputAddr];
  const allTypes = [...argTypes, 'ptr' as CTypeOrString];
  const argsBuf = packArgs(allValues, allTypes);
  const argsAddr = await accessor.alloc(
    argsBuf.length,
    null,
    MemoryProtection.READWRITE,
  );
  await accessor.write(argsAddr, argsBuf);

  await accessor.call(callerFn, probeAddr, BigInt(allValues.length), argsAddr);
  const resultBuf = await accessor.read(outputAddr, 8);
  return resultBuf.readBigUInt64LE(0);
}

describe('thunks > call (cross-process, thread-hijack backend)', () => {
  const proc = getGlobalDummyProcess();

  test('dispatches every register/XMM variant and the >4 stack-arg path correctly', async () => {
    const accessor = await createAccessor(proc.pid, {
      hostOptions: { timeoutMs: 20000 },
    });

    try {
      // A) All 16 register-slot variants: fixed values/types (2 ints, 2 real
      // double bit patterns), same packed bytes every iteration -- only the
      // *variant* (which register, GPR or XMM, carries each slot) changes
      // across masks. Since packArgs' output doesn't depend on mask at all,
      // the expected checksum is one constant: a wrong register/XMM
      // assignment for any mask would show up as a mismatch against it.
      const rawValues = [11n, 1.5, 222n, 2.5] as const;
      const argTypes: CTypeOrString[] = [
        CType.i64,
        CType.f64,
        CType.i64,
        CType.f64,
      ];
      const isFloatBySlot = [false, true, false, true];
      const expected = rawValues.reduce<bigint>(
        (acc, v, i) => acc ^ rawBitsOf(v, isFloatBySlot[i]!),
        0n,
      );
      for (let mask = 0; mask < CALL_VARIANT_COUNT; mask++) {
        const result = await callProbeThroughCallBytes(
          accessor,
          mask,
          rawValues as unknown as (number | bigint)[],
          argTypes,
          0,
        );
        expect(result).toBe(expected);
      }

      // B) 6 all-integer args through a real TCC-compiled function -- exercises
      // the >4 stack-arg copy loop end-to-end with actual arithmetic.
      // 1 + 2*2 + 3*3 + 4*4 + 5*5 + 6*6 = 1+4+9+16+25+36 = 91
      const allInt6 = cmachinecode({
        returns: CType.i64,
        args: [
          CType.i64,
          CType.i64,
          CType.i64,
          CType.i64,
          CType.i64,
          CType.i64,
        ],
        source: `return arg0 + arg1 * 2 + arg2 * 3 + arg3 * 4 + arg4 * 5 + arg5 * 6;`,
      });
      const allInt6Addr = await accessor.machineCode(allInt6);
      // callMachineCodeFor derives both the mask (from allInt6.args -- all
      // int, so mask 0) and the return-tagged signature (allInt6.returns)
      // directly from the target, instead of the caller working those out.
      const caller0 = callMachineCodeFor(allInt6);
      const caller0Addr = await accessor.machineCode(caller0);
      const caller0Fn: CFunction = createCFunction(caller0Addr, [
        'i64',
        ['ptr', 'u64', 'ptr'],
      ]);
      const allInt6Values = [1n, 2n, 3n, 4n, 5n, 6n];
      const argsBuf = packArgs(allInt6Values, allInt6.args);
      const argsAddr = await accessor.alloc(
        argsBuf.length,
        null,
        MemoryProtection.READWRITE,
      );
      await accessor.write(argsAddr, argsBuf);
      const resultB = await accessor.call(
        caller0Fn,
        allInt6Addr,
        BigInt(allInt6Values.length),
        argsAddr,
      );
      expect(resultB).toBe(91n);

      // C) Stack-arg path (positions 4 and 5) with real double bit patterns,
      // via the checksum probe -- proves packArgs' float packing plus the
      // raw 8-byte stack copy survive floats intact beyond the first 4 slots
      // (independent of TCC's double-parameter limitation).
      const stackValues = [1n, 2n, 3n, 4n, 1.5, 2.5];
      const stackTypes: CTypeOrString[] = [
        CType.i64,
        CType.i64,
        CType.i64,
        CType.i64,
        CType.f64,
        CType.f64,
      ];
      const expectedC = stackValues.reduce<bigint>(
        (acc, v, i) => acc ^ rawBitsOf(v, i >= 4),
        0n,
      );
      const resultC = await callProbeThroughCallBytes(
        accessor,
        0,
        stackValues,
        stackTypes,
        2,
      );
      expect(resultC).toBe(expectedC);

      // D) The 'float' category, exercised for real via a hand-assembled
      // probe rather than a TCC-compiled target -- TCC turns out to also
      // mishandle "int parameter + double return" (confirmed independently
      // by calling such a function directly, bypassing the call machine
      // code entirely: still wrong), so it can't be trusted here any more
      // than for double *parameters* (see the CLAUDE.md gotcha). The probe
      // just echoes its raw RCX bits into XMM0 ("movq xmm0, rcx; ret"); we
      // pack the exact IEEE-754 bit pattern of 10.5 as a plain u64 (mask 0,
      // delivered via RCX, not XMM), so a correct round trip proves both
      // that the call machine code leaves XMM0 untouched after its own
      // cleanup and that the 'float' category's signature makes the caller
      // read it back as a double correctly.
      const echoAsDoubleBytes = [...movXmmFromReg(0, Reg.RCX), 0xc3];
      const echoAsDouble = createPendingMachineCode(
        ['u64', []],
        echoAsDoubleBytes,
      );
      const echoAsDoubleAddr = await accessor.machineCode(echoAsDouble);

      const mask0Float = callMachineCode(0, 'float');
      // A target that merely *declares* returns='f64' (never actually
      // invoked) should still resolve to that exact same global object --
      // proving the identity-reuse path, not just the "returns differs,
      // build a thin one-off" path B already exercises.
      const declaredFloatTarget = {
        args: [CType.u64] as CTypeOrString[],
        returns: CType.f64,
      };
      expect(callMachineCodeFor(declaredFloatTarget)).toBe(mask0Float);

      const mask0FloatAddr = await accessor.machineCode(mask0Float);
      const echoFn: CFunction = createCFunction(mask0FloatAddr, [
        'f64',
        ['ptr', 'u64', 'ptr'],
      ]);
      const doubleBits = rawBitsOf(10.5, true);
      const doubleArgsBuf = packArgs([doubleBits], [CType.u64]);
      const doubleArgsAddr = await accessor.alloc(
        doubleArgsBuf.length,
        null,
        MemoryProtection.READWRITE,
      );
      await accessor.write(doubleArgsAddr, doubleArgsBuf);
      const resultD = await accessor.call(
        echoFn,
        echoAsDoubleAddr,
        1n,
        doubleArgsAddr,
      );
      expect(resultD).toBe(10.5);

      // E) Identity stability: repeated requests for the same (mask,
      // category) always return the exact same object -- defined once as
      // fixed globals up front, not lazily cached on first use. The int and
      // float categories for the same mask also share their underlying byte
      // array (only the wrapper's `returns` tag differs).
      expect(callMachineCode(5)).toBe(callMachineCode(5));
      expect(callMachineCode(5, 'float')).toBe(callMachineCode(5, 'float'));
      expect(callMachineCode(5)).not.toBe(callMachineCode(5, 'float'));
      expect(callMachineCode(5, 'float').bytes).toBe(
        callMachineCode(5, 'int').bytes,
      );
    } finally {
      await accessor.deinit();
    }
  }, 120000);
});
