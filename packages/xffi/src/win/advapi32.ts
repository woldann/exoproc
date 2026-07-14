import { cimport } from '../cimport.js';
import { CType } from '../types.js';

/**
 * Native Advapi32 Bindings
 */
const lib = cimport(
  {
    OpenProcessToken: {
      args: [CType.HANDLE, CType.DWORD, CType.ptr],
      returns: CType.BOOL,
    },
    CreateRestrictedToken: {
      args: [
        CType.HANDLE,
        CType.DWORD,
        CType.DWORD,
        CType.ptr,
        CType.DWORD,
        CType.ptr,
        CType.DWORD,
        CType.ptr,
        CType.ptr,
      ],
      returns: CType.BOOL,
    },
    CreateProcessAsUserA: {
      args: [
        CType.HANDLE,
        CType.ptr,
        CType.ptr,
        CType.ptr,
        CType.ptr,
        CType.BOOL,
        CType.DWORD,
        CType.LPVOID,
        CType.ptr,
        CType.ptr,
        CType.ptr,
      ],
      returns: CType.BOOL,
    },
  },
  { library: ['advapi32'], knownToLinker: true },
);

export const Advapi32Impl = lib.symbols;

import { Kernel32Impl } from './kernel32.js';
import { NativePointer, type IPointer } from '../pointer.js';
export const Advapi32Library = Object.assign(lib, {
  baseAddress: new NativePointer(Kernel32Impl.GetModuleHandleA('advapi32.dll')),
}) as typeof lib & { baseAddress: IPointer };
