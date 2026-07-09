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
  baseAddress: new NativePointer(Kernel32Impl.GetModuleHandleA('ntdll.dll')),
}) as typeof lib & { baseAddress: IPointer };
