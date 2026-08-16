import {
  MemoryFreeType,
  MemoryProtection,
  normalizeType,
  resolveAddress,
  type CMachineCode,
  type CTypeOrString,
  type ICallableMemoryAccessor,
} from 'bun-xffi';
import { CALL_REGISTER_SLOTS } from './abi.js';
import { createCallThunk } from './call-bytes.js';
import {
  createCaptureAdapterThunk,
  createCaptureArgsThunk,
} from './capture-args.js';
import { installMachineCode } from './registry.js';
import type {
  AllocateCallPayloadOptions,
  AllocatedCallPayload,
  InstallCallThunkOptions,
  InstallCaptureArgsThunkOptions,
  InstallCaptureHookThunkOptions,
  InstalledCallThunk,
  InstalledCaptureArgsThunk,
  InstalledCaptureHookThunk,
  ThunkSignature,
} from './types.js';

const PACKED_CALL_HEADER_SIZE = 24;

/** Packs values into the call dispatcher's flat, eight-byte-per-slot format. */
export function packCallArgs(
  values: readonly (number | bigint)[],
  types: readonly CTypeOrString[],
): Buffer {
  if (values.length !== types.length) {
    throw new RangeError(
      `values/types length mismatch: ${values.length} values for ${types.length} types`,
    );
  }

  const slotCount = Math.max(values.length, CALL_REGISTER_SLOTS);
  const buffer = Buffer.alloc(slotCount * 8);
  for (let i = 0; i < values.length; i++) {
    const declaredType = types[i];
    const value = values[i];
    if (declaredType === undefined || value === undefined) {
      throw new RangeError(`missing value or type at argument slot ${i}`);
    }
    const type = normalizeType(declaredType);
    if (type === 'f32') buffer.writeFloatLE(Number(value), i * 8);
    else if (type === 'f64') buffer.writeDoubleLE(Number(value), i * 8);
    else {
      buffer.writeBigUInt64LE(BigInt.asUintN(64, BigInt(value)), i * 8);
    }
  }
  return buffer;
}

function createPayloadHandle(
  accessor: ICallableMemoryAccessor,
  address: number,
  byteLength: number,
  callArgs: readonly (number | bigint)[],
): AllocatedCallPayload {
  let disposed = false;
  let disposal: Promise<void> | undefined;
  return {
    address,
    byteLength,
    callArgs,
    get isDisposed(): boolean {
      return disposed;
    },
    dispose(): Promise<void> {
      if (disposed) return Promise.resolve();
      if (disposal) return disposal;

      disposal = (async () => {
        const freed = await accessor.free(address, 0, MemoryFreeType.RELEASE);
        if (!freed) {
          throw new Error(
            `Failed to free call payload at 0x${address.toString(16)}`,
          );
        }
        disposed = true;
      })().catch((error: unknown) => {
        disposal = undefined;
        throw error;
      });
      return disposal;
    },
  };
}

async function allocatePayload(
  accessor: ICallableMemoryAccessor,
  bytes: Buffer,
  callArgsForAddress: (address: number) => readonly (number | bigint)[],
): Promise<AllocatedCallPayload> {
  const address = Number(
    resolveAddress(
      await accessor.alloc(bytes.length, null, MemoryProtection.READWRITE),
    ),
  );

  try {
    await accessor.write(address, bytes);
  } catch (error) {
    await accessor.free(address, 0, MemoryFreeType.RELEASE);
    throw error;
  }

  return createPayloadHandle(
    accessor,
    address,
    bytes.length,
    callArgsForAddress(address),
  );
}

function requireTarget(
  mode: 'dynamic' | 'packed',
  target: AllocateCallPayloadOptions['target'],
): number {
  if (target === undefined) {
    throw new TypeError(`${mode} call payloads require a target address`);
  }
  return Number(resolveAddress(target));
}

async function allocateForInstalledCall(
  accessor: ICallableMemoryAccessor,
  mode: InstalledCallThunk['mode'],
  signature: ThunkSignature,
  options: AllocateCallPayloadOptions,
): Promise<AllocatedCallPayload> {
  const args = packCallArgs(options.values, signature.args);

  if (mode === 'bound') {
    if (options.target !== undefined) {
      throw new TypeError('bound call payloads must not provide a target');
    }
    return allocatePayload(accessor, args, (address) => [address]);
  }

  const target = requireTarget(mode, options.target);
  if (mode === 'dynamic') {
    return allocatePayload(accessor, args, (address) => [
      target,
      BigInt(signature.args.length),
      address,
    ]);
  }

  const totalLength = PACKED_CALL_HEADER_SIZE + args.length;
  const allocationAddress = Number(
    resolveAddress(
      await accessor.alloc(totalLength, null, MemoryProtection.READWRITE),
    ),
  );
  const header = Buffer.alloc(PACKED_CALL_HEADER_SIZE);
  header.writeBigUInt64LE(BigInt.asUintN(64, BigInt(target)), 0);
  header.writeBigUInt64LE(BigInt(signature.args.length), 8);
  header.writeBigUInt64LE(
    BigInt(allocationAddress + PACKED_CALL_HEADER_SIZE),
    16,
  );
  const bytes = Buffer.concat([header, args]);

  try {
    await accessor.write(allocationAddress, bytes);
  } catch (error) {
    await accessor.free(allocationAddress, 0, MemoryFreeType.RELEASE);
    throw error;
  }

  return createPayloadHandle(accessor, allocationAddress, bytes.length, [
    allocationAddress,
  ]);
}

/**
 * Installs the call dispatcher in dynamic, bound-target, or one-pointer packed
 * mode. Binding is configuration of the same call primitive, not a separate
 * public machine-code family.
 */
export async function installCallThunk(
  accessor: ICallableMemoryAccessor,
  options: InstallCallThunkOptions,
): Promise<InstalledCallThunk> {
  const signature: ThunkSignature = {
    returns: options.signature.returns,
    args: [...options.signature.args],
  };

  let machineCode: CMachineCode;
  if (options.mode === 'dynamic') {
    machineCode = createCallThunk({
      signature,
      invokeStyle: options.invokeStyle,
    });
  } else if (options.mode === 'bound') {
    machineCode = createCallThunk({
      signature,
      functionPointer: BigInt(resolveAddress(options.target)),
      argCount: BigInt(signature.args.length),
      argsRegister: 'rcx',
      invokeStyle: options.invokeStyle,
    });
  } else {
    const inner = await installMachineCode(
      accessor,
      createCallThunk({ signature }),
    );
    machineCode = createCallThunk({
      signature: {
        returns: signature.returns,
        args: ['ptr', 'u64', 'ptr'],
      },
      functionPointer: BigInt(inner.address),
      argCount: 3n,
      argsRegister: 'rcx',
    });
  }

  const installed = await installMachineCode(accessor, machineCode);
  return {
    ...installed,
    mode: options.mode,
    signature,
    allocatePayload: (payloadOptions) =>
      allocateForInstalledCall(
        accessor,
        options.mode,
        signature,
        payloadOptions,
      ),
  };
}

/** Installs the reusable `(...args, destination) => destination` collector. */
export async function installCaptureArgsThunk(
  accessor: ICallableMemoryAccessor,
  options: InstallCaptureArgsThunkOptions,
): Promise<InstalledCaptureArgsThunk> {
  const args = [...options.args];
  const installed = await installMachineCode(
    accessor,
    createCaptureArgsThunk(args),
  );
  return { ...installed, args };
}

function signaturesMatch(
  left: readonly CTypeOrString[],
  right: readonly CTypeOrString[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (type, index) => normalizeType(type) === normalizeType(right[index]),
    )
  );
}

/**
 * Installs the fixed-destination adapter used as a jump-hook landing point,
 * automatically installing/reusing its collector unless one is supplied.
 */
export async function installCaptureHookThunk(
  accessor: ICallableMemoryAccessor,
  options: InstallCaptureHookThunkOptions,
): Promise<InstalledCaptureHookThunk> {
  const args = [...options.args];
  const collector =
    options.collector ?? (await installCaptureArgsThunk(accessor, { args }));

  if (collector.accessor !== accessor) {
    throw new TypeError('collector was installed through a different accessor');
  }
  if (!signaturesMatch(collector.args, args)) {
    throw new TypeError(
      'collector argument signature does not match hook args',
    );
  }

  const destination = Number(resolveAddress(options.destination));
  const installed = await installMachineCode(
    accessor,
    createCaptureAdapterThunk({
      args,
      destination: BigInt(destination),
      collectorAddress: BigInt(collector.address),
    }),
  );

  return {
    ...installed,
    args,
    destination,
    collector,
  };
}
