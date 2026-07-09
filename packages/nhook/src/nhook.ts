import * as Native from 'bun-winapi';
import { type HookPoolResult, type HookTarget } from 'bun-winapi';
import {
  NativePointer,
  MemoryProtection,
  ThreadAccess,
  createCFunction,
  resolveAddress,
  type IMemoryAccessor,
} from 'bun-xffi';

/** A native call argument: either already a bigint, or a number to be coerced. */
type Arg = number | bigint;
import {
  CapstoneX86,
  type Instruction,
  x86_reg,
  x86_op_type,
  type X86Detail,
  type X86Operand,
  X86_REG_TO_CONTEXT_NAME,
} from 'bun-capstone';
import { IndirectNThreadHostAccessor, getRandomSpinStub } from 'bun-nthread';
import { log } from './logger.js';
import { ProcessExitedError } from './errors.js';

/**
 * A single 2-byte `EB FE` park-and-simulate hook. This is a data handle -- its
 * `enable`/`disable`/`destroy` lifecycle is inherited from {@link Native.Hook}
 * and forwards into {@link NHook}, which holds the real thread-parking logic
 * (and its poll/resume/callOriginal machinery).
 */
export class NHookInstance extends Native.Hook implements Native.PatchHook {
  constructor(
    manager: NHook,
    memory: IMemoryAccessor,
    target: HookTarget,
    public readonly originalBytes: Buffer,
    public readonly affectedLength: number,
    public displacedInstructions: Instruction[],
    public patchBytes: Buffer,
  ) {
    super(manager, memory, target);
  }
}

export interface NHookOptions {
  originalBytes?: Buffer;
  patchBytes?: Buffer;
  enabled?: boolean;
}

/**
 * Result of a successful NHook hit.
 */
export interface NHookPoolResult extends HookPoolResult<NHookInstance> {
  /**
   * The full indirect memory accessor for the captured thread -- not just the
   * raw `NThread` hijack primitive, so consumers get the complete, silent
   * {@link IndirectNThreadHostAccessor} surface (alloc/read/write/call) for
   * anything they do with a hit. Internal per-instruction simulation still
   * reaches into `.nthread` directly for the hot-path raw pokes/context access.
   */
  readonly memory: IndirectNThreadHostAccessor;
  readonly args: bigint[];
}

export class NHook
  extends Native.PollableHookManager<NHookInstance, NHookPoolResult>
  implements Native.InterceptHookManager<NHookInstance, NHookPoolResult>
{
  private readonly _capstone: CapstoneX86;

  /** AH/BH/CH/DH address bits [8:15] of their 16-bit register, not [0:7]. */
  private static readonly HIGH_BYTE_REGS = new Set<number>([
    x86_reg.AH,
    x86_reg.BH,
    x86_reg.CH,
    x86_reg.DH,
  ]);

  constructor(pid: number = Native.currentProcess.pid) {
    super(pid);
    this._capstone = new CapstoneX86();
    this._capstone.onDetail();
  }

  public async create(
    memory: IMemoryAccessor,
    target: HookTarget,
    options: NHookOptions = {},
  ): Promise<NHookInstance> {
    const targetAddr = BigInt(resolveAddress(target));

    if (this.hooks.has(targetAddr)) {
      throw new Error(`Hook already exists at 0x${targetAddr.toString(16)}`);
    }

    // 1. Determine affected length and displaced instructions
    let originalBytes: Buffer;
    let instructions: Instruction[];
    let length = 0;

    if (options.originalBytes) {
      originalBytes = options.originalBytes;
      instructions = this._capstone.disasm(originalBytes, targetAddr);
      length = originalBytes.length;
    } else {
      // Read from memory and determine how many instructions we need to steal for at least 2 bytes (EB FE)
      const prologue = await memory.read(targetAddr, 15);
      instructions = this._capstone.disasm(prologue, targetAddr, 2);
      for (const insn of instructions) {
        length += insn.size;
      }
      // Buffer.from()/subarray() on a read()-populated buffer still carries
      // some native-memory association through to a later write() of the
      // same bytes -- disable()'s restore write reports success but silently
      // never lands. Routing through a plain number array severs that link.
      originalBytes = Buffer.from(Array.from(prologue.subarray(0, length)));
    }

    const patchBytes = options.patchBytes ?? Buffer.from([0xeb, 0xfe]);

    const hook = new NHookInstance(
      this,
      memory,
      target,
      originalBytes,
      length,
      instructions,
      patchBytes,
    );
    hook.enabled = options.enabled ?? false;

    this.hooks.set(targetAddr, hook);
    return hook;
  }

  public async enable(
    memory: IMemoryAccessor,
    hook: NHookInstance,
  ): Promise<void> {
    if (hook.enabled) return;
    const addr = hook.address;

    // Enumerate and handle threads
    const threadIds = Native.Thread.getThreads(this.pid);
    const isLocal = this.pid === Native.currentProcess.pid;

    try {
      if (!isLocal) {
        const remoteThreads = threadIds
          .map((t) => {
            try {
              // Only need minimal access for suspend/resume
              return Native.Thread.open(t.tid, ThreadAccess.SUSPEND_RESUME);
            } catch {
              return null;
            }
          })
          .filter((t) => t !== null) as Native.Thread[];

        Native.Thread.suspendAll(remoteThreads);
        try {
          const oldProtect = await memory.protect(
            hook.target,
            hook.affectedLength,
            MemoryProtection.EXECUTE_READWRITE,
          );
          await memory.write(hook.target, hook.patchBytes);
          await memory.protect(hook.target, hook.affectedLength, oldProtect);
        } finally {
          Native.Thread.resumeAll(remoteThreads);
          remoteThreads.forEach((t) => t.close());
        }
      } else {
        // Local process (Testing/Wine)
        const oldProtect = await memory.protect(
          hook.target,
          hook.affectedLength,
          MemoryProtection.EXECUTE_READWRITE,
        );
        await memory.write(hook.target, hook.patchBytes);
        await memory.protect(hook.target, hook.affectedLength, oldProtect);
      }
      hook.enabled = true;
      log.info(`Enabled hook at 0x${addr.toString(16)}`);
    } catch (err) {
      log.error(`Failed to enable hook: ${err}`);
      throw err;
    }
  }

  public async disable(
    memory: IMemoryAccessor,
    hook: NHookInstance,
  ): Promise<void> {
    if (!hook.enabled) return;
    const addr = hook.address;

    // 1. Catch threads spinning at EB FE
    const pendingHits = await this.poll();

    // 2. Enumerate and handle all threads to ensure safe restoration
    const threadIds = Native.Thread.getThreads(this.pid);
    const isLocal = this.pid === Native.currentProcess.pid;

    try {
      const remoteThreads: Native.Thread[] = [];
      if (!isLocal) {
        for (const t of threadIds) {
          try {
            // Need SUSPEND_RESUME for safety, and GET/SET CONTEXT if we were fixing RIPs (though simulation usually handles it)
            const thread = Native.Thread.open(
              t.tid,
              ThreadAccess.SUSPEND_RESUME,
            );
            remoteThreads.push(thread);
          } catch {
            /* skip */
          }
        }
        Native.Thread.suspendAll(remoteThreads);
      }

      const oldProtect = await memory.protect(
        hook.target,
        hook.affectedLength,
        MemoryProtection.EXECUTE_READWRITE,
      );
      await memory.write(hook.target, hook.originalBytes);

      // Verification read
      const verifiedBytes = await memory.read(
        hook.address,
        hook.affectedLength,
      );
      if (Buffer.compare(verifiedBytes, hook.originalBytes) !== 0) {
        log.error(
          `Hook restoration verification FAILED at 0x${addr.toString(16)}! Memory state is inconsistent.`,
        );
      } else {
        log.debug(`Hook restoration verified at 0x${addr.toString(16)}`);
      }

      await memory.protect(hook.target, hook.affectedLength, oldProtect);

      if (!isLocal) {
        Native.Thread.resumeAll(remoteThreads);
        remoteThreads.forEach((t) => t.close());
      } else {
        // For local process, fix threads that might be at EB FE
        for (const entry of threadIds) {
          if (entry.tid === Native.currentThread.tid) continue;
          try {
            const t = Native.Thread.open(
              entry.tid,
              ThreadAccess.SUSPEND_RESUME |
                ThreadAccess.GET_CONTEXT |
                ThreadAccess.SET_CONTEXT,
            );
            try {
              t.context.fetch();
              if (t.context.Rip === addr) {
                t.suspend();
                try {
                  t.context.fetch();
                  if (t.context.Rip === addr) {
                    t.context.Rip = addr;
                    t.context.apply();
                  }
                } finally {
                  t.resume();
                }
              }
            } finally {
              t.close();
            }
          } catch {
            /* skip */
          }
        }
      }
    } catch (err) {
      log.error(`Error during memory restoration: ${err}`);
    }

    // 3. Resume caught threads
    for (const hit of pendingHits) {
      await this.resume(hit);
    }

    hook.enabled = false;
    log.info(`Disabled hook at 0x${addr.toString(16)}`);
  }

  public async destroy(
    memory: IMemoryAccessor,
    hook: NHookInstance,
  ): Promise<void> {
    const addr = hook.address;
    if (this.hooks.has(addr)) {
      if (hook.enabled) {
        await this.disable(memory, hook);
      }
      this.hooks.delete(addr);
    }
  }

  public async poll(): Promise<NHookPoolResult[]> {
    const hits: NHookPoolResult[] = [];
    const threadIds = Native.Thread.getThreads(this.pid);
    // Every live process has at least one thread, so an empty snapshot for
    // this pid means the target process has exited (or never existed).
    if (threadIds.length === 0) {
      throw new ProcessExitedError(this.pid);
    }

    const sleep = getRandomSpinStub();
    const sleepAddr = sleep ? BigInt(sleep.address) : undefined;

    for (const entry of threadIds) {
      if (entry.tid === Native.currentThread.tid) continue;

      try {
        const thread = Native.Thread.open(entry.tid);
        if (!thread) continue;
        thread.context.fetch();
        const rip = thread.context.Rip;
        thread.close();

        if (sleepAddr !== undefined && rip === sleepAddr) continue;

        const hook = this.hooks.get(rip);
        if (hook) {
          log.debug(
            `Detected hook hit for thread ${entry.tid} at 0x${rip.toString(16)}`,
          );
          const hit = await this.capture(entry.tid, hook);
          if (hit) {
            hits.push(hit);
          }
        } else {
          log.debug(`Thread ${entry.tid} at 0x${rip.toString(16)} (no hook)`);
        }
      } catch (err) {
        // entry.tid itself may have just exited independently of the whole
        // process (normal in a multithreaded target) -- only escalate if the
        // process as a whole is gone, otherwise skip this one thread.
        if (Native.Thread.getThreads(this.pid).length === 0) {
          throw new ProcessExitedError(this.pid, {
            cause: err instanceof Error ? err : undefined,
          });
        }
      }
    }
    return hits;
  }

  public async callOriginal(
    result: NHookPoolResult,
    ...args: Arg[]
  ): Promise<bigint> {
    const { memory, hook: instance } = result;

    // For callOriginal, we simulate displaced instructions on the args-loaded context
    // and then call the resume address.
    const resumeAddr = instance.address + BigInt(instance.affectedLength);

    // We create a temporary "pseudo-captured-thread" state to simulate.
    // A clone of the current thread's context is just a zero-cost scratch
    // buffer here; every register the simulation reads is written first.
    Native.currentThread.context.fetch();
    const tempCtx: Native.ThreadContext = Native.currentThread.context.clone();

    // Map args to registers
    const argRegs = ['Rcx', 'Rdx', 'R8', 'R9'] as const;
    const ctx = tempCtx as unknown as Record<string, bigint>;
    const limit = Math.min(args.length, 4);
    for (let i = 0; i < limit; i++) {
      const reg = argRegs[i];
      if (reg) {
        ctx[reg] =
          typeof args[i] === 'bigint'
            ? (args[i] as bigint)
            : BigInt(args[i] as number);
      }
    }

    // Simulate displaced instructions on this context
    await this.simulateDisplacedInstructions(memory, tempCtx, instance);

    // Now call the resume address with the updated context
    // Note: nthread.call currently doesn't allow passing a full context easily.
    // However, since NHook aims to be simulation-based, we'll use a small assembly stub
    // that we inject temporarily to execute the displaced bytes and jump.
    // This matches the C implementation's "virtual trampoline" logic.

    const stubCode = Buffer.alloc(instance.affectedLength + 14);
    instance.originalBytes.copy(stubCode, 0, 0, instance.affectedLength);
    const jumpOffset = instance.affectedLength;
    stubCode.writeUInt8(0xff, jumpOffset);
    stubCode.writeUInt8(0x25, jumpOffset + 1);
    stubCode.writeUInt32LE(0, jumpOffset + 2);
    stubCode.writeBigUInt64LE(resumeAddr, jumpOffset + 6);

    const stub = await memory.alloc(
      stubCode.length,
      null,
      MemoryProtection.EXECUTE_READWRITE,
    );
    await memory.write(stub, stubCode);
    try {
      // `stub` is just an allocated address, not a real CFunction -- wrap it
      // with a throwing local callable (matching createMachineCode's
      // "remote-only" convention) since memory.call() only needs the address,
      // and the stub must never be invoked as a local BunCFunction.
      const stubFn = createCFunction(
        resolveAddress(stub),
        ['u64', args.map(() => 'u64')],
        () => {
          throw new Error('nhook trampoline stub must not be called locally');
        },
      );
      const resultPtr = await memory.call(stubFn, ...args);
      return resultPtr.toBigInt();
    } finally {
      await memory.free(stub);
    }
  }

  public async getOriginalArgs(
    result: NHookPoolResult,
    count?: number,
  ): Promise<bigint[]> {
    const { memory, hook: instance } = result;
    return threadGetArgs(memory, 0, count ?? instance.argCount);
  }

  public override async resume(
    result: NHookPoolResult,
    returnValue?: bigint,
  ): Promise<void> {
    const { memory, hook: instance } = result;

    if (returnValue !== undefined && returnValue !== null) {
      // Force return from the current function with a custom value
      await threadReturn(memory, returnValue);
    } else {
      // Default resume: simulate displaced instructions and determine jump target
      await this.simulateDisplacedInstructions(
        memory,
        memory.nthread.savedContext,
        instance,
      );

      const originalRip = instance.address;
      let target: bigint;

      if (BigInt(memory.nthread.savedContext.Rip as bigint) === originalRip) {
        target = instance.address + BigInt(instance.affectedLength);
      } else {
        target = BigInt(memory.nthread.savedContext.Rip as bigint);
      }

      await threadJump(memory, target);
    }

    // threadReturn/threadJump only mutate nthread.savedContext and apply it --
    // the thread is still suspended from parking (suspendCount > 0), so
    // applyContext() alone never resumes it. deinit() -> releaseThread()
    // is what actually calls ResumeThread, using the context we just set.
    // Deinit the full accessor (not just `.nthread`) so the indirect chain's
    // own resources are torn down too, not only the underlying thread hijack.
    await memory.deinit();
  }

  private async simulateDisplacedInstructions(
    accessor: IndirectNThreadHostAccessor,
    ctx: Native.ThreadContext,
    hook: NHookInstance,
  ): Promise<void> {
    const { nthread } = accessor;
    for (const insn of hook.displacedInstructions) {
      const detail = insn.detail as X86Detail;
      if (!detail || !detail.x86) continue;

      const x86 = detail.x86;
      log.debug(`Simulating: ${insn.mnemonic} ${insn.op_str}`);

      switch (insn.mnemonic) {
        case 'push': {
          const op = x86.operands[0];
          if (!op) break;
          const val = await this.readOperand(accessor, ctx, op, insn);

          const rsp = BigInt(ctx.Rsp as bigint) - 8n;
          ctx.Rsp = rsp;
          const buf = Buffer.alloc(8);
          buf.writeBigUInt64LE(BigInt.asUintN(64, val));
          await nthread.write(new NativePointer(rsp), buf);
          break;
        }
        case 'pop': {
          const op = x86.operands[0];
          if (!op) break;
          const rsp = BigInt(ctx.Rsp as bigint);
          const val = await this.readMemSized(accessor, rsp, 8);
          ctx.Rsp = rsp + 8n;
          await this.writeOperand(accessor, ctx, op, insn, val);
          break;
        }
        case 'mov':
        case 'movzx':
        case 'movsx':
        case 'movsxd': {
          const dst = x86.operands[0];
          const src = x86.operands[1];
          if (!dst || !src) break;

          let val = await this.readOperand(accessor, ctx, src, insn);
          if (insn.mnemonic === 'movsx' || insn.mnemonic === 'movsxd') {
            // Sign-extend from the source width, then let writeOperand/
            // setRegValue re-truncate to the destination width below.
            const srcBits = (src.size || 4) * 8;
            val = BigInt.asUintN(64, BigInt.asIntN(srcBits, val));
          }
          await this.writeOperand(accessor, ctx, dst, insn, val);
          break;
        }
        case 'add':
        case 'sub':
        case 'and':
        case 'or':
        case 'xor': {
          const dst = x86.operands[0];
          const src = x86.operands[1];
          if (
            !dst ||
            !src ||
            dst.type !== x86_op_type.REG ||
            dst.reg === undefined
          )
            break;

          const size = dst.size || 8;
          const a = this.getRegValue(ctx, dst.reg, size);
          const b = await this.readOperand(accessor, ctx, src, insn, size);
          let result: bigint;
          switch (insn.mnemonic) {
            case 'add':
              result = a + b;
              break;
            case 'sub':
              result = a - b;
              break;
            case 'and':
              result = a & b;
              break;
            case 'or':
              result = a | b;
              break;
            default:
              result = a ^ b; // xor
              break;
          }
          this.setRegValue(ctx, dst.reg, result, size);
          break;
        }
        case 'inc':
        case 'dec':
        case 'not':
        case 'neg': {
          const dst = x86.operands[0];
          if (!dst || dst.type !== x86_op_type.REG || dst.reg === undefined)
            break;

          const size = dst.size || 8;
          const cur = this.getRegValue(ctx, dst.reg, size);
          let result: bigint;
          switch (insn.mnemonic) {
            case 'inc':
              result = cur + 1n;
              break;
            case 'dec':
              result = cur - 1n;
              break;
            case 'not':
              result = ~cur;
              break;
            default:
              result = -cur; // neg
              break;
          }
          this.setRegValue(ctx, dst.reg, result, size);
          break;
        }
        case 'lea': {
          const dst = x86.operands[0];
          const src = x86.operands[1];
          if (
            !dst ||
            !src ||
            dst.type !== x86_op_type.REG ||
            dst.reg === undefined ||
            src.type !== x86_op_type.MEM ||
            !src.mem
          )
            break;

          const addr = this.calcEffectiveAddr(
            ctx,
            src.mem,
            BigInt(insn.address),
            insn.size,
          );
          this.setRegValue(ctx, dst.reg, addr, dst.size || 8);
          break;
        }
        case 'nop':
        case 'cmp':
        case 'test':
          // No registers/memory are modified. EFLAGS aren't tracked by this
          // simulator, so these are safe no-ops for resuming past them.
          break;
        case 'jmp': {
          const op = x86.operands[0];
          if (!op) return;
          ctx.Rip = await this.readOperand(accessor, ctx, op, insn, 8);
          return; // Stop simulation as we've branched
        }
        case 'call': {
          const op = x86.operands[0];
          if (!op) return;
          const target = await this.readOperand(accessor, ctx, op, insn, 8);

          const retAddr = BigInt(insn.address) + BigInt(insn.size);
          const rsp = BigInt(ctx.Rsp as bigint) - 8n;
          ctx.Rsp = rsp;
          const buf = Buffer.alloc(8);
          buf.writeBigUInt64LE(retAddr);
          await nthread.write(new NativePointer(rsp), buf);

          ctx.Rip = target;
          return; // Stop simulation as we've branched
        }
        case 'ret': {
          const rsp = BigInt(ctx.Rsp as bigint);
          ctx.Rip = await this.readMemSized(accessor, rsp, 8);
          ctx.Rsp = rsp + 8n;
          return; // Stop simulation as we've branched
        }
        // ... more can be added if needed (conditional jumps need EFLAGS
        // tracking across the preceding instructions, which this simulator
        // does not do) ...
      }

      // If we've manually updated Rip (e.g. by a simulated branch), stop simulation
      if (BigInt(ctx.Rip) !== BigInt(insn.address)) {
        return;
      }
    }
  }

  /** Reads an operand's value, zero-extended to 64 bits. */
  private async readOperand(
    accessor: IndirectNThreadHostAccessor,
    ctx: Native.ThreadContext,
    op: X86Operand,
    insn: Instruction,
    sizeOverride?: number,
  ): Promise<bigint> {
    const size = sizeOverride || op.size || 8;
    if (op.type === x86_op_type.REG && op.reg !== undefined) {
      return this.getRegValue(ctx, op.reg, size);
    }
    if (op.type === x86_op_type.IMM && op.imm !== undefined) {
      return BigInt.asUintN(64, BigInt(op.imm as number | bigint));
    }
    if (op.type === x86_op_type.MEM && op.mem) {
      const addr = this.calcEffectiveAddr(
        ctx,
        op.mem,
        BigInt(insn.address),
        insn.size,
      );
      return this.readMemSized(accessor, addr, size);
    }
    return 0n;
  }

  /** Writes a value to a register or memory operand. */
  private async writeOperand(
    accessor: IndirectNThreadHostAccessor,
    ctx: Native.ThreadContext,
    op: X86Operand,
    insn: Instruction,
    val: bigint,
  ): Promise<void> {
    if (op.type === x86_op_type.REG && op.reg !== undefined) {
      this.setRegValue(ctx, op.reg, val, op.size || 8);
    } else if (op.type === x86_op_type.MEM && op.mem) {
      const addr = this.calcEffectiveAddr(
        ctx,
        op.mem,
        BigInt(insn.address),
        insn.size,
      );
      await this.writeMemSized(accessor, addr, op.size || 8, val);
    }
  }

  private async readMemSized(
    accessor: IndirectNThreadHostAccessor,
    addr: bigint,
    size: number,
  ): Promise<bigint> {
    const n = size === 1 || size === 2 || size === 4 ? size : 8;
    const buf = await accessor.nthread.read(addr, n);
    switch (n) {
      case 1:
        return BigInt(buf.readUInt8(0));
      case 2:
        return BigInt(buf.readUInt16LE(0));
      case 4:
        return BigInt(buf.readUInt32LE(0));
      default:
        return buf.readBigUInt64LE(0);
    }
  }

  private async writeMemSized(
    accessor: IndirectNThreadHostAccessor,
    addr: bigint,
    size: number,
    val: bigint,
  ): Promise<void> {
    const n = size === 1 || size === 2 || size === 4 ? size : 8;
    const buf = Buffer.alloc(n);
    switch (n) {
      case 1:
        buf.writeUInt8(Number(val & 0xffn), 0);
        break;
      case 2:
        buf.writeUInt16LE(Number(val & 0xffffn), 0);
        break;
      case 4:
        buf.writeUInt32LE(Number(val & 0xffffffffn), 0);
        break;
      default:
        buf.writeBigUInt64LE(BigInt.asUintN(64, val), 0);
        break;
    }
    await accessor.nthread.write(new NativePointer(addr), buf);
  }

  private getRegValue(
    ctx: Native.ThreadContext,
    reg: number,
    size = 8,
  ): bigint {
    const name = X86_REG_TO_CONTEXT_NAME[reg] as keyof Native.ThreadContext;
    if (!name) {
      log.warn(`Unsupported register: ${reg}`);
      return 0n;
    }
    const full = BigInt.asUintN(64, BigInt(ctx[name] as bigint));
    if (NHook.HIGH_BYTE_REGS.has(reg)) {
      return (full >> 8n) & 0xffn;
    }
    switch (size) {
      case 1:
        return full & 0xffn;
      case 2:
        return full & 0xffffn;
      case 4:
        return full & 0xffffffffn;
      default:
        return full;
    }
  }

  private setRegValue(
    ctx: Native.ThreadContext,
    reg: number,
    val: bigint,
    size = 8,
  ): void {
    const name = X86_REG_TO_CONTEXT_NAME[reg] as keyof Native.ThreadContext;
    if (!name) {
      log.warn(`Unsupported register: ${reg}`);
      return;
    }
    const record = ctx as unknown as Record<string, bigint>;
    const full = BigInt.asUintN(64, BigInt(record[name] ?? 0n));

    if (NHook.HIGH_BYTE_REGS.has(reg)) {
      record[name] = (full & ~0xff00n) | ((val & 0xffn) << 8n);
      return;
    }

    switch (size) {
      case 1:
        record[name] = (full & ~0xffn) | (val & 0xffn);
        break;
      case 2:
        record[name] = (full & ~0xffffn) | (val & 0xffffn);
        break;
      case 4:
        // 32-bit writes zero-extend and clear the upper 32 bits (x86-64 semantics)
        record[name] = val & 0xffffffffn;
        break;
      default:
        record[name] = BigInt.asUintN(64, val);
        break;
    }
  }

  private calcEffectiveAddr(
    ctx: Native.ThreadContext,
    mem: { base: number; index: number; scale: number; disp: number | bigint },
    insnAddr: bigint,
    insnSize: number,
  ): bigint {
    let addr = 0n;
    if (mem.base !== x86_reg.INVALID) {
      if (mem.base === x86_reg.RIP) {
        addr = insnAddr + BigInt(insnSize);
      } else {
        addr += this.getRegValue(ctx, mem.base);
      }
    }
    if (mem.index !== x86_reg.INVALID) {
      addr += this.getRegValue(ctx, mem.index) * BigInt(mem.scale);
    }
    addr += BigInt(mem.disp);
    return addr;
  }

  private async capture(
    threadId: number,
    hook: NHookInstance,
  ): Promise<NHookPoolResult | null> {
    try {
      // IndirectNThreadHostAccessor wires up the NThread + RedirectorHostAccessor
      // bootstrap cycle internally, then layers the full indirect (malloc/memset/
      // memcmp/file-transfer/marshalling) accessor on top of it.
      const memory = new IndirectNThreadHostAccessor(this.pid, threadId);

      await memory.init();
      const args = await threadGetArgs(memory, 0, hook.argCount);
      // id satisfies the base HookPoolResult shape (a hit-event id); threadId
      // covers both HookPoolResult.threadId and NHookPoolResult's own use of
      // the same name -- no separate field needed on NHookPoolResult anymore.
      return { id: threadId, hook, threadId, memory, args };
    } catch (err) {
      log.error(`Capture failed:`, err);
      return null;
    }
  }
}

async function threadGetArgs(
  accessor: IndirectNThreadHostAccessor,
  startIndex: number,
  count: number,
): Promise<bigint[]> {
  const { nthread } = accessor;
  const ctx = nthread.savedContext;
  const args: bigint[] = [];

  for (let i = startIndex; i < startIndex + count; i++) {
    if (i === 0) args.push(BigInt(ctx.Rcx));
    else if (i === 1) args.push(BigInt(ctx.Rdx));
    else if (i === 2) args.push(BigInt(ctx.R8));
    else if (i === 3) args.push(BigInt(ctx.R9));
    else {
      const addr = BigInt(ctx.Rsp) + 40n + BigInt(i - 4) * 8n;
      const buf = await nthread.read(addr, 8);
      args.push(buf.readBigUInt64LE(0));
    }
  }
  return args;
}

async function threadReturn(
  accessor: IndirectNThreadHostAccessor,
  returnValue: bigint,
): Promise<void> {
  const { nthread } = accessor;
  const ctx = nthread.savedContext;

  const retAddrBuf = await nthread.read(BigInt(ctx.Rsp), 8);
  const retAddr = retAddrBuf.readBigUInt64LE(0);

  ctx.Rax = returnValue;
  ctx.Rip = retAddr;
  ctx.Rsp = BigInt(ctx.Rsp) + 8n;

  nthread.setContext(ctx);
  nthread.applyContext();
}

async function threadJump(
  accessor: IndirectNThreadHostAccessor,
  target: bigint,
): Promise<void> {
  const { nthread } = accessor;
  const ctx = nthread.savedContext;

  ctx.Rip = target;

  nthread.setContext(ctx);
  nthread.applyContext();
}
