import {
  getWin32DllFileName,
  Win32Api,
  type Win32FunctionReference,
} from '@exoproc/win32-abi';
import type {
  Win32CompiledProgram,
  Win32ProgramCodeExport,
  Win32ProgramDataSection,
  Win32ProgramDataSymbol,
  Win32ProgramRelocation,
  Win32ProgramRelocationTarget,
} from '../runtime/programs.js';

export type X64Register64 =
  | 'rax'
  | 'rcx'
  | 'rdx'
  | 'rbx'
  | 'rsp'
  | 'rbp'
  | 'rsi'
  | 'rdi'
  | 'r8'
  | 'r9'
  | 'r10'
  | 'r11'
  | 'r12'
  | 'r13'
  | 'r14'
  | 'r15';

export type X64Register32 =
  | 'eax'
  | 'ecx'
  | 'edx'
  | 'ebx'
  | 'esp'
  | 'ebp'
  | 'esi'
  | 'edi'
  | 'r8d'
  | 'r9d'
  | 'r10d'
  | 'r11d'
  | 'r12d'
  | 'r13d'
  | 'r14d'
  | 'r15d';

export type X64Register = X64Register64 | X64Register32;
export type X64Immediate = number | bigint;

export interface X64MemoryOperand {
  readonly kind: 'memory';
  readonly width: 32 | 64;
  readonly base: X64Register64;
  readonly displacement: number;
}

export interface X64ByteMemoryOperand {
  readonly kind: 'memory';
  readonly width: 8;
  readonly base: X64Register64;
  readonly displacement: number;
}

export interface X64WordMemoryOperand {
  readonly kind: 'memory';
  readonly width: 16;
  readonly base: X64Register64;
  readonly displacement: number;
}

export interface X64Label {
  readonly name: string;
  readonly assemblerId: symbol;
}

const REGISTER_INFO: Readonly<
  Record<X64Register, { readonly code: number; readonly width: 32 | 64 }>
> = {
  rax: { code: 0, width: 64 },
  rcx: { code: 1, width: 64 },
  rdx: { code: 2, width: 64 },
  rbx: { code: 3, width: 64 },
  rsp: { code: 4, width: 64 },
  rbp: { code: 5, width: 64 },
  rsi: { code: 6, width: 64 },
  rdi: { code: 7, width: 64 },
  r8: { code: 8, width: 64 },
  r9: { code: 9, width: 64 },
  r10: { code: 10, width: 64 },
  r11: { code: 11, width: 64 },
  r12: { code: 12, width: 64 },
  r13: { code: 13, width: 64 },
  r14: { code: 14, width: 64 },
  r15: { code: 15, width: 64 },
  eax: { code: 0, width: 32 },
  ecx: { code: 1, width: 32 },
  edx: { code: 2, width: 32 },
  ebx: { code: 3, width: 32 },
  esp: { code: 4, width: 32 },
  ebp: { code: 5, width: 32 },
  esi: { code: 6, width: 32 },
  edi: { code: 7, width: 32 },
  r8d: { code: 8, width: 32 },
  r9d: { code: 9, width: 32 },
  r10d: { code: 10, width: 32 },
  r11d: { code: 11, width: 32 },
  r12d: { code: 12, width: 32 },
  r13d: { code: 13, width: 32 },
  r14d: { code: 14, width: 32 },
  r15d: { code: 15, width: 32 },
};

export function dword(base: X64Register64, displacement = 0): X64MemoryOperand {
  return { kind: 'memory', width: 32, base, displacement };
}

export function qword(base: X64Register64, displacement = 0): X64MemoryOperand {
  return { kind: 'memory', width: 64, base, displacement };
}

export function byte(
  base: X64Register64,
  displacement = 0,
): X64ByteMemoryOperand {
  return { kind: 'memory', width: 8, base, displacement };
}

export function word(
  base: X64Register64,
  displacement = 0,
): X64WordMemoryOperand {
  return { kind: 'memory', width: 16, base, displacement };
}

function isRegister(value: unknown): value is X64Register {
  return typeof value === 'string' && value in REGISTER_INFO;
}

function isMemory(value: unknown): value is X64MemoryOperand {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'memory'
  );
}

function operandWidth(operand: X64Register | X64MemoryOperand): 32 | 64 {
  return isRegister(operand) ? REGISTER_INFO[operand].width : operand.width;
}

function encodeDword(value: X64Immediate): number[] {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(
    0,
    Number(BigInt.asUintN(32, BigInt(value))),
    true,
  );
  return [...bytes];
}

function assertSameWidth(
  destination: X64Register | X64MemoryOperand,
  source: X64Register | X64MemoryOperand,
): 32 | 64 {
  const destinationWidth = operandWidth(destination);
  const sourceWidth = operandWidth(source);
  if (destinationWidth !== sourceWidth) {
    throw new Error(
      `x64 operand width mismatch: ${destinationWidth} and ${sourceWidth}`,
    );
  }
  return destinationWidth;
}

/**
 * Typed assembler for the x64 subset understood by the simulator.
 *
 * Guest programs express instructions and operands here. Opcode bytes remain
 * an implementation detail of this class.
 */
export class X64Assembler {
  private readonly assemblerId = Symbol('X64Assembler');
  private readonly bytes: number[] = [];
  private readonly labels = new Map<X64Label, number>();
  private readonly labelNames = new Set<string>();
  private readonly relativeFixups: Array<{
    readonly displacementOffset: number;
    readonly displacementSize: 1 | 4;
    readonly label: X64Label;
  }> = [];
  public readonly relocations: Win32ProgramRelocation[] = [];

  public mov(
    destination: X64Register | X64MemoryOperand,
    source: X64Register | X64MemoryOperand | X64Immediate,
  ): void {
    if (typeof source === 'number' || typeof source === 'bigint') {
      this.movImmediate(destination, source);
      return;
    }
    if (isMemory(destination) && isMemory(source)) {
      throw new Error('x64 mov does not support memory-to-memory operands');
    }

    const width = assertSameWidth(destination, source);
    if (isRegister(destination)) {
      this.emitModRM(0x8b, width, REGISTER_INFO[destination].code, source);
      return;
    }
    if (!isRegister(source)) {
      throw new Error('x64 mov source must be a register');
    }
    this.emitModRM(0x89, width, REGISTER_INFO[source].code, destination);
  }

  public movzx(destination: X64Register32, source: X64ByteMemoryOperand): void {
    this.emitModRM([0x0f, 0xb6], 32, REGISTER_INFO[destination].code, source);
  }

  public movzxWord(
    destination: X64Register32,
    source: X64WordMemoryOperand,
  ): void {
    this.emitModRM([0x0f, 0xb7], 32, REGISTER_INFO[destination].code, source);
  }

  /** `mov r/m8, r8` -- writes the low 8 bits of `source` to a byte-sized
   * memory operand. There is no matching register-destination overload
   * (nothing in this compiler's codegen needs one): every caller stores an
   * already-computed byte value from a GPR into memory (a `char*`/`u8*`
   * write, or a narrow struct field). */
  public movByteToMemory(
    destination: X64ByteMemoryOperand,
    source: X64Register64,
  ): void {
    this.emitModRM(0x88, 32, REGISTER_INFO[source].code, destination);
  }

  public lea(destination: X64Register64, source: X64MemoryOperand): void {
    this.emitModRM(0x8d, 64, REGISTER_INFO[destination].code, source);
  }

  public movAddress(
    destination: X64Register64,
    target: Win32ProgramRelocationTarget,
  ): void {
    const register = REGISTER_INFO[destination];
    this.emitRex(true, undefined, register.code);
    this.write(0xb8 + (register.code & 7));
    const offset = this.bytes.length;
    this.write(0, 0, 0, 0, 0, 0, 0, 0);
    this.relocations.push({
      offset,
      encoding: 'absolute64',
      target,
    });
  }

  public add(
    destination: X64Register | X64MemoryOperand,
    source: X64Register | X64Immediate,
  ): void {
    this.binary(0x01, 0, destination, source);
  }

  public sub(
    destination: X64Register | X64MemoryOperand,
    source: X64Register | X64Immediate,
  ): void {
    this.binary(0x29, 5, destination, source);
  }

  public cmp(
    destination: X64Register | X64MemoryOperand,
    source: X64Register | X64Immediate,
  ): void {
    this.binary(0x39, 7, destination, source);
  }

  public and(
    destination: X64Register | X64MemoryOperand,
    source: X64Register,
  ): void {
    this.registerBinary(0x21, destination, source);
  }

  public or(
    destination: X64Register | X64MemoryOperand,
    source: X64Register,
  ): void {
    this.registerBinary(0x09, destination, source);
  }

  public xor(
    destination: X64Register | X64MemoryOperand,
    source: X64Register,
  ): void {
    this.registerBinary(0x31, destination, source);
  }

  public test(
    destination: X64Register | X64MemoryOperand,
    source: X64Register,
  ): void {
    this.registerBinary(0x85, destination, source);
  }

  public neg(destination: X64Register | X64MemoryOperand): void {
    this.emitModRM(0xf7, operandWidth(destination), 3, destination);
  }

  public mul(source: X64Register | X64MemoryOperand): void {
    this.emitModRM(0xf7, operandWidth(source), 4, source);
  }

  public div(source: X64Register | X64MemoryOperand): void {
    this.emitModRM(0xf7, operandWidth(source), 6, source);
  }

  public push(value: X64Register64 | number): void {
    if (typeof value === 'number') {
      if (value >= -128 && value <= 127) {
        this.write(0x6a, value & 0xff);
      } else {
        this.write(0x68, ...encodeDword(value));
      }
      return;
    }
    const register = REGISTER_INFO[value];
    this.emitRex(false, undefined, register.code);
    this.write(0x50 + (register.code & 7));
  }

  public pop(destination: X64Register64): void {
    const register = REGISTER_INFO[destination];
    this.emitRex(false, undefined, register.code);
    this.write(0x58 + (register.code & 7));
  }

  public createLabel(name: string): X64Label {
    if (this.labelNames.has(name)) {
      throw new Error(`Duplicate x64 label: ${name}`);
    }
    this.labelNames.add(name);
    return Object.freeze({ name, assemblerId: this.assemblerId });
  }

  public bind(label: X64Label): void {
    this.assertOwnLabel(label);
    if (this.labels.has(label)) {
      throw new Error(`x64 label is already bound: ${label.name}`);
    }
    this.labels.set(label, this.bytes.length);
  }

  public call(target: X64Label | Win32FunctionReference): void {
    if ('dll' in target) {
      this.write(0xff, 0x15); // call qword [rip + disp32]
      const offset = this.bytes.length;
      this.write(0, 0, 0, 0);
      this.relocations.push({
        offset,
        encoding: 'iat-relative32',
        target: {
          kind: 'export',
          dllName: getWin32DllFileName(target.dll),
          functionName: target.name,
        },
      });
      return;
    }

    this.assertOwnLabel(target);
    this.write(0xe8, 0, 0, 0, 0);
    this.relativeFixups.push({
      displacementOffset: this.bytes.length - 4,
      displacementSize: 4,
      label: target,
    });
  }

  public callRegister(registerName: X64Register64): void {
    const register = REGISTER_INFO[registerName];
    this.emitRex(false, undefined, register.code);
    this.write(0xff, 0xc0 | (2 << 3) | (register.code & 7));
  }

  public jmp(label: X64Label): void {
    this.assertOwnLabel(label);
    this.write(0xe9, 0, 0, 0, 0);
    this.relativeFixups.push({
      displacementOffset: this.bytes.length - 4,
      displacementSize: 4,
      label,
    });
  }

  public jmpShort(label: X64Label): void {
    this.relativeJump(0xeb, label);
  }

  public je(label: X64Label): void {
    this.conditionalJump(0x84, label);
  }

  public jeShort(label: X64Label): void {
    this.relativeJump(0x74, label);
  }

  public jne(label: X64Label): void {
    this.conditionalJump(0x85, label);
  }

  public jneShort(label: X64Label): void {
    this.relativeJump(0x75, label);
  }

  /** Unsigned "below" (CF=1) -- `a < b` for unsigned/pointer comparisons. */
  public jb(label: X64Label): void {
    this.conditionalJump(0x82, label);
  }

  /** Unsigned "below or equal" (CF=1 or ZF=1) -- `a <= b` unsigned. */
  public jbe(label: X64Label): void {
    this.conditionalJump(0x86, label);
  }

  /** Unsigned "above" (CF=0 and ZF=0) -- `a > b` unsigned. */
  public ja(label: X64Label): void {
    this.conditionalJump(0x87, label);
  }

  /** Unsigned "above or equal" (CF=0) -- `a >= b` unsigned. */
  public jae(label: X64Label): void {
    this.conditionalJump(0x83, label);
  }

  public ret(): void {
    this.write(0xc3);
  }

  /**
   * `syscall` -- the x86_64 `syscall` instruction (0F 05). Used by
   * guest programs that need to call a host-bridge dynamic syscall
   * id (see `runtime/node-host-bridge.ts` for the only current
   * consumer). The id is expected to already be in EAX (the
   * standard `mov eax, imm32; syscall` shape).
   */
  public syscall(): void {
    this.write(0x0f, 0x05);
  }

  /** Bytes emitted so far. Callers that need the address of a not-yet-bound
   * instruction (e.g. a codegen loop recording one export per emitted
   * function, without needing an internal jump target) can snapshot this
   * immediately before emitting that instruction. */
  public get length(): number {
    return this.bytes.length;
  }

  public finish(): Uint8Array {
    for (const fixup of this.relativeFixups) {
      const target = this.labels.get(fixup.label);
      if (target === undefined) {
        throw new Error(`Missing x64 label: ${fixup.label.name}`);
      }
      const next = fixup.displacementOffset + fixup.displacementSize;
      const displacement = target - next;
      if (fixup.displacementSize === 1) {
        if (displacement < -128 || displacement > 127) {
          throw new Error(
            `x64 rel8 jump to ${fixup.label.name} is out of range`,
          );
        }
        this.bytes[fixup.displacementOffset] = displacement & 0xff;
      } else {
        const value = displacement >>> 0;
        for (let index = 0; index < 4; index += 1) {
          this.bytes[fixup.displacementOffset + index] =
            (value >>> (index * 8)) & 0xff;
        }
      }
    }
    return Uint8Array.from(this.bytes);
  }

  private write(...bytes: number[]): void {
    this.bytes.push(...bytes);
  }

  private conditionalJump(
    opcode: 0x82 | 0x83 | 0x84 | 0x85 | 0x86 | 0x87,
    label: X64Label,
  ): void {
    this.assertOwnLabel(label);
    this.write(0x0f, opcode, 0, 0, 0, 0);
    this.relativeFixups.push({
      displacementOffset: this.bytes.length - 4,
      displacementSize: 4,
      label,
    });
  }

  private relativeJump(opcode: 0x74 | 0x75 | 0xeb, label: X64Label): void {
    this.assertOwnLabel(label);
    this.write(opcode, 0);
    this.relativeFixups.push({
      displacementOffset: this.bytes.length - 1,
      displacementSize: 1,
      label,
    });
  }

  private assertOwnLabel(label: X64Label): void {
    if (label.assemblerId !== this.assemblerId) {
      throw new Error(
        `x64 label "${label.name}" belongs to a different assembler`,
      );
    }
  }

  private movImmediate(
    destination: X64Register | X64MemoryOperand,
    value: X64Immediate,
  ): void {
    const width = operandWidth(destination);
    if (isRegister(destination)) {
      const register = REGISTER_INFO[destination];
      this.emitRex(width === 64, undefined, register.code);
      this.write(0xb8 + (register.code & 7));
      this.write(
        ...(width === 64 ? encodeQword(BigInt(value)) : encodeDword(value)),
      );
      return;
    }
    this.emitModRM(0xc7, width, 0, destination);
    this.write(...encodeDword(value));
  }

  private binary(
    registerOpcode: number,
    immediateExtension: number,
    destination: X64Register | X64MemoryOperand,
    source: X64Register | X64Immediate,
  ): void {
    if (isRegister(source)) {
      this.registerBinary(registerOpcode, destination, source);
      return;
    }
    const immediate = BigInt(source);
    const useByte = immediate >= -128n && immediate <= 127n;
    this.emitModRM(
      useByte ? 0x83 : 0x81,
      operandWidth(destination),
      immediateExtension,
      destination,
    );
    this.write(
      ...(useByte ? [Number(immediate & 0xffn)] : encodeDword(immediate)),
    );
  }

  private registerBinary(
    opcode: number,
    destination: X64Register | X64MemoryOperand,
    source: X64Register,
  ): void {
    const width = assertSameWidth(destination, source);
    this.emitModRM(opcode, width, REGISTER_INFO[source].code, destination);
  }

  private emitModRM(
    opcode: number | readonly number[],
    width: 32 | 64,
    registerField: number,
    rm:
      | X64Register
      | X64MemoryOperand
      | X64ByteMemoryOperand
      | X64WordMemoryOperand,
  ): void {
    const rmCode = isRegister(rm)
      ? REGISTER_INFO[rm].code
      : REGISTER_INFO[rm.base].code;
    this.emitRex(width === 64, registerField, rmCode);
    this.write(...(typeof opcode === 'number' ? [opcode] : opcode));

    if (isRegister(rm)) {
      this.write(0xc0 | ((registerField & 7) << 3) | (rmCode & 7));
      return;
    }

    const base = rmCode & 7;
    const displacement = rm.displacement;
    const requiresDisplacement = base === 5 && displacement === 0;
    const mod =
      displacement === 0 && !requiresDisplacement
        ? 0
        : displacement >= -128 && displacement <= 127
          ? 1
          : 2;
    const encodedBase = base === 4 ? 4 : base;
    this.write((mod << 6) | ((registerField & 7) << 3) | encodedBase);
    if (base === 4) {
      this.write(0x24);
    }
    if (mod === 1) {
      this.write(displacement & 0xff);
    } else if (mod === 2) {
      this.write(...encodeDword(displacement));
    }
  }

  private emitRex(
    width64: boolean,
    registerField?: number,
    rmCode?: number,
  ): void {
    const rex =
      0x40 |
      (width64 ? 0x08 : 0) |
      ((registerField ?? 0) >= 8 ? 0x04 : 0) |
      ((rmCode ?? 0) >= 8 ? 0x01 : 0);
    if (rex !== 0x40) {
      this.write(rex);
    }
  }
}

function encodeQword(value: bigint): number[] {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt.asUintN(64, value), true);
  return [...bytes];
}

export class Win32ProgramBuilder {
  public readonly code = new X64Assembler();
  private readonly dataBytes: number[] = [];
  private readonly offsets = new Map<string, number>();
  private readonly dataSymbols: Win32ProgramDataSymbol[] = [];

  public text(name: string, value: string, nul = true): number {
    return this.appendData(
      name,
      new TextEncoder().encode(nul ? `${value}\0` : value),
      '.rdata',
    );
  }

  public buffer(name: string, size: number): number {
    return this.appendData(name, new Uint8Array(size), '.bss');
  }

  public data(name: string, bytes: Uint8Array): number {
    return this.appendData(name, bytes, '.data');
  }

  private appendData(
    name: string,
    bytes: Uint8Array,
    section: Win32ProgramDataSection,
  ): number {
    if (this.offsets.has(name)) {
      throw new Error(`Duplicate program data symbol: ${name}`);
    }
    const offset = this.dataBytes.length;
    this.offsets.set(name, offset);
    this.dataBytes.push(...bytes);
    this.dataSymbols.push({
      name,
      section,
      offset,
      length: bytes.length,
    });
    return offset;
  }

  public dataAddress(destination: X64Register64, name: string): void {
    this.offset(name);
    this.code.movAddress(destination, {
      kind: 'data',
      symbol: name,
    });
  }

  public invoke(reference: Win32FunctionReference): void {
    this.code.sub('rsp', 0x20);
    this.code.call(reference);
    this.code.add('rsp', 0x20);
  }

  public movR8(value: number): void {
    this.code.mov('r8', value);
  }

  public emitWriteSymbol(name: string): void {
    this.dataAddress('rdx', name);
    this.emitWriteRegisters();
  }

  public emitWriteRegisters(): void {
    const format = '__exoproc_printf_string_format';
    if (!this.offsets.has(format)) {
      this.text(format, '%s');
    }
    this.dataAddress('rcx', format);
    this.invoke(Win32Api.msvcrt.printf);
  }

  public emitPrintfSymbol(name: string): void {
    this.dataAddress('rcx', name);
    this.invoke(Win32Api.msvcrt.printf);
  }

  public finish(
    name: string,
    codeExports?: readonly Win32ProgramCodeExport[],
  ): Win32CompiledProgram {
    const sectionOrder: readonly Win32ProgramDataSection[] = [
      '.rdata',
      '.data',
      '.bss',
    ];
    const dataBytes: number[] = [];
    const dataSymbols: Win32ProgramDataSymbol[] = [];
    for (const section of sectionOrder) {
      for (const symbol of this.dataSymbols) {
        if (symbol.section !== section) continue;
        const offset = dataBytes.length;
        dataBytes.push(
          ...this.dataBytes.slice(symbol.offset, symbol.offset + symbol.length),
        );
        dataSymbols.push({
          ...symbol,
          offset,
        });
      }
    }

    return {
      name,
      code: this.code.finish(),
      data: Uint8Array.from(dataBytes),
      dataSymbols,
      entryOffset: 0,
      relocations: this.code.relocations,
      ...(codeExports ? { codeExports } : {}),
    };
  }

  private offset(name: string): number {
    const value = this.offsets.get(name);
    if (value === undefined) {
      throw new Error(`Missing program data symbol: ${name}`);
    }
    return value;
  }
}

export function createConsoleProgramBuilder(): Win32ProgramBuilder {
  return new Win32ProgramBuilder();
}

/**
 * Compiles a small program which writes a fixed string to its inherited
 * standard output handle and exits.
 */
export function compileConsoleProgram(
  name: string,
  output: string,
  exitCode = 0,
): Win32CompiledProgram {
  const program = new Win32ProgramBuilder();
  const { code } = program;
  program.text('output', output);
  program.emitWriteSymbol('output');
  code.mov('eax', exitCode);
  code.ret();

  return program.finish(name);
}

/**
 * Compatibility surface for callers which previously used the runtime class.
 */
export class Win32GuestProgramCompiler {
  public static console = compileConsoleProgram;
}
