import {
  CFunction as BunCFunction,
  type FFITypeOrString,
  type Pointer,
  JSCallback,
  ptr as bunPtr,
} from 'bun:ffi';
import {
  type ISyncPointer,
  SyncNativePointer,
  type AddressLike,
  localMemoryAccessor,
} from './pointer.js';
import { resolveAddress } from './ffi.js';
import { mapToBunFFIType, type CTypeOrString, normalizeType } from './types.js';
import { struct } from './struct.js';
import { cjitopen } from './cjit.js';
import { MemoryProtection } from './win/defines.js';

/**
 * Interface representing a native function definition.
 */
export interface IFunction {
  readonly args?: readonly CTypeOrString[];
  readonly returns?: CTypeOrString;
  readonly threadsafe?: boolean;
}

export const functionRegistry = new Map<
  bigint,
  { name: string; library: string }
>();

/**
 * Base wrapper for native functions.
 */
export interface CFunction extends ISyncPointer {
  (...args: any[]): any;
  readonly name?: string;
  readonly args: readonly CTypeOrString[];
  readonly returns: CTypeOrString;
  readonly threadsafe: boolean;
  readonly ptr: Pointer;
  callAsync(...args: any[]): Promise<any>;
  close(): void;
}

const convertVoid = () => undefined;
const convertBool = (val: any) => val !== 0n;
const convertNumber = (val: any) => Number(val);
const convertIdentity = (val: any) => val;

/**
 * Converts a raw register-width result (e.g. RAX) to the typed CCallResult
 * based on the function's declared return type.
 *
 * Used by any caller that receives a result as a raw bigint — e.g. thread redirection
 * accessors (NThread) or named-pipe callers. Mirrors the conversion that bun:ffi
 * performs for local calls.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseCallResult(raw: AddressLike, returns: CTypeOrString): any {
  const value = BigInt(resolveAddress(raw));
  const norm = normalizeType(returns);
  if (norm === 'void') return undefined;
  if (norm === 'bool') return value !== 0n;
  if (norm === 'i64' || norm === 'u64' || norm === 'usize' || norm === 'size_t')
    return value;
  // ptr, cstring, cwstring, and all numeric types → Number (consistent with bun:ffi)
  return Number(value);
}

// One struct class per argument signature (e.g. "GDF"), with a properly typed
// `arg0`/`arg1`/... field per position instead of a generic `void* args[255]`
// reinterpret-cast target. Shared between JS (writes the fields) and the
// per-signature JIT-compiled `ThreadPoolProc_*` (reads them back in C) via
// cjitopen's `structs` option, so there's exactly one definition of the layout.
const batchStructClassCache = new Map<string, any>();

function sigCharToType(char: string): 'f64' | 'f32' | 'u64' {
  if (char === 'D') return 'f64';
  if (char === 'F') return 'f32';
  return 'u64';
}

function getBatchStructClass(sig: string) {
  let clazz = batchStructClassCache.get(sig);
  if (!clazz) {
    const schema: Record<string, CTypeOrString> = {
      target_fn: 'ptr',
      js_callback: 'ptr',
      call_id: 'i32',
    };
    for (let i = 0; i < sig.length; i++) {
      schema[`arg${i}`] = sigCharToType(sig[i]!);
    }
    clazz = struct(schema as any);
    (clazz as any).structName = `BatchThreadData_${sig}`;
    batchStructClassCache.set(sig, clazz);
  }
  return clazz;
}

// Single shared trampoline for handing a pre-filled BatchThreadData_* buffer
// off to the OS thread pool. Signature-agnostic (just forwards two pointers),
// so it's compiled once and reused by every wrapped function's callAsync,
// rather than generating a dedicated setter per signature.
let queueWorkItemFn: DynamicCFunction | null = null;

function getQueueWorkItemFn(): DynamicCFunction {
  if (!queueWorkItemFn) {
    const lib = cjitopen({
      QueueWorkItemGeneric: {
        args: ['ptr', 'ptr'],
        // QueueUserWorkItem returns a BOOL (nonzero on success, 0 on
        // failure) -- propagate it instead of discarding it. A dropped
        // failure here left `pendingCalls` holding a promise nothing would
        // ever resolve/reject, since the work was never actually queued.
        returns: 'i32',
        source: `
          int QueueWorkItemGeneric(void* proc, void* data) {
            return QueueUserWorkItem((void*)proc, data, 0) ? 1 : 0;
          }
        `,
      },
    });
    queueWorkItemFn = lib.symbols.QueueWorkItemGeneric;
  }
  return queueWorkItemFn;
}

function normalizePointerArgForType(
  value: unknown,
  normalizedType: string,
): number | bigint {
  const resolved = resolveAddress(value);
  if (
    normalizedType === 'u64' ||
    normalizedType === 'usize' ||
    normalizedType === 'size_t'
  ) {
    return BigInt.asUintN(64, BigInt(resolved));
  }
  if (normalizedType === 'i64') {
    return BigInt(resolved);
  }
  return resolved;
}

function makeCallAsync(
  wrapperAddress: number,
  returnsNorm: string,
  cstringIndices: number[],
  cwstringIndices: number[],
  sig: string,
  normalizedArgTypes: string[],
) {
  let resultConverter: (val: any) => any;
  if (returnsNorm === 'void') {
    resultConverter = convertVoid;
  } else if (returnsNorm === 'bool') {
    resultConverter = convertBool;
  } else if (returnsNorm === 'f32' || returnsNorm === 'f64') {
    resultConverter = convertIdentity;
  } else if (
    returnsNorm === 'i8' ||
    returnsNorm === 'u8' ||
    returnsNorm === 'i16' ||
    returnsNorm === 'u16' ||
    returnsNorm === 'i32' ||
    returnsNorm === 'u32' ||
    returnsNorm === 'ptr' ||
    returnsNorm === 'cstring' ||
    returnsNorm === 'cwstring'
  ) {
    resultConverter = convertNumber;
  } else {
    resultConverter = convertIdentity;
  }

  const pendingCalls = new Map<
    number,
    {
      resolve: (val: any) => void;
      reject: (err: any) => void;
      keepAliveRefs: any[];
    }
  >();

  const isFloat = returnsNorm === 'f32' || returnsNorm === 'f64';
  const isDouble = returnsNorm === 'f64';
  const suffix = isFloat && !isDouble ? 'F' : isDouble ? 'D' : 'I';

  const StructClass = getBatchStructClass(sig);
  const procFn = getThreadPoolProc(sig, suffix);
  const procAddress = Number(procFn.ptr);
  const queueWorkItem = getQueueWorkItemFn();
  let nextCallId = 1;

  let callback: JSCallback | null = new JSCallback(
    isFloat
      ? (callId: number, floatVal: number) => {
          const pending = pendingCalls.get(callId);
          if (pending) {
            pendingCalls.delete(callId);
            pending.resolve(resultConverter(floatVal));
          }
        }
      : (callId: number, intVal: bigint) => {
          const pending = pendingCalls.get(callId);
          if (pending) {
            pendingCalls.delete(callId);
            pending.resolve(resultConverter(intVal));
          }
        },
    {
      args: isFloat ? ['i32', 'f64'] : ['i32', 'u64'],
      returns: 'void',
      threadsafe: true,
    },
  );

  // `target_fn`/`js_callback` never change for this wrapped function, so a
  // buffer for the *next* call can be allocated and pre-filled right away --
  // by the time a call actually comes in, only `call_id` and the args
  // themselves need writing, and malloc never happens on the call's hot path.
  // Must use the static `allocSync()` (native malloc via CrtImpl), not `new
  // StructClass()` directly -- the latter backs onto a JS-GC'd buffer, which
  // would race with/double-free against the native `free()` in
  // `ThreadPoolProc_*` once the queued work item completes.
  let nextBuf = StructClass.allocSync({
    target_fn: wrapperAddress,
    js_callback: callback.ptr,
  });

  const fn = function (...innerArgsList: any[]) {
    const normalizedArgs = [...innerArgsList];

    for (let i = 0; i < cstringIndices.length; i++) {
      const idx = cstringIndices[i];
      if (idx !== undefined && typeof normalizedArgs[idx] === 'string') {
        normalizedArgs[idx] = Buffer.from(normalizedArgs[idx] + '\0', 'utf8');
      }
    }
    for (let i = 0; i < cwstringIndices.length; i++) {
      const idx = cwstringIndices[i];
      if (idx !== undefined && typeof normalizedArgs[idx] === 'string') {
        normalizedArgs[idx] = Buffer.from(
          normalizedArgs[idx] + '\0',
          'utf16le',
        );
      }
    }

    const keepAliveRefs: any[] = [callback];
    for (let i = 0; i < normalizedArgs.length; i++) {
      const val = normalizedArgs[i];
      if (val && typeof val === 'object' && 'address' in (val as any)) {
        keepAliveRefs.push(val);
        normalizedArgs[i] = normalizePointerArgForType(
          (val as any).address,
          normalizedArgTypes[i] ?? 'ptr',
        );
      } else if (val && typeof val === 'object' && Buffer.isBuffer(val)) {
        keepAliveRefs.push(val);
        normalizedArgs[i] = Number(bunPtr(val));
      }
    }

    return new Promise((resolve, reject) => {
      const callId = nextCallId++;
      const buf = nextBuf;

      buf.call_id = callId;
      for (let i = 0; i < normalizedArgs.length; i++) {
        (buf as any)[`arg${i}`] = normalizedArgs[i];
      }

      pendingCalls.set(callId, {
        resolve,
        reject,
        keepAliveRefs,
      });

      // Hand this buffer to the thread pool, then immediately prepare a fresh
      // one for the *next* call -- `buf` may still be in flight on a worker
      // thread at this point, so it must never be touched again from here.
      const queued = queueWorkItem(procAddress, buf.address);

      if (!queued) {
        // QueueUserWorkItem failed to submit the work at all -- nothing will
        // ever invoke `js_callback` for this `callId`, so without this check
        // the promise above would hang forever instead of surfacing the
        // failure. `buf` is orphaned (the JIT'd ThreadPoolProc_* that would
        // normally `free(data)` never runs), so free it here instead.
        //
        // NOTE: this only catches the case where QueueUserWorkItem itself
        // refuses the work. It does NOT catch (and can't fix) the case
        // confirmed on real Windows where QueueUserWorkItem *succeeds* but
        // the dispatched worker thread's call into `js_callback` never
        // makes it back to JS at all -- see the "callAsync hangs on real
        // Windows" note in CLAUDE.md.
        pendingCalls.delete(callId);
        import('./win/msvcrt.js')
          .then(({ CrtImpl }) => CrtImpl.free(Number(buf.address)))
          .catch(() => {});
        reject(
          new Error(
            `QueueUserWorkItem failed to queue the native call (callId=${callId}).`,
          ),
        );
        return;
      }
      nextBuf = StructClass.allocSync({
        target_fn: wrapperAddress,
        js_callback: callback!.ptr,
      });
    });
  } as any;

  fn.close = function () {
    if (callback) {
      callback.close();
      callback = null;
    }
  };

  return fn;
}

export function createCFunction(
  address: AddressLike,
  sig: [CTypeOrString, CTypeOrString[]],
  callable?: CallableFunction,
  name?: string,
): CFunction {
  const nativePtr = new SyncNativePointer(address);
  const returns = sig[0] as FFITypeOrString;
  const args = sig[1] as FFITypeOrString[];

  let innerCallable: CallableFunction;
  if (callable) {
    innerCallable = callable;
  } else {
    innerCallable = BunCFunction({
      ptr: nativePtr.address,
      returns: mapToBunFFIType(sig[0]),
      args: sig[1].map(mapToBunFFIType) as FFITypeOrString[],
    });
  }

  const cstringIndices: number[] = [];
  const cwstringIndices: number[] = [];
  const normalizedArgTypes: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const norm = normalizeType(args[i]);
    normalizedArgTypes.push(norm);
    if (norm === 'cstring') {
      cstringIndices.push(i);
    } else if (norm === 'cwstring') {
      cwstringIndices.push(i);
    }
  }

  const argsLength = args.length;
  const sigStr = getCallSignature(args, argsLength);
  const returnsNorm = normalizeType(returns);

  const wrapper = function (...argsList: any[]) {
    if (argsList.length === args.length + 1) {
      const possibleAccessor = argsList[0];
      if (
        possibleAccessor &&
        typeof possibleAccessor === 'object' &&
        typeof possibleAccessor.read === 'function' &&
        typeof possibleAccessor.write === 'function'
      ) {
        if (typeof possibleAccessor.call === 'function') {
          return possibleAccessor.call(wrapper, ...argsList.slice(1));
        } else if (typeof possibleAccessor.callSync === 'function') {
          return possibleAccessor.callSync(wrapper, ...argsList.slice(1));
        }
      }
    }
    for (let i = 0; i < cstringIndices.length; i++) {
      const idx = cstringIndices[i];
      if (idx !== undefined && typeof argsList[idx] === 'string') {
        argsList[idx] = Buffer.from(argsList[idx] + '\0', 'utf8');
      }
    }
    for (let i = 0; i < cwstringIndices.length; i++) {
      const idx = cwstringIndices[i];
      if (idx !== undefined && typeof argsList[idx] === 'string') {
        argsList[idx] = Buffer.from(argsList[idx] + '\0', 'utf16le');
      }
    }
    for (let i = 0; i < argsList.length; i++) {
      const val = argsList[i];
      const normType = normalizedArgTypes[i] ?? 'ptr';
      if (val && typeof val === 'object' && 'address' in (val as any)) {
        argsList[i] = normalizePointerArgForType(
          (val as any).address,
          normType,
        );
      } else if (normType === 'ptr' && typeof val === 'bigint') {
        argsList[i] = Number(val);
      } else if (
        (normType === 'u64' || normType === 'usize' || normType === 'size_t') &&
        typeof val !== 'bigint'
      ) {
        argsList[i] = BigInt(resolveAddress(val));
      }
    }
    return innerCallable(...argsList);
  } as any;

  Object.setPrototypeOf(wrapper, SyncNativePointer.prototype);

  wrapper.args = args;
  wrapper.returns = returns;
  wrapper.threadsafe = false;
  wrapper.address = nativePtr.address;
  wrapper.ptr = nativePtr.address;

  wrapper.toNumber = nativePtr.toNumber.bind(nativePtr);
  wrapper.toString = nativePtr.toString.bind(nativePtr);
  wrapper.isNull = nativePtr.isNull.bind(nativePtr);
  wrapper.valueOf = nativePtr.valueOf.bind(nativePtr);
  wrapper[Symbol.toPrimitive] = nativePtr[Symbol.toPrimitive].bind(nativePtr);

  const lazyCallAsync = function (...argsList: any[]) {
    const realCallAsync = makeCallAsync(
      Number(nativePtr.address),
      returnsNorm,
      cstringIndices,
      cwstringIndices,
      sigStr,
      normalizedArgTypes,
    );
    wrapper.callAsync = realCallAsync;
    return realCallAsync(...argsList);
  };

  wrapper.callAsync = lazyCallAsync;
  wrapper.close = function () {
    if (typeof (wrapper.callAsync as any).close === 'function') {
      (wrapper.callAsync as any).close();
    }
    wrapper.callAsync = lazyCallAsync;
  };

  if (name !== undefined) {
    Object.defineProperty(wrapper, 'name', { value: name, configurable: true });
  }
  if (name) {
    const addr = BigInt(resolveAddress(address));
    functionRegistry.set(addr, { name, library: '' });
  }

  return wrapper;
}

export function createDynamicCFunction(
  address: AddressLike,
  sig: [CTypeOrString, CTypeOrString[]],
  size: number,
  bytes: Uint8Array | number[],
  callable?: CallableFunction,
): DynamicCFunction {
  const wrapper = createCFunction(address, sig, callable) as any;
  wrapper.size = size;
  wrapper.bytes = bytes;
  return wrapper;
}

export interface DynamicCFunction extends CFunction {
  readonly size: number;
  readonly bytes: Uint8Array | number[];
}

// -------------------------------------------------------------
// JIT Signature Batch Generation
// -------------------------------------------------------------

function generateCombos(minLen: number, maxLen: number): string[] {
  const combinations: string[] = [];
  function walk(current: string) {
    if (current.length >= minLen) combinations.push(current);
    if (current.length < maxLen) {
      if (current.length < 4) {
        walk(current + 'G');
        walk(current + 'D');
        walk(current + 'F');
      } else {
        walk(current + 'G');
      }
    }
  }
  walk('');
  return combinations;
}

function compileSignatures(combos: string[]): any {
  const symbols: Record<string, any> = {};
  const structClasses: Record<string, any> = {};

  for (const sig of combos) {
    const structClass = getBatchStructClass(sig);
    structClasses[structClass.structName] = structClass;

    const types = sig.split('').map((char) => {
      if (char === 'G') return 'unsigned long long';
      if (char === 'D') return 'double';
      return 'float';
    });
    const paramTypesStr = types.join(', ');
    const passArgsStr = sig
      .split('')
      .map((_char, i) => `data->arg${i}`)
      .join(', ');

    for (const suffix of ['I', 'F', 'D']) {
      const isFloat = suffix === 'F';
      const isDouble = suffix === 'D';
      const retType: string = isFloat
        ? 'float'
        : isDouble
          ? 'double'
          : 'unsigned long long';
      const callbackArg = isFloat || isDouble ? 'double' : 'unsigned long long';

      const procName = `ThreadPoolProc_${sig}_${suffix}`;

      symbols[procName] = {
        args: ['ptr'],
        returns: 'u32',
        source: `
          ${structClass.structName}* data = (${structClass.structName}*)arg0;
          typedef ${retType} (*TargetFn)(${paramTypesStr});
          TargetFn target = (TargetFn)data->target_fn;
          ${retType === 'void' ? 'target(' + passArgsStr + ');' : retType + ' res = target(' + passArgsStr + ');'}
          typedef void (*JSCallbackFn)(int, ${callbackArg});
          ((JSCallbackFn)data->js_callback)(data->call_id, (${callbackArg})${retType === 'void' ? '0' : 'res'});

          free(data); // Free the buffer JS allocated for this call
          return 0;
        `,
      };
    }
  }

  return cjitopen(symbols as any, { structs: [structClasses] });
}

// Functions with <=5 args are covered by one shared, eagerly-compiled pool
// spanning all G/D/F combinations of those slots (1+3+9+27+81+243=364
// signatures) -- the first 4 are register-passed under the Windows x64 ABI
// (RCX/XMM0 .. R9/XMM3) and the 5th is the most common single stack arg, so
// pre-baking every type combination up to 5 args means the vast majority of
// real callAsync() usage never needs a lazy per-signature compile at all.
let basePool: any = null;

// Beyond 5 args, the combination space (3^N) grows too large to
// pre-enumerate, and previously this signature generation didn't even try,
// just forcing every position past the 4th to 'G' (see getCallSignature),
// which silently mis-typed the struct field for any float/double argument in
// that range. Instead, compile exactly the one full signature a real
// function actually needs (every position's true type), cached by that
// exact string, the first time it's used.
const exactSigPools = new Map<string, any>();

function getThreadPoolForSig(sig: string): any {
  if (sig.length <= 4) {
    if (!basePool) {
      const combos = generateCombos(0, 4);
      basePool = compileSignatures(combos);
    }
    return basePool;
  }

  let lib = exactSigPools.get(sig);
  if (!lib) {
    lib = compileSignatures([sig]);
    exactSigPools.set(sig, lib);
  }
  return lib;
}

function getThreadPoolProc(sig: string, suffix: string): DynamicCFunction {
  const procName = `ThreadPoolProc_${sig}_${suffix}`;
  return getThreadPoolForSig(sig).symbols[procName];
}

function getCallSignature(
  argTypes: readonly CTypeOrString[] | undefined,
  argCount: number,
): string {
  let sig = '';
  const types = argTypes || [];
  for (let i = 0; i < argCount; i++) {
    const norm = types[i] ? normalizeType(types[i]) : 'i64';
    if (norm === 'f32') sig += 'F';
    else if (norm === 'f64') sig += 'D';
    else sig += 'G';
  }
  return sig;
}

export interface NativeFunction extends DynamicCFunction {
  toAddress(): bigint;
}

class NativeFunctionGenerator {
  private page: bigint | null = null;
  private offset = 0;
  private capacity = 65536;

  addBytes(
    def: Record<string, [CTypeOrString, CTypeOrString[]]>,
    bytes: number[] | Uint8Array,
  ): NativeFunction {
    const name = Object.keys(def)[0];
    const sig = Object.values(def)[0];
    if (!name || !sig) throw new Error('Invalid function definition');

    const byteData =
      bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const alignedSize = Math.ceil(byteData.length / 16) * 16;

    if (!this.page) {
      this.page = BigInt(
        localMemoryAccessor.allocSync(
          this.capacity,
          null,
          MemoryProtection.EXECUTE_READWRITE,
        ),
      );
    }

    if (this.offset + alignedSize > this.capacity) {
      throw new Error('Out of executable memory space');
    }

    const funcAddr = this.page + BigInt(this.offset);
    const buf = Buffer.from(byteData);
    localMemoryAccessor.writeSync(Number(funcAddr), buf);
    this.offset += alignedSize;

    const wrapper = createDynamicCFunction(
      funcAddr,
      sig,
      byteData.length,
      byteData,
    ) as any;

    wrapper.toAddress = function () {
      return funcAddr;
    };

    return wrapper as NativeFunction;
  }

  compile(
    def: Record<string, [CTypeOrString, CTypeOrString[]]>,
    source: string,
  ): NativeFunction {
    const name = Object.keys(def)[0];
    const sig = Object.values(def)[0];
    if (!name || !sig) throw new Error('Invalid function definition');

    const jit = cjitopen({
      [name]: {
        args: sig[1],
        returns: sig[0],
        source: source,
      },
    });

    const sym = (jit.symbols as any)[name] as any;
    sym.toAddress = function () {
      return BigInt(resolveAddress(sym.ptr));
    };
    return sym as NativeFunction;
  }
}

export const nativeFn = new NativeFunctionGenerator();

export let defaultAsyncCallOverheadMs = 3;
export let asyncCallOverheadMs = defaultAsyncCallOverheadMs;
export let defaultCalibrateIterations = 3;

export function setAsyncCallOverheadMs(value: number): void {
  asyncCallOverheadMs = value;
}

export function setDefaultAsyncCallOverheadMs(value: number): void {
  defaultAsyncCallOverheadMs = value;
}

export function setDefaultCalibrateIterations(value: number): void {
  defaultCalibrateIterations = value;
}

export async function calibrateAsyncOverhead(
  iterations: number = defaultCalibrateIterations,
): Promise<number> {
  try {
    const { Kernel32Impl } = await import('./win/kernel32.js');
    const Sleep = Kernel32Impl.Sleep;

    // Warm up the callAsync signature for Sleep
    Sleep(0);
    await Sleep.callAsync(0);

    // Measure synchronous Sleep(0) duration
    const startSync = performance.now();
    Sleep(0);
    const durationSync = performance.now() - startSync;

    // Measure parallel async calls, calculating each one's duration individually
    let totalAsync = 0;
    const runAsyncCall = async () => {
      const start = performance.now();
      await Sleep.callAsync(0);
      totalAsync += performance.now() - start;
    };

    const promises: Promise<void>[] = [];
    for (let i = 0; i < iterations; i++) {
      promises.push(runAsyncCall());
    }
    await Promise.all(promises);

    const avgAsync = totalAsync / iterations;
    const overhead = Math.max(0, avgAsync - durationSync);

    asyncCallOverheadMs = Math.ceil(overhead);
    asyncCallOverheadMs = Math.min(10, Math.max(1, asyncCallOverheadMs));
    return asyncCallOverheadMs;
  } catch (e) {
    asyncCallOverheadMs = defaultAsyncCallOverheadMs;
    return asyncCallOverheadMs;
  }
}
