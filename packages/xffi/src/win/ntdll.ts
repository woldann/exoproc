import { cimport } from '../cimport.js';
import { CType } from '../types.js';
import { Kernel32Impl } from './kernel32.js';

/**
 * Ntdll Native Bindings
 */
const lib = cimport(
  {
    RtlImageNtHeader: {
      args: [CType.ptr],
      returns: CType.ptr,
    },
  },
  { library: ['ntdll'] },
);

export const NtdllImpl = lib.symbols;

import { NativePointer, type IPointer } from '../pointer.js';
export const NtdllLibrary = Object.assign(lib, {
  get baseAddress(): IPointer {
    try {
      return new NativePointer(Kernel32Impl.GetModuleHandleA('ntdll.dll'));
    } catch {
      return new NativePointer(0n);
    }
  },
}) as typeof lib & { baseAddress: IPointer };
