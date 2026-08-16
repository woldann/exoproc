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
  installCallThunk,
  installCaptureArgsThunk,
  installCaptureHookThunk,
  packCallArgs,
  type ThunkSignature,
} from 'bun-thunks';
import {
  buildCallBytes,
  createCallThunk,
  gprForSlot,
  maskFromArgTypes,
  xmmForSlot,
  CALL_REGISTER_SLOTS,
  CALL_VARIANT_COUNT,
} from 'bun-thunks/machine-code';
import { X64Assembler, qword } from 'exoproc/asm';

type IndirectAccessor = Awaited<ReturnType<typeof createAccessor>>;

// Builds a target ABI shape whose first four register classes match `mask`.
// Extra arguments are raw u64 stack slots; only the first four positions need
// a GPR-vs-XMM distinction in the Win64 ABI.
function targetForMask(
  mask: number,
  argCount = CALL_REGISTER_SLOTS,
  returns: CTypeOrString = 'u64',
): ThunkSignature {
  const args: CTypeOrString[] = [];
  for (let i = 0; i < argCount; i++) {
    args.push(
      i < CALL_REGISTER_SLOTS && mask & (1 << i) ? CType.f64 : CType.u64,
    );
  }
  return { returns, args };
}

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
): Uint8Array {
  const assembler = new X64Assembler();
  assembler.xor('rax', 'rax');

  for (let slot = 0; slot < CALL_REGISTER_SLOTS; slot++) {
    if (mask & (1 << slot)) {
      assembler.movq('r10', xmmForSlot(slot));
      assembler.xor('rax', 'r10');
    } else {
      assembler.xor('rax', gprForSlot(slot));
    }
  }

  for (let index = 0; index < stackTestArgCount; index++) {
    assembler.mov('r10', qword('rsp', 0x28 + index * 8));
    assembler.xor('rax', 'r10');
  }

  // outputPtr is the argument immediately after the test values.
  assembler.mov('r11', qword('rsp', 0x28 + stackTestArgCount * 8));
  assembler.mov(qword('r11'), 'rax');
  assembler.ret();
  return assembler.finish();
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
// output buffer. `invokeStyle` defaults to 'call'; 'jump' exercises the
// true-tail-call shape (no `ret` in the generated caller at all) -- since
// accessor.call() itself is a normal synchronous call/return, a broken
// tail-jmp (bad return-address relocation, clobbered RBX, wrong stack
// alignment) would corrupt the caller's own stack/registers or crash Wine
// outright, not just produce a wrong checksum -- so a correct checksum here
// is a fairly strong end-to-end proof the relocation is right.
async function callProbeThroughCallBytes(
  accessor: IndirectAccessor,
  mask: number,
  values: readonly (number | bigint)[],
  argTypes: readonly CTypeOrString[],
  stackTestArgCount: number,
  invokeStyle: 'call' | 'jump' = 'call',
): Promise<bigint> {
  const probe = createPendingMachineCode(
    ['u64', []],
    buildChecksumProbeBytes(mask, stackTestArgCount),
  );
  const probeAddr = await accessor.machineCode(probe);

  const outputAddr = Number(
    await accessor.alloc(8, null, MemoryProtection.READWRITE),
  );
  const allValues = [...values, outputAddr];
  const allTypes = [...argTypes, 'ptr' as CTypeOrString];
  const caller = await installCallThunk(accessor, {
    mode: 'dynamic',
    signature: targetForMask(mask, allValues.length),
    invokeStyle,
  });
  // This helper intentionally varies the dispatch mask independently of the
  // packed values' real types, so it packs manually instead of using the
  // installed handle's signature-driven allocatePayload convenience.
  const argsBuf = packCallArgs(allValues, allTypes);
  const argsAddr = await accessor.alloc(
    argsBuf.length,
    null,
    MemoryProtection.READWRITE,
  );
  await accessor.write(argsAddr, argsBuf);

  await accessor.call(caller.fn, probeAddr, BigInt(allValues.length), argsAddr);
  const resultBuf = await accessor.read(outputAddr, 8);
  return resultBuf.readBigUInt64LE(0);
}

// Same probe/checksum setup as callProbeThroughCallBytes, but invoked through
// installCallThunk's packed one-pointer mode. This exercises that the target
// signature still controls the real probe's register/XMM assignment through
// the composed outer/inner dispatchers.
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

  const outputAddr = Number(
    await accessor.alloc(8, null, MemoryProtection.READWRITE),
  );
  const allValues = [...values, outputAddr];
  const allTypes = [...argTypes, 'ptr' as CTypeOrString];
  const chained = await installCallThunk(accessor, {
    mode: 'packed',
    signature: { returns: 'u64', args: allTypes },
  });
  expect(maskFromArgTypes(allTypes)).toBe(mask);
  const payload = await chained.allocatePayload({
    target: probeAddr,
    values: allValues,
  });

  try {
    await accessor.call(chained.fn, ...payload.callArgs);
    const resultBuf = await accessor.read(outputAddr, 8);
    return resultBuf.readBigUInt64LE(0);
  } finally {
    await payload.dispose();
  }
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
      // across masks. Since packCallArgs' output doesn't depend on mask at all,
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
      const allInt6Values = [1n, 2n, 3n, 4n, 5n, 6n];
      const caller0 = await installCallThunk(accessor, {
        mode: 'dynamic',
        signature: allInt6,
      });
      const dynamicPayload = await caller0.allocatePayload({
        target: allInt6Addr,
        values: allInt6Values,
      });
      const resultB = await accessor.call(
        caller0.fn,
        ...dynamicPayload.callArgs,
      );
      expect(resultB).toBe(91n);

      // B2) Same target in bound mode: the explicitly supplied *remote*
      // address and argCount are baked into the bytes, so the installed thunk
      // only takes one payload pointer. The API never reads allInt6.ptr, which
      // is cmachinecode()'s local JIT address and invalid in the target process.
      const [boundCaller, concurrentBoundCaller] = await Promise.all([
        installCallThunk(accessor, {
          mode: 'bound',
          signature: allInt6,
          target: allInt6Addr,
        }),
        installCallThunk(accessor, {
          mode: 'bound',
          signature: allInt6,
          target: allInt6Addr,
        }),
      ]);
      expect(concurrentBoundCaller.address).toBe(boundCaller.address);
      const boundPayload = await boundCaller.allocatePayload({
        values: allInt6Values,
      });
      const resultB2 = await accessor.call(
        boundCaller.fn,
        ...boundPayload.callArgs,
      );
      expect(resultB2).toBe(91n);

      // B3) buildCallBytes's functionPointer operand as an *explicit*
      // register (`r8`) instead of the natural `rcx`/fixed-bigint
      // choices used above. There's no auto-assignment -- the caller (here,
      // the test itself) names every register directly: functionPointer
      // reads from R8 (expected to already be set at entry, not part of the
      // Win64 argument list at all), argCount from RCX, args from RDX --
      // its own two real parameters landing in the first two slots exactly
      // as if functionPointer had never existed as a parameter. Proven
      // end-to-end via a tiny relay stub that pre-loads R8 with allInt6Addr
      // and tail-jumps in, leaving RCX/RDX (the caller's real argCount/args
      // arguments) completely untouched -- exactly the composition this
      // operand shape exists for (some other generated code handing off a
      // value already sitting in a register, rather than through the
      // standard entry ABI).
      const explicitRegCaller = createPendingMachineCode(
        ['i64', ['u64', 'ptr']],
        buildCallBytes('r8', 'rcx', 'rdx', 0),
      );
      const explicitRegCallerAddr =
        await accessor.machineCode(explicitRegCaller);
      const relayAssembler = new X64Assembler();
      relayAssembler.mov('r8', BigInt(allInt6Addr));
      relayAssembler.mov('r11', BigInt(explicitRegCallerAddr));
      relayAssembler.jmpRegister('r11');
      const relay = createPendingMachineCode(
        ['i64', ['u64', 'ptr']],
        relayAssembler.finish(),
      );
      const relayAddr = await accessor.machineCode(relay);
      const relayFn: CFunction = createCFunction(relayAddr, [
        'i64',
        ['u64', 'ptr'],
      ]);
      const resultB3 = await accessor.call(
        relayFn,
        BigInt(allInt6Values.length),
        dynamicPayload.address,
      );
      expect(resultB3).toBe(91n);
      expect(() =>
        createCallThunk({
          signature: targetForMask(0),
          functionPointer: 1n,
        }),
      ).toThrow('callable ABI register placement');
      expect(() => buildCallBytes(1n, -1n, 'rcx', 0)).toThrow(
        'argCount must be non-negative',
      );
      expect(() => buildCallBytes('rcx', 'rax', 'rdx', 0)).toThrow(
        'overwritten by the call-thunk prologue',
      );

      expect(dynamicPayload.isDisposed).toBe(false);
      await Promise.all([dynamicPayload.dispose(), dynamicPayload.dispose()]);
      expect(dynamicPayload.isDisposed).toBe(true);
      await dynamicPayload.dispose();
      await boundPayload.dispose();

      // C) Stack-arg path (positions 4 and 5) with real double bit patterns,
      // via the checksum probe -- proves packCallArgs' float packing plus the
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

      // C2) invokeStyle: 'jump' -- safe only for argCount<=4. The thunk
      // restores its original RSP/RBX before jumping, so the target sees the
      // original return address and caller shadow space. Staged overflow args
      // would be discarded by that required restore, so signature-aware APIs
      // reject >4. This four-argument probe proves the supported tail-call
      // shape and the following calls prove the thread remains usable.
      const jumpProbeAssembler = new X64Assembler();
      jumpProbeAssembler.mov('rax', 'rcx');
      jumpProbeAssembler.xor('rax', 'rdx');
      jumpProbeAssembler.xor('rax', 'r8');
      jumpProbeAssembler.xor('rax', 'r9');
      jumpProbeAssembler.ret();
      const jumpProbeBytes = jumpProbeAssembler.finish();
      const jumpProbe = createPendingMachineCode(['u64', []], jumpProbeBytes);
      const jumpProbeAddr = await accessor.machineCode(jumpProbe);
      const jumpCaller = await installCallThunk(accessor, {
        mode: 'dynamic',
        signature: targetForMask(0),
        invokeStyle: 'jump',
      });
      const jumpPayload = await jumpCaller.allocatePayload({
        target: jumpProbeAddr,
        values: [1n, 2n, 3n, 4n],
      });
      const resultC2 = await accessor.call(
        jumpCaller.fn,
        ...jumpPayload.callArgs,
      );
      expect(resultC2).toBe(1n ^ 2n ^ 3n ^ 4n);
      await jumpPayload.dispose();
      await expect(
        installCallThunk(accessor, {
          mode: 'dynamic',
          signature: targetForMask(0, 5),
          invokeStyle: 'jump',
        }),
      ).rejects.toThrow('at most 4 arguments');

      // D) returns: 'f64', exercised for real via a hand-assembled probe
      // rather than a TCC-compiled target -- TCC turns out to also mishandle
      // "int parameter + double return" (confirmed independently by calling
      // such a function directly, bypassing the call machine code entirely:
      // still wrong), so it can't be trusted here any more than for double
      // *parameters* (see the CLAUDE.md gotcha). The probe just echoes its
      // raw RCX bits into XMM0 ("movq xmm0, rcx; ret"); we pack the exact
      // IEEE-754 bit pattern of 10.5 as a plain u64 (mask 0, delivered via
      // RCX, not XMM), so a correct round trip proves both that the call
      // machine code leaves XMM0 untouched after its own cleanup and that
      // `returns: 'f64'`'s signature makes the caller read it back as a
      // double correctly.
      const echoAsDoubleAssembler = new X64Assembler();
      echoAsDoubleAssembler.movq('xmm0', 'rcx');
      echoAsDoubleAssembler.ret();
      const echoAsDoubleBytes = echoAsDoubleAssembler.finish();
      const echoAsDouble = createPendingMachineCode(
        ['u64', []],
        echoAsDoubleBytes,
      );
      const echoAsDoubleAddr = await accessor.machineCode(echoAsDouble);

      const floatSignature: ThunkSignature = {
        returns: CType.f64,
        args: [CType.u64],
      };
      const echoCaller = await installCallThunk(accessor, {
        mode: 'dynamic',
        signature: floatSignature,
      });
      const doubleBits = rawBitsOf(10.5, true);
      const doublePayload = await echoCaller.allocatePayload({
        target: echoAsDoubleAddr,
        values: [doubleBits],
      });
      const resultD = await accessor.call(
        echoCaller.fn,
        ...doublePayload.callArgs,
      );
      expect(resultD).toBe(10.5);
      await doublePayload.dispose();

      // E) The registry canonicalizes bytes separately from typed wrappers:
      // equal bytes+signature are identity-stable, while another return type
      // gets its own stable wrapper over the same canonical byte array.
      const mask5Int = createCallThunk({ signature: targetForMask(5) });
      const mask5Float = createCallThunk({
        signature: targetForMask(5, 4, 'f64'),
      });
      expect(createCallThunk({ signature: targetForMask(5) })).toBe(mask5Int);
      expect(createCallThunk({ signature: targetForMask(5, 4, 'f64') })).toBe(
        mask5Float,
      );
      expect(mask5Float).not.toBe(mask5Int);
      expect(mask5Float.bytes).toBe(mask5Int.bytes);

      // F) Packed call mode: a single-argument outer thunk bound to an
      // installed dynamic dispatcher. Its combined [ptr, argCount,
      // selfPointer, ...args] payload can call any
      // function matching (mask, returns). Mixed int/float mask (same shape
      // as A) proves `mask` still controls the *real* target's own
      // register/XMM assignment through the extra indirection -- not
      // silently ignored/hardcoded somewhere in the chain.
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
      // buffer's header) correctly reaches the inner dispatcher's own
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

      // H) Installation caching is per accessor and byte sequence. Repeated
      // packed installs get the same remote address; a different typed return
      // view can share that address while keeping its own CMachineCode wrapper.
      const chained0 = await installCallThunk(accessor, {
        mode: 'packed',
        signature: targetForMask(0),
      });
      const chained0Again = await installCallThunk(accessor, {
        mode: 'packed',
        signature: targetForMask(0),
      });
      expect(chained0Again.address).toBe(chained0.address);
      expect(chained0Again.machineCode).toBe(chained0.machineCode);
      const chained0Float = await installCallThunk(accessor, {
        mode: 'packed',
        signature: targetForMask(0, 4, 'f64'),
      });
      expect(chained0Float.address).toBe(chained0.address);
      expect(chained0Float.machineCode).not.toBe(chained0.machineCode);

      // I) A 5-argument call through the chain -- 4 register/XMM slots (mixed
      // int/float, same mask as F) plus 1 real stack argument, so this single
      // call exercises the register dispatch and the stack-arg copy loop
      // together. The packed call payload here is 8 slots, not 7:
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

      // J) installCaptureArgsThunk installs an ordinary function that writes
      // its incoming arguments to a trailing destination pointer, reusable
      // across as many destination addresses as callers want. Six real args:
      // 4 register/XMM slots
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
      const capture = await installCaptureArgsThunk(accessor, {
        args: captureTypes,
      });
      const captureAgain = await installCaptureArgsThunk(accessor, {
        args: captureTypes,
      });
      expect(captureAgain.address).toBe(capture.address);
      expect(captureAgain.machineCode).toBe(capture.machineCode);

      const captureResult = await accessor.call(
        capture.fn,
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

      // K) installCaptureHookThunk: the fixed-destination jump-hook adapter.
      // The destination is baked in, so from an outside caller's perspective
      // this has *exactly* the real function's own signature (argCount args,
      // no trailing target-address argument), matching how a jump-hook
      // landing point must look. The cases cover argCount=2's register-only
      // tail-jump plus 4/5/6/13-argument stack-frame adapters. The larger cases
      // prove the adapter calls its collector, restores RSP/RBX, and supports
      // offsets/frame sizes beyond signed disp8/imm8. A normal collector call
      // immediately after every adapter invocation verifies the thread remains
      // usable. Mixed int/float cases also prove the first-four mask survives
      // the composition.
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
          types: [CType.i64, CType.f64, CType.i64, CType.f64],
          values: [10n, 1.5, 20n, 2.5],
          isFloatBySlot: [false, true, false, true],
        },
        {
          types: [CType.i64, CType.f64, CType.i64, CType.f64, CType.i64],
          values: [10n, 1.5, 20n, 2.5, 30n],
          isFloatBySlot: [false, true, false, true, false],
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
        {
          types: Array.from({ length: 13 }, () => CType.i64),
          values: Array.from({ length: 13 }, (_, index) => BigInt(index + 1)),
          isFloatBySlot: Array.from({ length: 13 }, () => false),
        },
      ];
      for (const { types, values, isFloatBySlot } of chainedCaptureCases) {
        const chainedTargetAddr = Number(
          await accessor.alloc(
            types.length * 8,
            null,
            MemoryProtection.READWRITE,
          ),
        );
        const reusableCollector = await installCaptureArgsThunk(accessor, {
          args: types,
        });
        const chainedCapture = await installCaptureHookThunk(accessor, {
          args: types,
          destination: chainedTargetAddr,
          collector: reusableCollector,
        });
        expect(chainedCapture.collector.address).toBe(
          reusableCollector.address,
        );

        const chainedResult = await accessor.call(chainedCapture.fn, ...values);
        expect(Number(chainedResult)).toBe(chainedTargetAddr);
        const followUpResult = await accessor.call(
          reusableCollector.fn,
          ...values,
          chainedTargetAddr,
        );
        expect(Number(followUpResult)).toBe(chainedTargetAddr);

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
