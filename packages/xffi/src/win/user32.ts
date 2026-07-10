import { cimport } from '../cimport.js';
import { CType } from '../types.js';

/**
 * Native User32 Bindings
 */
const lib = cimport(
  {
    RegisterClassExW: {
      args: [CType.ptr],
      returns: CType.WORD,
    },
    CreateWindowExW: {
      args: [
        CType.DWORD, // dwExStyle
        'cwstring', // lpClassName
        'cwstring', // lpWindowName
        CType.DWORD, // dwStyle
        CType.INT, // X
        CType.INT, // Y
        CType.INT, // nWidth
        CType.INT, // nHeight
        CType.HWND, // hWndParent
        CType.ptr, // hMenu
        CType.ptr, // hInstance
        CType.LPVOID, // lpParam
      ],
      returns: CType.HWND,
    },
    ShowWindow: {
      args: [CType.HWND, CType.INT],
      returns: CType.BOOL,
    },
    UpdateWindow: {
      args: [CType.HWND],
      returns: CType.BOOL,
    },
    GetMessageW: {
      args: [CType.ptr, CType.HWND, CType.UINT, CType.UINT],
      returns: CType.BOOL,
    },
    PeekMessageW: {
      args: [CType.ptr, CType.HWND, CType.UINT, CType.UINT, CType.UINT],
      returns: CType.BOOL,
    },
    TranslateMessage: {
      args: [CType.ptr],
      returns: CType.BOOL,
    },
    DispatchMessageW: {
      args: [CType.ptr],
      returns: CType.INT_PTR,
    },
    PostQuitMessage: {
      args: [CType.INT],
      returns: CType.void,
    },
    DefWindowProcW: {
      args: [CType.HWND, CType.UINT, CType.usize, CType.i64],
      returns: CType.i64,
    },
    BeginPaint: {
      args: [CType.HWND, CType.ptr],
      returns: CType.ptr,
    },
    EndPaint: {
      args: [CType.HWND, CType.ptr],
      returns: CType.BOOL,
    },
    GetClientRect: {
      args: [CType.HWND, CType.ptr],
      returns: CType.BOOL,
    },
    DrawTextW: {
      args: [CType.ptr, 'cwstring', CType.INT, CType.ptr, CType.UINT],
      returns: CType.INT,
    },
    LoadCursorW: {
      args: [CType.ptr, CType.ptr], // CType.ptr allows numeric ID and HMODULE
      returns: CType.ptr,
    },
    LoadIconW: {
      args: [CType.ptr, CType.ptr], // CType.ptr allows numeric ID and HMODULE
      returns: CType.ptr,
    },
    FillRect: {
      args: [CType.ptr, CType.ptr, CType.ptr], // HDC, LPRECT, HBRUSH
      returns: CType.INT,
    },
    InvalidateRect: {
      args: [CType.HWND, CType.ptr, CType.BOOL],
      returns: CType.BOOL,
    },
    GetDC: {
      args: [CType.HWND],
      returns: CType.ptr,
    },
    ReleaseDC: {
      args: [CType.HWND, CType.ptr],
      returns: CType.INT,
    },
    GetSystemMetrics: {
      args: [CType.INT],
      returns: CType.INT,
    },
    MessageBoxW: {
      args: [CType.HWND, 'cwstring', 'cwstring', CType.UINT],
      returns: CType.INT,
    },
    SetTimer: {
      args: [CType.HWND, CType.usize, CType.UINT, CType.ptr],
      returns: CType.usize,
    },
    KillTimer: {
      args: [CType.HWND, CType.usize],
      returns: CType.BOOL,
    },
    GetWindowThreadProcessId: {
      args: [CType.HWND, CType.ptr],
      returns: CType.DWORD,
    },
    GetWindowTextLengthW: {
      args: [CType.HWND],
      returns: CType.INT,
    },
    GetWindowTextW: {
      args: [CType.HWND, CType.ptr, CType.INT],
      returns: CType.INT,
    },
    GetClassNameW: {
      args: [CType.HWND, CType.ptr, CType.INT],
      returns: CType.INT,
    },
    IsIconic: {
      args: [CType.HWND],
      returns: CType.BOOL,
    },
    IsZoomed: {
      args: [CType.HWND],
      returns: CType.BOOL,
    },
    GetWindowRect: {
      args: [CType.HWND, CType.ptr],
      returns: CType.BOOL,
    },
    GetGUIThreadInfo: {
      args: [CType.DWORD, CType.ptr],
      returns: CType.BOOL,
    },
    EnumWindows: {
      args: [CType.ptr, CType.LPVOID],
      returns: CType.BOOL,
    },
    FindWindowW: {
      args: ['cwstring', 'cwstring'],
      returns: CType.HWND,
    },
    PostMessageW: {
      args: [CType.HWND, CType.UINT, CType.usize, CType.i64],
      returns: CType.BOOL,
    },
  },
  { library: ['user32'], knownToLinker: true },
);

export const User32Impl = lib.symbols;

import { Kernel32Impl } from './kernel32.js';
import { NativePointer, type IPointer } from '../pointer.js';
export const User32Library = Object.assign(lib, {
  baseAddress: new NativePointer(Kernel32Impl.GetModuleHandleA('user32.dll')),
}) as typeof lib & { baseAddress: IPointer };
