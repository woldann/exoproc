import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as Native from 'exoproc';
import {
  MemoryProtection,
  NativePointer,
  cmachinecode,
  createCFunction,
  resolveAddress,
  CapstoneX86,
  type Instruction,
  createAccessor,
  type IndirectNThreadHostAccessor,
  NHook,
  NHookInstance,
  type NHookPoolResult,
} from 'exoproc';
import { getGlobalDummyProcess } from 'exoproc-dummy';

// `simulateDisplacedInstructions` is private; these tests reach past that with
// an `any` cast to exercise it directly against hand-encoded byte sequences,
// rather than depending on some real DLL export happening to start with the
// instruction under test.
//
// Driven cross-process (the shared dummy process + IndirectNThreadHostAccessor,
// exactly like minhook.test.ts) rather than a locally spawned thread --
// spawnLoopThread()'s local VirtualAlloc fails under this CI environment
// (see #5), which this sidesteps entirely since no local allocation is
// needed: an existing thread in the spawned process is hijacked directly.
describe('NHook instruction simulation', () => {
  const proc = getGlobalDummyProcess();
  let memory: IndirectNThreadHostAccessor;
  let nhook: NHook;
  const capstone = new CapstoneX86();

  // Scratch RW memory used as a fake stack for push/pop/call/ret.
  let scratchMid: bigint;

  beforeAll(async () => {
    const thread = Native.Thread.getThreads(proc.pid)[0];
    if (!thread) throw new Error('No thread found in the spawned process');

    memory = (await createAccessor(thread.tid, {
      nthreadOptions: { timeoutMs: 20000 },
    })) as IndirectNThreadHostAccessor;

    nhook = new NHook(proc.pid);

    const scratch = await memory.alloc(4096, null, MemoryProtection.READWRITE);
    scratchMid = BigInt(Native.resolveAddress(scratch)) + 2048n;
  });

  afterAll(async () => {
    await memory.deinit();
  });

  function freshCtx(
    overrides: Partial<Record<string, bigint>> = {},
  ): Native.ThreadContext {
    const base: Record<string, bigint> = {
      Rax: 0n,
      Rbx: 0n,
      Rcx: 0n,
      Rdx: 0n,
      Rsi: 0n,
      Rdi: 0n,
      Rbp: 0n,
      Rsp: scratchMid,
      Rip: 0x1000n,
      R8: 0n,
      R9: 0n,
      R10: 0n,
      R11: 0n,
      R12: 0n,
      R13: 0n,
      R14: 0n,
      R15: 0n,
    };
    return Object.assign(base, overrides) as unknown as Native.ThreadContext;
  }

  function makeHook(bytes: number[], addr = 0x1000n): NHookInstance {
    const displacedInstructions: Instruction[] = capstone.disasm(
      Buffer.from(bytes),
      addr,
    );
    // simulateDisplacedInstructions never touches the handle's captured `memory`
    // (it drives everything through the accessor passed to it), so any real
    // accessor satisfies the constructor here.
    // The hook API identifies its target by a CFunction, not a raw address, so
    // wrap the fake test address in one (with a throwing local callable --
    // these simulate tests drive it through `memory`, never call it locally).
    const targetFn = createCFunction(Number(addr), ['u64', []], () => {
      throw new Error('nhook simulate-test target must not be called locally');
    });
    return new NHookInstance(
      nhook,
      memory,
      targetFn,
      Buffer.from(bytes),
      bytes.length,
      displacedInstructions,
      Buffer.from([0xeb, 0xfe]),
    );
  }

  async function simulate(
    bytes: number[],
    ctx: Native.ThreadContext,
    addr = 0x1000n,
  ): Promise<Native.ThreadContext> {
    const hook = makeHook(bytes, addr);
    await (nhook as any).simulateDisplacedInstructions(memory, ctx, hook);
    return ctx;
  }

  test('mov reg64, reg64 passes the full value through', async () => {
    const ctx = freshCtx({ Rbx: 0x1122334455667788n });
    await simulate([0x48, 0x89, 0xd8], ctx); // mov rax, rbx
    expect(ctx.Rax).toBe(0x1122334455667788n);
  });

  test('mov reg32, reg32 zero-extends into the full 64-bit register', async () => {
    const ctx = freshCtx({
      Rax: 0xdeadbeef00000000n,
      Rcx: 0x1122334455667788n,
    });
    await simulate([0x89, 0xc8], ctx); // mov eax, ecx
    expect(ctx.Rax).toBe(0x55667788n); // upper 32 bits cleared, not RCX's
  });

  test('movzx zero-extends an 8-bit source', async () => {
    const ctx = freshCtx({
      Rax: 0xffffffffffffffffn,
      Rcx: 0x00000000000000abn,
    });
    await simulate([0x0f, 0xb6, 0xc1], ctx); // movzx eax, cl
    expect(ctx.Rax).toBe(0xabn);
  });

  test('movsx sign-extends a negative 8-bit source', async () => {
    const ctx = freshCtx({ Rcx: 0xffn }); // cl = 0xff = -1 as int8
    await simulate([0x48, 0x0f, 0xbe, 0xc1], ctx); // movsx rax, cl
    expect(ctx.Rax).toBe(BigInt.asUintN(64, -1n));
  });

  test('movsxd sign-extends a 32-bit source into 64 bits', async () => {
    const ctx = freshCtx({ Rcx: 0xffffffffn }); // ecx = -1 (int32)
    await simulate([0x48, 0x63, 0xc1], ctx); // movsxd rax, ecx
    expect(ctx.Rax).toBe(BigInt.asUintN(64, -1n));
  });

  test('mov reg, [mem] and [mem], reg round-trip through real memory', async () => {
    const ctx = freshCtx({ Rax: 0x0102030405060708n });
    // mov [rsp], rax ; then mov rbx, [rsp]
    await simulate([0x48, 0x89, 0x04, 0x24], ctx);
    const stackBuf = await memory.read(scratchMid, 8);
    expect(stackBuf.readBigUInt64LE(0)).toBe(0x0102030405060708n);

    await simulate([0x48, 0x8b, 0x1c, 0x24], ctx); // mov rbx, [rsp]
    expect(ctx.Rbx).toBe(0x0102030405060708n);
  });

  test('add/sub/and/or/xor', async () => {
    let ctx = freshCtx({ Rax: 5n, Rbx: 3n });
    await simulate([0x48, 0x01, 0xd8], ctx); // add rax, rbx
    expect(ctx.Rax).toBe(8n);

    ctx = freshCtx({ Rax: 5n, Rbx: 3n });
    await simulate([0x48, 0x29, 0xd8], ctx); // sub rax, rbx
    expect(ctx.Rax).toBe(2n);

    ctx = freshCtx({ Rax: 0b1100n, Rbx: 0b1010n });
    await simulate([0x48, 0x21, 0xd8], ctx); // and rax, rbx
    expect(ctx.Rax).toBe(0b1000n);

    ctx = freshCtx({ Rax: 0b1100n, Rbx: 0b1010n });
    await simulate([0x48, 0x09, 0xd8], ctx); // or rax, rbx
    expect(ctx.Rax).toBe(0b1110n);

    ctx = freshCtx({ Rax: 0b1100n, Rbx: 0b1010n });
    await simulate([0x48, 0x31, 0xd8], ctx); // xor rax, rbx
    expect(ctx.Rax).toBe(0b0110n);
  });

  test('inc/dec/not/neg', async () => {
    let ctx = freshCtx({ Rax: 5n });
    await simulate([0x48, 0xff, 0xc0], ctx); // inc rax
    expect(ctx.Rax).toBe(6n);

    ctx = freshCtx({ Rax: 5n });
    await simulate([0x48, 0xff, 0xc8], ctx); // dec rax
    expect(ctx.Rax).toBe(4n);

    ctx = freshCtx({ Rax: 0n });
    await simulate([0x48, 0xf7, 0xd0], ctx); // not rax
    expect(ctx.Rax).toBe(BigInt.asUintN(64, -1n));

    ctx = freshCtx({ Rax: 5n });
    await simulate([0x48, 0xf7, 0xd8], ctx); // neg rax
    expect(ctx.Rax).toBe(BigInt.asUintN(64, -5n));
  });

  test('push/pop round-trip through real memory and adjust Rsp', async () => {
    const ctx = freshCtx({ Rax: 0x1234n });
    await simulate([0x50], ctx); // push rax
    expect(ctx.Rsp).toBe(scratchMid - 8n);
    const stackBuf = await memory.read(ctx.Rsp, 8);
    expect(stackBuf.readBigUInt64LE(0)).toBe(0x1234n);

    ctx.Rbx = 0n;
    await simulate([0x5b], ctx); // pop rbx
    expect(ctx.Rbx).toBe(0x1234n);
    expect(ctx.Rsp).toBe(scratchMid);
  });

  test('lea computes a rip-relative effective address', async () => {
    const ctx = freshCtx();
    // lea rax, [rip+0x10] at address 0x2000 (7-byte instruction)
    await simulate([0x48, 0x8d, 0x05, 0x10, 0x00, 0x00, 0x00], ctx, 0x2000n);
    expect(ctx.Rax).toBe(0x2000n + 7n + 0x10n);
  });

  test('cmp/test/nop leave registers untouched', async () => {
    const ctx = freshCtx({ Rax: 0x42n, Rbx: 0x99n });
    await simulate([0x48, 0x39, 0xd8], ctx); // cmp rax, rbx
    expect(ctx.Rax).toBe(0x42n);
    expect(ctx.Rbx).toBe(0x99n);

    await simulate([0x90], ctx); // nop
    expect(ctx.Rax).toBe(0x42n);
    expect(ctx.Rbx).toBe(0x99n);
  });

  test('jmp rel resolves to the absolute target and stops simulation', async () => {
    const ctx = freshCtx();
    await simulate([0xe9, 0xfb, 0x0f, 0x00, 0x00], ctx, 0x1000n); // jmp 0x2000
    expect(ctx.Rip).toBe(0x2000n);
  });

  test('jmp through an IAT-style [rip] thunk follows the stored pointer', async () => {
    const ctx = freshCtx();
    // ff 25 00000000 = jmp qword ptr [rip+0]; the pointer slot sits right
    // after the 6-byte instruction, at scratchMid, and holds the real target.
    const target = scratchMid + 0x9000n;
    const ptrBuf = Buffer.alloc(8);
    ptrBuf.writeBigUInt64LE(target);
    await memory.write(scratchMid, ptrBuf);

    const insnAddr = scratchMid - 6n;
    await simulate([0xff, 0x25, 0x00, 0x00, 0x00, 0x00], ctx, insnAddr);
    expect(ctx.Rip).toBe(target);
  });

  test('call rel pushes a return address and jumps', async () => {
    const ctx = freshCtx();
    await simulate([0xe8, 0xfb, 0x0f, 0x00, 0x00], ctx, 0x1000n); // call 0x2000
    expect(ctx.Rip).toBe(0x2000n);
    expect(ctx.Rsp).toBe(scratchMid - 8n);
    const stackBuf = await memory.read(ctx.Rsp, 8);
    expect(stackBuf.readBigUInt64LE(0)).toBe(0x1005n); // call addr + insn size
  });

  test('ret pops Rip from the stack and restores Rsp', async () => {
    const ctx = freshCtx();
    const retAddrBuf = Buffer.alloc(8);
    retAddrBuf.writeBigUInt64LE(0x3000n);
    await memory.write(scratchMid, retAddrBuf);

    await simulate([0xc3], ctx); // ret
    expect(ctx.Rip).toBe(0x3000n);
    expect(ctx.Rsp).toBe(scratchMid + 8n);
  });
});

// Poll `getExitCode()` directly (GetExitCodeThread) rather than `Handle.wait()`
// (thread signal state) so this test verifies nhook's own
// resume()/simulateDisplacedInstructions logic in isolation.
async function pollExitCode(
  thread: Native.Thread,
  timeoutMs: number,
): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const code = thread.getExitCode();
    if (code !== Native.ThreadState.STILL_ACTIVE) return code;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for thread exit code');
}

// CreateThread's lpParameter delivery is corrupted in this CI environment
// (see #5) even though CreateThread itself reports success -- it doesn't
// reproduce locally, only under GitHub Actions' virtualized runners. Rather
// than pass the argument through lpParameter, bake it in as a compile-time
// literal in a small thread-entry wrapper that calls the real target with a
// real x64 call (correct RCX, unrelated to the corrupted lpParameter path),
// so the wrapper's own (unused, possibly-corrupted) parameter never matters.
function makeThreadEntry(targetAddr: bigint, arg: number): bigint {
  const wrapper = cmachinecode({
    returns: 'i32',
    args: ['i32'],
    source: `
      typedef int (*Target)(int);
      Target target = (Target)0x${targetAddr.toString(16)}ULL;
      return target(${arg});
    `,
  });
  return BigInt(resolveAddress(wrapper));
}

describe('NHook end-to-end lifecycle (real compiled function, real thread)', () => {
  test('hooks a live cmachinecode-compiled function, intercepts a real call via poll(), and resumes it', async () => {
    // A real, TCC-compiled function (not hand-picked bytes) -- exercises
    // whatever prologue the compiler actually emits, e.g. TCC's unoptimized
    // `push rbp; mov rbp, rsp` (1 byte + 3 bytes -- satisfies the "first
    // displaced instruction is 1 byte when 2 are stolen" invariant).
    const targetFn = cmachinecode({
      returns: 'i32',
      args: ['i32'],
      source: `return arg0 * 2 + 1;`,
    });
    const targetAddr = BigInt(resolveAddress(targetFn));
    const memory = Native.currentProcess.memory;

    const nhook = new NHook(Native.currentProcess.pid);
    const hook = await nhook.create(memory, targetFn);
    await hook.enable();

    let thread: Native.Thread | undefined;
    try {
      // A real OS thread "naturally" entering the hooked function, via a
      // wrapper entry point that calls it with a hardcoded argument (see
      // makeThreadEntry) -- the call into targetFn itself is genuine, real
      // x64 execution, hitting the JMP hook exactly as if entered directly.
      thread = Native.Thread.create(
        new NativePointer(makeThreadEntry(targetAddr, 10)),
        new NativePointer(0n),
      );

      // The thread hits EB FE and parks almost immediately, but poll a few
      // times to avoid a race against thread startup.
      let hits: NHookPoolResult[] = [];
      for (let i = 0; i < 50 && hits.length === 0; i++) {
        hits = await nhook.poll();
        if (hits.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }
      expect(hits).toHaveLength(1);
      const hit = hits[0]!;
      expect(hit.threadId).toBe(thread.tid);
      expect(hit.args[0]).toBe(10n);

      // Resume: simulates just the stolen prologue bytes, then lets the real
      // thread run the actual (unmodified) rest of the function body on the
      // CPU -- this is not simulated, it's the genuine compiled code executing.
      await nhook.resume(hit);

      expect(await pollExitCode(thread, 5000)).toBe(21); // 10 * 2 + 1
    } finally {
      await hook.disable();
      thread?.close();
    }

    // Hook removed -- a fresh call runs the real prologue unhooked, no
    // polling/interception involved at all.
    const thread2 = Native.Thread.create(
      new NativePointer(makeThreadEntry(targetAddr, 7)),
      new NativePointer(0n),
    );
    try {
      expect(await pollExitCode(thread2, 5000)).toBe(15); // 7 * 2 + 1
    } finally {
      thread2.close();
    }
  }, 20000);

  test('poll() catches two threads parked at once; default resume computes the real result, custom resume forces one', async () => {
    const targetFn = cmachinecode({
      returns: 'i32',
      args: ['i32'],
      source: `return arg0 * 2 + 1;`,
    });
    const targetAddr = BigInt(resolveAddress(targetFn));
    const memory = Native.currentProcess.memory;

    const nhook = new NHook(Native.currentProcess.pid);
    const hook = await nhook.create(memory, targetFn);
    await hook.enable();

    let threadA: Native.Thread | undefined;
    let threadB: Native.Thread | undefined;
    try {
      // Spawn both threads back-to-back, before polling at all, so poll()
      // has to catch two simultaneously parked hits in a single pass.
      threadA = Native.Thread.create(
        new NativePointer(makeThreadEntry(targetAddr, 10)),
        new NativePointer(0n),
      );
      threadB = Native.Thread.create(
        new NativePointer(makeThreadEntry(targetAddr, 20)),
        new NativePointer(0n),
      );

      const hits: NHookPoolResult[] = [];
      for (let i = 0; i < 50 && hits.length < 2; i++) {
        const newHits = await nhook.poll();
        for (const h of newHits) {
          if (!hits.some((existing) => existing.threadId === h.threadId)) {
            hits.push(h);
          }
        }
        if (hits.length < 2) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }
      expect(hits).toHaveLength(2);

      const hitA = hits.find((h) => h.threadId === threadA!.tid);
      const hitB = hits.find((h) => h.threadId === threadB!.tid);
      expect(hitA).toBeDefined();
      expect(hitB).toBeDefined();
      expect(hitA!.args[0]).toBe(10n);
      expect(hitB!.args[0]).toBe(20n);

      // A: default resume -- simulates just the stolen prologue, then lets
      // the real (unmodified) function body run and compute its own result.
      await nhook.resume(hitA!);
      // B: forced custom return value -- threadReturn() sets RAX directly
      // and returns immediately, without ever executing the function body.
      await nhook.resume(hitB!, 999n);

      expect(await pollExitCode(threadA, 5000)).toBe(21); // 10 * 2 + 1, genuinely computed
      expect(await pollExitCode(threadB, 5000)).toBe(999); // forced, not 20 * 2 + 1 (41)
    } finally {
      await hook.disable();
      threadA?.close();
      threadB?.close();
    }
  }, 20000);
});
