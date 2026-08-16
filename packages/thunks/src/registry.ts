import {
  createCFunction,
  createPendingMachineCode,
  normalizeType,
  type CMachineCode,
  type CTypeOrString,
  type ICallableMemoryAccessor,
} from 'bun-xffi';
import type { InstalledThunk } from './types.js';

type MachineCodeSignature = [CTypeOrString, CTypeOrString[]];

interface RegistryEntry {
  readonly bytes: number[];
  readonly wrappers: Map<string, CMachineCode>;
}

const machineCodeRegistry = new Map<string, RegistryEntry>();
const installationRegistry = new WeakMap<
  ICallableMemoryAccessor,
  Map<string, Promise<number>>
>();

function keyForBytes(bytes: readonly number[] | Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function keyForSignature([returns, args]: MachineCodeSignature): string {
  return JSON.stringify([
    normalizeType(returns),
    args.map((arg) => normalizeType(arg)),
  ]);
}

/**
 * Returns an identity-stable typed wrapper for a byte sequence and signature.
 * The byte array is canonicalized by content, while wrappers are cached by
 * their normalized ABI signature so the same instructions can safely expose
 * several return/argument views without a first-signature-wins special case.
 */
export function registerMachineCode(
  bytes: readonly number[] | Uint8Array,
  sig: MachineCodeSignature,
): CMachineCode {
  const byteKey = keyForBytes(bytes);
  let entry = machineCodeRegistry.get(byteKey);
  if (!entry) {
    entry = { bytes: Array.from(bytes), wrappers: new Map() };
    machineCodeRegistry.set(byteKey, entry);
  }

  const signatureKey = keyForSignature(sig);
  let wrapper = entry.wrappers.get(signatureKey);
  if (!wrapper) {
    wrapper = createPendingMachineCode(sig, entry.bytes);
    entry.wrappers.set(signatureKey, wrapper);
  }
  return wrapper;
}

/**
 * Installs a registered thunk once per accessor and byte sequence. The in-flight
 * promise is cached as well, preventing concurrent callers from injecting the
 * same code twice. Signature-specific handles share the installed address but
 * receive their own correctly typed CFunction view.
 */
export async function installMachineCode(
  accessor: ICallableMemoryAccessor,
  machineCode: CMachineCode,
): Promise<InstalledThunk> {
  const byteKey = keyForBytes(machineCode.bytes);
  let perAccessor = installationRegistry.get(accessor);
  if (!perAccessor) {
    perAccessor = new Map();
    installationRegistry.set(accessor, perAccessor);
  }

  let pendingAddress = perAccessor.get(byteKey);
  if (!pendingAddress) {
    pendingAddress = accessor.machineCode(machineCode);
    perAccessor.set(byteKey, pendingAddress);
  }

  let address: number;
  try {
    address = await pendingAddress;
  } catch (error) {
    if (perAccessor.get(byteKey) === pendingAddress) {
      perAccessor.delete(byteKey);
    }
    throw error;
  }

  return {
    accessor,
    machineCode,
    address,
    fn: createCFunction(address, [machineCode.returns, [...machineCode.args]]),
  };
}
