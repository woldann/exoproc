import { createCFunction } from '../cfunction.js';
import { cimport } from '../cimport.js';
import { CType } from '../types.js';
import { Kernel32Impl } from './kernel32.js';
import { resolveAddress } from '../ffi.js';
import { NativePointer } from '../pointer.js';

/**
 * Native CRT Definitions
 */
export const CrtDefinitions = {
  malloc: { args: [CType.u64], returns: CType.ptr },
  free: { args: [CType.ptr], returns: CType.void },
  memcpy: { args: [CType.ptr, CType.ptr, CType.u64], returns: CType.ptr },
  memset: { args: [CType.ptr, CType.i32, CType.u64], returns: CType.ptr },
  memcmp: { args: [CType.ptr, CType.ptr, CType.u64], returns: CType.i32 },
  strlen: { args: [CType.cstring], returns: CType.u64 },
  wcslen: { args: [CType.cwstring], returns: CType.u64 },
  sinf: { args: [CType.float], returns: CType.float },
  cosf: { args: [CType.float], returns: CType.float },
  sqrtf: { args: [CType.float], returns: CType.float },
  sin: { args: [CType.f64], returns: CType.f64 },
  cos: { args: [CType.f64], returns: CType.f64 },
  sqrt: { args: [CType.f64], returns: CType.f64 },
  rand: { args: [], returns: CType.i32 },
  fopen: { args: [CType.ptr, CType.ptr], returns: CType.ptr },
  fclose: { args: [CType.ptr], returns: CType.i32 },
  fread: {
    args: [CType.ptr, CType.u64, CType.u64, CType.ptr],
    returns: CType.u64,
  },
  fwrite: {
    args: [CType.ptr, CType.u64, CType.u64, CType.ptr],
    returns: CType.u64,
  },
  fflush: { args: [CType.ptr], returns: CType.i32 },
  rewind: { args: [CType.ptr], returns: CType.void },
};

/**
 * Native CRT Bindings (wrapped around Bun's process/executable space where overridden)
 */
export const CrtLibrary = cimport(CrtDefinitions, {
  library: ['msvcrt'],
  knownToLinker: true,
});

export const CrtImpl = CrtLibrary.symbols;

const resolvedSymbols: any = {};
let hasResolved = false;
const hMsvcrt = Kernel32Impl.GetModuleHandleA('msvcrt.dll');
if (hMsvcrt && Number(hMsvcrt) !== 0) {
  for (const [name, def] of Object.entries(CrtDefinitions)) {
    const pProc = Kernel32Impl.GetProcAddress(hMsvcrt, name);
    if (pProc && Number(pProc) !== 0) {
      resolvedSymbols[name] = createCFunction(
        resolveAddress(pProc),
        [def.returns, def.args],
        (CrtImpl as any)[name],
        name,
      );
    } else {
      resolvedSymbols[name] = (CrtImpl as any)[name];
    }
  }
  hasResolved = true;
}
if (!hasResolved) {
  for (const name of Object.keys(CrtDefinitions)) {
    resolvedSymbols[name] = (CrtImpl as any)[name];
  }
}

export const MsvcrtImpl = resolvedSymbols as typeof CrtImpl;

export const MsvcrtLibrary = {
  symbols: MsvcrtImpl,
  library: ['msvcrt'],
  baseAddress: new NativePointer(Kernel32Impl.GetModuleHandleA('msvcrt.dll')),
  close() {},
};
