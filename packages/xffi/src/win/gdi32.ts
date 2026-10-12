import { cimport } from '../cimport.js';
import { Gdi32Definitions } from '@exoproc/win32-abi';

/**
 * Native Gdi32 Bindings
 */
export const Gdi32Library = cimport(Gdi32Definitions as any, {
  library: ['gdi32'],
  knownToLinker: true,
});

export const Gdi32Impl = Gdi32Library.symbols;
