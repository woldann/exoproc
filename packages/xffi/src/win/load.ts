import {
  cimport,
  type CImportSymbol,
  type CImportLibrarySymbols,
} from '../cimport.js';
import { createCFunction } from '../cfunction.js';
import { Kernel32Impl } from './kernel32.js';

/**
 * Loads a DLL from an explicit path and binds its exports. Unlike `cimport`,
 * which resolves non-system libraries by base name via the OS search order,
 * this always resolves `options.dll` as given — required for bundled,
 * repo-local DLLs (e.g. capstone.dll) that don't live on PATH.
 *
 * On Windows the path is passed as a wide string to LoadLibraryW, which is
 * always correct for JS strings (UTF-16). LoadLibraryA expects an ANSI byte
 * sequence and is not suitable for JS string inputs.
 */
export function load<F extends Record<string, CImportSymbol>>(options: {
  dll: string;
  dllFuncs: F;
}): CImportLibrarySymbols<F> {
  if (process.platform === 'win32') {
    const hModule = Kernel32Impl.LoadLibraryW(options.dll);
    if (!hModule || Number(hModule) === 0) {
      throw new Error(`LoadLibraryW failed for ${options.dll}`);
    }

    const symbols: any = {};
    for (const [name, sym] of Object.entries(options.dllFuncs)) {
      const procAddr = Kernel32Impl.GetProcAddress(hModule, name);
      if (!procAddr || Number(procAddr) === 0) {
        throw new Error(`GetProcAddress failed for symbol ${name}`);
      }
      symbols[name] = createCFunction(procAddr, [
        sym.returns ?? 'void',
        [...(sym.args ?? [])],
      ]);
    }
    return symbols as CImportLibrarySymbols<F>;
  } else {
    const lib = cimport(options.dllFuncs, { library: [options.dll] });
    return lib.symbols;
  }
}
