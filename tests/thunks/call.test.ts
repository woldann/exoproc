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
  fixedCallMachineCodeFor,
  chainedCallMachineCode,
  packChainedArgs,
  captureArgsMachineCodeFor,
  chainedCaptureArgsMachineCode,
  maskFromArgTypes,
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

// Same probe/checksum setup as callProbeThroughCallBytes, but invoked
// through chainedCallMachineCode's single-argument composed thunk instead of
// calling callMachineCode directly -- exercises that `mask` really does
// still control the *real* target's (the probe's) own register/XMM
// assignment even though it's now reached through fixedCallMachineCode ->
// callMachineCode indirection, not a hardcoded/ignored value.
async function callProbeThroughChain(
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

  const chained = await chainedCallMachineCode(accessor, mask);
  const chainedAddr = await accessor.machineCode(chained);
  const chainedFn: CFunction = createCFunction(chainedAddr, ['u64', ['ptr']]);

  const outputAddr = Number(
    await accessor.alloc(8, null, MemoryProtection.READWRITE),
  );
  const allValues = [...values, outputAddr];
  const allTypes = [...argTypes, 'ptr' as CTypeOrString];
  const combinedAddr = await packChainedArgs(
    accessor,
    BigInt(probeAddr),
    allValues,
    allTypes,
  );

  await accessor.call(chainedFn, combinedAddr);
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

      // B2) Same target as B, but through fixedCallMachineCodeFor -- ptr and
      // argCount get baked into the bytes as immediates instead of being
      // read from RCX/RDX at entry, so the thunk takes only the args buffer
      // (one argument) rather than all three. Reuses B's already-packed
      // argsAddr, since the args buffer layout is identical either way.
      //
      // Must target allInt6Addr (the *remote*, post-injection address), not
      // allInt6.ptr (cmachinecode()'s *local* JIT address in this process) --
      // baking in the wrong one means the generated "call <local_addr>"
      // executes inside the remote process, jumping to whatever garbage
      // happens to live at that address there.
      const allInt6Remote: CFunction = createCFunction(allInt6Addr, [
        allInt6.returns,
        [...allInt6.args],
      ]);
      const fixedCaller = fixedCallMachineCodeFor(allInt6Remote);
      expect(fixedCallMachineCodeFor(allInt6Remote)).toBe(fixedCaller); // cached by (ptr, argCount, mask, returns)
      const fixedCallerAddr = await accessor.machineCode(fixedCaller);
      const fixedCallerFn: CFunction = createCFunction(fixedCallerAddr, [
        'i64',
        ['ptr'],
      ]);
      const resultB2 = await accessor.call(fixedCallerFn, argsAddr);
      expect(resultB2).toBe(91n);

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
      // category) always return the exact same object -- built lazily on
      // first request, then cached globally, not rebuilt every call. The int
      // and float categories for the same mask also share their underlying
      // byte array (only the wrapper's `returns` tag differs).
      expect(callMachineCode(5)).toBe(callMachineCode(5));
      expect(callMachineCode(5, 'float')).toBe(callMachineCode(5, 'float'));
      expect(callMachineCode(5)).not.toBe(callMachineCode(5, 'float'));
      expect(callMachineCode(5, 'float').bytes).toBe(
        callMachineCode(5, 'int').bytes,
      );

      // F) chainedCallMachineCode: a single-argument thunk (fixedCallMachineCode
      // bound to an injected callMachineCode instance) that, given the
      // combined [ptr, argCount, selfPointer, ...args] buffer packChainedArgs
      // builds, can call any function matching (mask, category). Mixed
      // int/float mask (same shape as A) proves `mask` still controls the
      // *real* target's own register/XMM assignment through the extra
      // indirection -- not silently ignored/hardcoded somewhere in the chain.
      const chainRawValues = [7n, 3.5, 99n, 4.5] as const;
      const chainArgTypes: CTypeOrString[] = [
        CType.i64,
        CType.f64,
        CType.i64,
        CType.f64,
      ];
      const chainMask = 0b1010; // slots 1 and 3 are the f64 ones
      const chainIsFloatBySlot = [false, true, false, true];
      const chainExpected = chainRawValues.reduce<bigint>(
        (acc, v, i) => acc ^ rawBitsOf(v, chainIsFloatBySlot[i]!),
        0n,
      );
      const chainResult = await callProbeThroughChain(
        accessor,
        chainMask,
        chainRawValues as unknown as (number | bigint)[],
        chainArgTypes,
        0,
      );
      expect(chainResult).toBe(chainExpected);

      // G) Same chain, >4 args -- proves argCount (packed into the combined
      // buffer's header) correctly reaches the inner callMachineCode's own
      // stack-arg copy loop, not just the first 4 register/XMM slots.
      const chainStackValues = [1n, 2n, 3n, 4n, 1.5, 2.5];
      const chainStackTypes: CTypeOrString[] = [
        CType.i64,
        CType.i64,
        CType.i64,
        CType.i64,
        CType.f64,
        CType.f64,
      ];
      const chainExpectedStack = chainStackValues.reduce<bigint>(
        (acc, v, i) => acc ^ rawBitsOf(v, i >= 4),
        0n,
      );
      const chainResultStack = await callProbeThroughChain(
        accessor,
        0,
        chainStackValues,
        chainStackTypes,
        2,
      );
      expect(chainResultStack).toBe(chainExpectedStack);

      // H) Identity/caching: chainedCallMachineCode(accessor, mask, category)
      // returns the same object for the same (accessor, mask, category) --
      // meaning it does NOT re-inject the inner callMachineCode into the
      // process on every call.
      const chained0 = await chainedCallMachineCode(accessor, 0);
      const chained0Again = await chainedCallMachineCode(accessor, 0);
      expect(chained0Again).toBe(chained0);
      const chained0Float = await chainedCallMachineCode(accessor, 0, 'float');
      expect(chained0Float).not.toBe(chained0);

      // I) A 5-argument call through the chain -- 4 register/XMM slots (mixed
      // int/float, same mask as F) plus 1 real stack argument, so this single
      // call exercises the register dispatch and the stack-arg copy loop
      // together. packChainedArgs' combined buffer here is 8 slots, not 7:
      // targetPointer + targetArgCount + selfPointer (3 header slots -- see
      // the CLAUDE.md writeup for why the self-pointer slot can't be folded
      // away) + the 5 real arguments.
      const fiveArgValues = [10n, 1.5, 20n, 2.5, 30n];
      const fiveArgTypes: CTypeOrString[] = [
        CType.i64,
        CType.f64,
        CType.i64,
        CType.f64,
        CType.i64,
      ];
      const fiveArgMask = 0b1010; // slots 1 and 3 are the f64 ones
      const fiveArgIsFloatBySlot = [false, true, false, true, false];
      const fiveArgExpected = fiveArgValues.reduce<bigint>(
        (acc, v, i) => acc ^ rawBitsOf(v, fiveArgIsFloatBySlot[i]!),
        0n,
      );
      const fiveArgResult = await callProbeThroughChain(
        accessor,
        fiveArgMask,
        fiveArgValues,
        fiveArgTypes,
        1, // 1 stack arg: the 5th (index 4)
      );
      expect(fiveArgResult).toBe(fiveArgExpected);

      // J) captureArgsMachineCodeFor: an ordinary function (called normally,
      // with real typed args, not through any of the call-machine-code
      // plumbing above) that writes its first argCount arguments to a target
      // address -- now taken as its own trailing argument (argument #argCount)
      // rather than baked in, so this one instance is reusable across as many
      // target addresses as callers want. 6 real args: 4 register/XMM slots
      // (mixed int/float, same mask as F/I) plus 2 real stack args (one of
      // them float too), then the target address as a 7th trailing argument
      // (itself landing on the stack, since slot 6 >= 4) -- proves both the
      // register-slot capture and the stack-arg capture preserve exact bit
      // patterns, that the trailing target-address argument is read correctly
      // off the stack, and that the buffer is sized to exactly argCount*8 (no
      // over-write past it, no padding to 4 like the args-buffer convention
      // elsewhere).
      const captureTypes: CTypeOrString[] = [
        CType.i64,
        CType.f64,
        CType.i64,
        CType.f64,
        CType.i64,
        CType.f64,
      ];
      const captureValues = [10n, 1.5, 20n, 2.5, 30n, 3.5];
      const captureIsFloatBySlot = [false, true, false, true, false, true];
      const targetAddr = Number(
        await accessor.alloc(
          captureTypes.length * 8,
          null,
          MemoryProtection.READWRITE,
        ),
      );
      const capture = captureArgsMachineCodeFor(captureTypes);
      expect(captureArgsMachineCodeFor(captureTypes)).toBe(capture); // cached by (argCount, mask)
      const captureAddr = await accessor.machineCode(capture);
      const captureFn: CFunction = createCFunction(captureAddr, [
        'ptr',
        [...captureTypes, 'ptr'],
      ]);

      const captureResult = await accessor.call(
        captureFn,
        ...captureValues,
        targetAddr,
      );
      expect(Number(captureResult)).toBe(targetAddr);

      const capturedBuf = await accessor.read(
        targetAddr,
        captureTypes.length * 8,
      );
      for (let i = 0; i < captureValues.length; i++) {
        const expectedBits = rawBitsOf(
          captureValues[i]!,
          captureIsFloatBySlot[i]!,
        );
        expect(capturedBuf.readBigUInt64LE(i * 8)).toBe(expectedBits);
      }

      // K) chainedCaptureArgsMachineCode: the actual jump-hook thunk --
      // targetAddress is baked in, so from an outside caller's perspective
      // this has *exactly* the real function's own signature (argCount args,
      // no trailing target-address argument), matching how a jump-hook
      // landing point must look. Two argCount shapes:
      //  - argCount=2 (< 4): targetAddress lands in a register (GPR_FOR_SLOT[2]
      //    = R8) the 2 real args never use -- a plain register-set + tail-jmp,
      //    no stack touched.
      //  - argCount=6 (>= 4): targetAddress would land one stack slot past
      //    what the real caller allocated -- needs the full
      //    reserve/relocate/call path in buildFixedCaptureArgsBytes.
      // Both mix int/float in the first 4 slots to prove mask still works
      // through the wrapper, and both check the returned address plus every
      // captured slot's exact bit pattern.
      const chainedCaptureCases: {
        types: CTypeOrString[];
        values: (number | bigint)[];
        isFloatBySlot: boolean[];
      }[] = [
        {
          types: [CType.i64, CType.f64],
          values: [42n, 6.5],
          isFloatBySlot: [false, true],
        },
        {
          types: [
            CType.i64,
            CType.f64,
            CType.i64,
            CType.f64,
            CType.i64,
            CType.f64,
          ],
          values: [11n, 1.25, 22n, 2.25, 33n, 3.25],
          isFloatBySlot: [false, true, false, true, false, true],
        },
      ];
      for (const { types, values, isFloatBySlot } of chainedCaptureCases) {
        const mask = maskFromArgTypes(types);
        const chainedTargetAddr = Number(
          await accessor.alloc(
            types.length * 8,
            null,
            MemoryProtection.READWRITE,
          ),
        );
        const chainedCapture = await chainedCaptureArgsMachineCode(
          accessor,
          BigInt(chainedTargetAddr),
          types.length,
          mask,
        );
        const chainedCaptureAddr = await accessor.machineCode(chainedCapture);
        const chainedCaptureFn: CFunction = createCFunction(
          chainedCaptureAddr,
          ['ptr', [...types]],
        );

        const chainedResult = await accessor.call(chainedCaptureFn, ...values);
        expect(Number(chainedResult)).toBe(chainedTargetAddr);

        const chainedBuf = await accessor.read(
          chainedTargetAddr,
          types.length * 8,
        );
        for (let i = 0; i < values.length; i++) {
          expect(chainedBuf.readBigUInt64LE(i * 8)).toBe(
            rawBitsOf(values[i]!, isFloatBySlot[i]!),
          );
        }
      }
    } finally {
      await accessor.deinit();
    }
  }, 120000);
});
