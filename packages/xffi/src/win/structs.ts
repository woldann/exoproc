import { struct } from '../struct.js';

/**
 * Windows MEMORY_BASIC_INFORMATION structure.
 * Unified under a single class definition extending the dynamically compiled struct.
 */
export class MemoryBasicInformation extends struct({
  BaseAddress: 'ptr',
  AllocationBase: 'ptr',
  AllocationProtect: 'DWORD',
  PartitionId: 'WORD',
  RegionSize: 'usize',
  State: 'DWORD',
  Protect: 'DWORD',
  Type: 'DWORD',
} as const) {
  static readonly structName = 'MEMORY_BASIC_INFORMATION';
}

export const MEMORY_BASIC_INFORMATION_SIZE = 48;
export const PROCESSENTRY32W_SIZE = 568;
export const MODULEENTRY32W_SIZE = 1080;
export const THREADENTRY32_SIZE = 28;
export const HEAPLIST32_SIZE = 32;
export const HEAPENTRY32_SIZE = 56;

/**
 * Windows POINT structure.
 */
export class Point extends struct({
  x: 'i32',
  y: 'i32',
} as const) {
  static readonly structName = 'POINT';
}

/**
 * Windows RECT structure.
 */
export class Rect extends struct({
  left: 'i32',
  top: 'i32',
  right: 'i32',
  bottom: 'i32',
} as const) {
  static readonly structName = 'RECT';
}

/**
 * Windows WNDCLASSEXW structure.
 */
export class WndClassExW extends struct({
  cbSize: 'u32',
  style: 'u32',
  lpfnWndProc: 'ptr',
  cbClsExtra: 'i32',
  cbWndExtra: 'i32',
  hInstance: 'ptr',
  hIcon: 'ptr',
  hCursor: 'ptr',
  hbrBackground: 'ptr',
  lpszMenuName: 'ptr',
  lpszClassName: 'ptr',
  hIconSm: 'ptr',
} as const) {
  static readonly structName = 'WNDCLASSEXW';
}

/**
 * Windows MSG structure.
 */
export class Msg extends struct({
  hwnd: 'ptr',
  message: 'u32',
  wParam: 'usize',
  lParam: 'isize',
  time: 'u32',
  pt: Point,
  lPrivate: 'u32',
} as const) {
  static readonly structName = 'MSG';
}

/**
 * Windows PAINTSTRUCT structure.
 */
export class PaintStruct extends struct({
  hdc: 'ptr',
  fErase: 'i32',
  rcPaint: Rect,
  fRestore: 'i32',
  fIncUpdate: 'i32',
  rgbReserved: ['u8', 32],
} as const) {
  static readonly structName = 'PAINTSTRUCT';
}

/**
 * Windows SECURITY_ATTRIBUTES structure.
 */
export class SecurityAttributes extends struct({
  nLength: 'DWORD',
  lpSecurityDescriptor: 'LPVOID',
  bInheritHandle: 'BOOL',
} as const) {
  static readonly structName = 'SECURITY_ATTRIBUTES';
}

/**
 * Windows STARTUPINFOA structure.
 */
export class StartupInfoA extends struct({
  cb: 'DWORD',
  lpReserved: 'ptr',
  lpDesktop: 'ptr',
  lpTitle: 'ptr',
  dwX: 'DWORD',
  dwY: 'DWORD',
  dwXSize: 'DWORD',
  dwYSize: 'DWORD',
  dwXCountChars: 'DWORD',
  dwYCountChars: 'DWORD',
  dwFillAttribute: 'DWORD',
  dwFlags: 'DWORD',
  wShowWindow: 'WORD',
  cbReserved2: 'WORD',
  lpReserved2: 'ptr',
  hStdInput: 'HANDLE',
  hStdOutput: 'HANDLE',
  hStdError: 'HANDLE',
} as const) {
  static readonly structName = 'STARTUPINFOA';
}

/**
 * Windows PROCESS_INFORMATION structure.
 */
export class ProcessInformation extends struct({
  hProcess: 'HANDLE',
  hThread: 'HANDLE',
  dwProcessId: 'DWORD',
  dwThreadId: 'DWORD',
} as const) {
  static readonly structName = 'PROCESS_INFORMATION';
}

/**
 * Windows GUITHREADINFO structure interface.
 */
export interface GUIThreadInfo {
  cbSize: number;
  flags: number;
  hwndActive: bigint;
  hwndFocus: bigint;
  hwndCapture: bigint;
  hwndMenuOwner: bigint;
  hwndMoveSize: bigint;
  hwndCaret: bigint;
  rcCaret: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}
