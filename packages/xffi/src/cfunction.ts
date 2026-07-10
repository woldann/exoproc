import {
  CFunction as BunCFunction,
  type FFITypeOrString,
  type Pointer,
} from 'bun:ffi';
import {
  type ISyncPointer,
  SyncNativePointer,
  type AddressLike,
} from './pointer.js';
import { resolveAddress } from './ffi.js';
import { mapToBunFFIType, type CTypeOrString, normalizeType } from './types.js';

/**
 * Interface representing a native function definition.
 */
export interface IFunction {
  readonly args?: readonly CTypeOrString[];
  readonly returns?: CTypeOrString;
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
  readonly ptr: Pointer;
}

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
  wrapper.address = nativePtr.address;
  wrapper.ptr = nativePtr.address;

  wrapper.toNumber = nativePtr.toNumber.bind(nativePtr);
  wrapper.toString = nativePtr.toString.bind(nativePtr);
  wrapper.isNull = nativePtr.isNull.bind(nativePtr);
  wrapper.valueOf = nativePtr.valueOf.bind(nativePtr);
  wrapper[Symbol.toPrimitive] = nativePtr[Symbol.toPrimitive].bind(nativePtr);

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
