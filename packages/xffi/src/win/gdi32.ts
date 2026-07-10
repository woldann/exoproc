import { cimport } from '../cimport.js';
import { CType } from '../types.js';

/**
 * Native Gdi32 Bindings
 */
export const Gdi32Library = cimport(
  {
    GetStockObject: {
      args: [CType.INT],
      returns: CType.ptr,
    },
    SetTextColor: {
      args: [CType.ptr, CType.DWORD], // HDC, COLORREF
      returns: CType.DWORD,
    },
    SetBkMode: {
      args: [CType.ptr, CType.INT], // HDC, int
      returns: CType.INT,
    },
    SetBkColor: {
      args: [CType.ptr, CType.DWORD], // HDC, COLORREF
      returns: CType.DWORD,
    },
    CreateSolidBrush: {
      args: [CType.DWORD], // COLORREF
      returns: CType.ptr, // HBRUSH
    },
    DeleteObject: {
      args: [CType.ptr], // HGDIOBJ
      returns: CType.BOOL,
    },
    SelectObject: {
      args: [CType.ptr, CType.ptr], // HDC, HGDIOBJ
      returns: CType.ptr, // HGDIOBJ
    },
    Ellipse: {
      args: [CType.ptr, CType.INT, CType.INT, CType.INT, CType.INT], // HDC, left, top, right, bottom
      returns: CType.BOOL,
    },
  },
  { library: ['gdi32'], knownToLinker: true },
);

export const Gdi32Impl = Gdi32Library.symbols;
