import { CType, type Win32Dll } from './types.js';

/**
 * Native Gdi32 Definitions
 */
export const Gdi32Definitions = {
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
};

export const Gdi32Dll = {
  name: 'gdi32',
  knownToLinker: true,
  definitions: Gdi32Definitions,
} as const satisfies Win32Dll;
