import { cimport } from '../cimport.js';
import { CType } from '../types.js';

/**
 * Native Psapi Bindings
 */
export const PsapiLibrary = cimport(
  {
    GetModuleInformation: {
      args: [CType.ptr, CType.ptr, CType.ptr, CType.DWORD],
      returns: CType.BOOL,
    },
  },
  { library: ['psapi'] },
);

export const PsapiImpl = PsapiLibrary.symbols;
