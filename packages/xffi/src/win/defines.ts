/**
 * Windows Win32 API Constants and Definitions
 */

import { cdefines, type CDefineValueType } from '../cdefine.js';

// 1. WS (Window Styles)
export const WS = cdefines(
  {
    OVERLAPPED: 0x00000000,
    POPUP: 0x80000000,
    CHILD: 0x40000000,
    MINIMIZE: 0x20000000,
    VISIBLE: 0x10000000,
    DISABLED: 0x08000000,
    CLIPSIBLINGS: 0x04000000,
    CLIPCHILDREN: 0x02000000,
    MAXIMIZE: 0x01000000,
    CAPTION: 0x00c00000,
    BORDER: 0x00800000,
    DLGFRAME: 0x00400000,
    VSCROLL: 0x00200000,
    HSCROLL: 0x00100000,
    SYSMENU: 0x00080000,
    THICKFRAME: 0x00040000,
    GROUP: 0x00020000,
    TABSTOP: 0x00010000,
    MINIMIZEBOX: 0x00020000,
    MAXIMIZEBOX: 0x00010000,
    OVERLAPPEDWINDOW:
      0x00000000 |
      0x00c00000 |
      0x00080000 |
      0x00040000 |
      0x00020000 |
      0x00010000,
  },
  'WS',
);
export type WS = CDefineValueType<typeof WS>;

// 2. CS (Class Styles)
export const CS = cdefines(
  {
    VREDRAW: 0x0001,
    HREDRAW: 0x0002,
    DBLCLKS: 0x0008,
    OWNDC: 0x0020,
    CLASSDC: 0x0040,
    PARENTDC: 0x0080,
    NOCLOSE: 0x0200,
    SAVEBITS: 0x0800,
    BYTEALIGNCLIENT: 0x1000,
    BYTEALIGNWINDOW: 0x2000,
    GLOBALCLASS: 0x4000,
  },
  'CS',
);
export type CS = CDefineValueType<typeof CS>;

// 3. WM (Window Messages)
export const WM = cdefines(
  {
    NULL: 0x0000,
    CREATE: 0x0001,
    DESTROY: 0x0002,
    MOVE: 0x0003,
    SIZE: 0x0005,
    ACTIVATE: 0x0006,
    SETFOCUS: 0x0007,
    KILLFOCUS: 0x0008,
    ENABLE: 0x000a,
    SETREDRAW: 0x000b,
    SETTEXT: 0x000c,
    GETTEXT: 0x000d,
    GETTEXTLENGTH: 0x000e,
    PAINT: 0x000f,
    CLOSE: 0x0010,
    QUERYENDSESSION: 0x0011,
    QUIT: 0x0012,
    QUERYOPEN: 0x0013,
    ERASEBKGND: 0x0014,
    SYSCOLORCHANGE: 0x0015,
    ENDSESSION: 0x0016,
    SHOWWINDOW: 0x0018,
    CTLCOLOR: 0x0019,
    WININICHANGE: 0x001a,
    DEVMODECHANGE: 0x001b,
    ACTIVATEAPP: 0x001c,
    FONTCHANGE: 0x001d,
    TIMECHANGE: 0x001e,
    CANCELMODE: 0x001f,
    SETCURSOR: 0x0020,
    MOUSEACTIVATE: 0x0021,
    CHILDACTIVATE: 0x0022,
    QUEUESYNC: 0x0023,
    GETMINMAXINFO: 0x0024,

    KEY: cdefines({
      DOWN: 0x0100,
      UP: 0x0101,
    }),

    CHAR: 0x0102,

    SYSKEY: cdefines({
      DOWN: 0x0104,
      UP: 0x0105,
    }),

    SYSCHAR: 0x0106,

    MOUSEMOVE: 0x0200,

    LBUTTON: cdefines({
      DOWN: 0x0201,
      UP: 0x0202,
      DBLCLK: 0x0203,
    }),

    RBUTTON: cdefines({
      DOWN: 0x0204,
      UP: 0x0205,
      DBLCLK: 0x0206,
    }),

    MBUTTON: cdefines({
      DOWN: 0x0207,
      UP: 0x0208,
      DBLCLK: 0x0209,
    }),
  },
  'WM',
);
export type WM = CDefineValueType<typeof WM, true>;

// 4. SW (ShowWindow Commands)
export const SW = cdefines(
  {
    HIDE: 0,
    SHOWNORMAL: 1,
    NORMAL: 1,
    SHOWMINIMIZED: 2,
    SHOWMAXIMIZED: 3,
    MAXIMIZE: 3,
    SHOWNOACTIVATE: 4,
    SHOW: 5,
    MINIMIZE: 6,
    SHOWMINNOACTIVE: 7,
    SHOWNA: 8,
    RESTORE: 9,
    SHOWDEFAULT: 10,
    FORCEMINIMIZE: 11,
  },
  'SW',
);
export type SW = CDefineValueType<typeof SW, true>;

// 5. IDC (Standard Cursors)
export const IDC = cdefines(
  {
    ARROW: 32512,
    IBEAM: 32513,
    WAIT: 32514,
    CROSS: 32515,
    UPARROW: 32516,
    SIZE: 32640,
    ICON: 32641,
    SIZENWSE: 32642,
    SIZENESW: 32643,
    SIZEWE: 32644,
    SIZENS: 32645,
    SIZEALL: 32646,
    NO: 32648,
    HAND: 32649,
    APPSTARTING: 32650,
    HELP: 32651,
  },
  'IDC',
);
export type IDC = CDefineValueType<typeof IDC, true>;

// 6. IDI (Standard Icons)
export const IDI = cdefines(
  {
    APPLICATION: 32512,
    HAND: 32513,
    QUESTION: 32514,
    EXCLAMATION: 32515,
    ASTERISK: 32516,
    WINLOGO: 32517,
  },
  'IDI',
);
export type IDI = CDefineValueType<typeof IDI, true>;

// 7. STOCK (Stock Objects)
export const STOCK = cdefines({
  WHITE_BRUSH: 0,
  LTGRAY_BRUSH: 1,
  GRAY_BRUSH: 2,
  DKGRAY_BRUSH: 3,
  BLACK_BRUSH: 4,
  NULL_BRUSH: 5,
  HOLLOW_BRUSH: 5,
  WHITE_PEN: 6,
  BLACK_PEN: 7,
  NULL_PEN: 8,
  OEM_FIXED_FONT: 10,
  ANSI_FIXED_FONT: 11,
  ANSI_VAR_FONT: 12,
  SYSTEM_FONT: 13,
  DEVICE_DEFAULT_FONT: 14,
  DEFAULT_PALETTE: 15,
  SYSTEM_FIXED_FONT: 16,
  DEFAULT_GUI_FONT: 17,
});
export type STOCK = CDefineValueType<typeof STOCK, true>;

// 8. COLOR (System Colors)
export const COLOR = cdefines(
  {
    SCROLLBAR: 0,
    BACKGROUND: 1,
    ACTIVECAPTION: 2,
    INACTIVECAPTION: 3,
    MENU: 4,
    WINDOW: 5,
    WINDOWFRAME: 6,
    MENUTEXT: 7,
    WINDOWTEXT: 8,
    CAPTIONTEXT: 9,
    ACTIVEBORDER: 10,
    INACTIVEBORDER: 11,
    APPWORKSPACE: 12,
    HIGHLIGHT: 13,
    HIGHLIGHTTEXT: 14,
    BTNFACE: 15,
    BTNSHADOW: 16,
    GRAYTEXT: 17,
    BTNTEXT: 18,
    INACTIVECAPTIONTEXT: 19,
    BTNHIGHLIGHT: 20,
  },
  'COLOR',
);
export type COLOR = CDefineValueType<typeof COLOR, true>;

// 9. BARE (Bare un-prefixed constants)
export const BARE = cdefines({
  TRANSPARENT: 1,
  OPAQUE: 2,
  CW_USEDEFAULT: -2147483648,
  INFINITE: 0xffffffff,
});
export type BARE = CDefineValueType<typeof BARE, true>;
export const INFINITE = 0xffffffff;
export const INVALID_HANDLE_VALUE = -1;

// 10. MemoryState
export const MemoryState = cdefines(
  {
    COMMIT: 0x1000,
    RESERVE: 0x2000,
    FREE: 0x10000,
  },
  'MEM',
);
export type MemoryState = CDefineValueType<typeof MemoryState>;

// 11. MemoryProtection
export const MemoryProtection = cdefines(
  {
    NOACCESS: 0x01,
    READONLY: 0x02,
    READWRITE: 0x04,
    WRITECOPY: 0x08,
    EXECUTE: 0x10,
    EXECUTE_READ: 0x20,
    EXECUTE_READWRITE: 0x40,
    EXECUTE_WRITECOPY: 0x80,
    GUARD: 0x100,
    NOCACHE: 0x200,
    WRITECOMBINE: 0x400,
  },
  'PAGE',
);
export type MemoryProtection = CDefineValueType<typeof MemoryProtection>;

// 12. MemoryFreeType
export const MemoryFreeType = cdefines(
  {
    RELEASE: 0x8000,
    DECOMMIT: 0x4000,
  },
  'MEM',
);
export type MemoryFreeType = CDefineValueType<typeof MemoryFreeType>;

// 13. ProcessAccess
export const ProcessAccess = cdefines(
  {
    TERMINATE: 0x0001,
    CREATE_THREAD: 0x0002,
    VM_OPERATION: 0x0008,
    VM_READ: 0x0010,
    VM_WRITE: 0x0020,
    DUP_HANDLE: 0x0040,
    QUERY_INFORMATION: 0x0400,
    SUSPEND_RESUME: 0x0800,
    QUERY_LIMITED_INFORMATION: 0x1000,
    ALL_ACCESS: 0x1fffff,
  },
  'PROCESS',
);
export type ProcessAccess = CDefineValueType<typeof ProcessAccess>;

// 14. ThreadAccess
export const ThreadAccess = cdefines(
  {
    TERMINATE: 0x0001,
    SUSPEND_RESUME: 0x0002,
    GET_CONTEXT: 0x0008,
    SET_CONTEXT: 0x0010,
    SET_INFORMATION: 0x0020,
    QUERY_INFORMATION: 0x0040,
    SET_THREAD_TOKEN: 0x0080,
    IMPERSONATE: 0x0100,
    DIRECT_IMPERSONATION: 0x0200,
    SET_LIMITED_INFORMATION: 0x0400,
    QUERY_LIMITED_INFORMATION: 0x0800,
    SYNCHRONIZE: 0x00100000,
    ALL_ACCESS: 0x1fffff,
  },
  'THREAD',
);
export type ThreadAccess = CDefineValueType<typeof ThreadAccess>;

// 15. ThreadCreationFlags
export const ThreadCreationFlags = cdefines(
  {
    IMMEDIATE: 0,
    CREATE_SUSPENDED: 0x00000004,
  },
  'THREAD_CREATE',
);
export type ThreadCreationFlags = CDefineValueType<typeof ThreadCreationFlags>;

// 16. ContextFlags
export const ContextFlags = cdefines(
  {
    AMD64: 0x00100000,
    CONTROL: 0x00100000 | 0x00000001,
    INTEGER: 0x00100000 | 0x00000002,
    SEGMENTS: 0x00100000 | 0x00000004,
    FLOATING_POINT: 0x00100000 | 0x00000008,
    DEBUG_REGISTERS: 0x00100000 | 0x00000010,
    FULL:
      0x00100000 |
      0x00000001 |
      (0x00100000 | 0x00000002) |
      (0x00100000 | 0x00000008),
    ALL:
      0x00100000 |
      0x00000001 |
      (0x00100000 | 0x00000002) |
      (0x00100000 | 0x00000008) |
      (0x00100000 | 0x00000004) |
      (0x00100000 | 0x00000010),
  },
  'CONTEXT',
);
export type ContextFlags = CDefineValueType<typeof ContextFlags>;

// 17. ToolhelpSnapshotFlag
export const ToolhelpSnapshotFlag = cdefines(
  {
    HEAPLIST: 0x00000001,
    PROCESS: 0x00000002,
    THREAD: 0x00000004,
    MODULE: 0x00000008,
    MODULE32: 0x00000010,
    ALL: 0x00000001 | 0x00000002 | 0x00000004 | 0x00000008,
    SNAPTHREAD: 0x00000004,
    SNAPPROCESS: 0x00000002,
    SNAPMODULE: 0x00000008,
    SNAPMODULE32: 0x00000010,
    SNAPHEAPLIST: 0x00000001,
    SNAPALL: 0x00000001 | 0x00000002 | 0x00000004 | 0x00000008,
  },
  'TH32CS',
);
export type ToolhelpSnapshotFlag = number;

// 18. GetModuleHandleExFlag
export const GetModuleHandleExFlag = cdefines(
  {
    PIN: 0x00000001,
    UNCHANGED_REFCOUNT: 0x00000002,
    FROM_ADDRESS: 0x00000004,
  },
  'GET_MODULE_HANDLE_EX',
);
export type GetModuleHandleExFlag = CDefineValueType<
  typeof GetModuleHandleExFlag
>;

// 19. DT (DrawText Alignment Options)
export const DT = cdefines(
  {
    LEFT: 0x00000000,
    TOP: 0x00000000,
    CENTER: 0x00000001,
    RIGHT: 0x00000002,
    VCENTER: 0x00000004,
    BOTTOM: 0x00000008,
    WORDBREAK: 0x00000010,
    SINGLELINE: 0x00000020,
    EXPANDTABS: 0x00000040,
    TABSTOP: 0x00000080,
    NOCLIP: 0x00000100,
    EXTERNALLEADING: 0x00000200,
    CALCRECT: 0x00000400,
    NOPREFIX: 0x00000800,
    INTERNAL: 0x00001000,
  },
  'DT',
);
export type DT = CDefineValueType<typeof DT>;

// 20. MACROS (Common Windows Macros like RGB)
import { cmacro } from '../cmacro.js';

export const MACROS = {
  RGB: cmacro((r: number, g: number, b: number) => {
    return r | (g << 8) | (b << 16);
  }, '((($1) | (($2) << 8)) | (($3) << 16))'),
  GetRValue: cmacro((rgb: number) => rgb & 0xff, '(($1) & 0xFF)'),
  GetGValue: cmacro((rgb: number) => (rgb >> 8) & 0xff, '((($1) >> 8) & 0xFF)'),
  GetBValue: cmacro(
    (rgb: number) => (rgb >> 16) & 0xff,
    '((($1) >> 16) & 0xFF)',
  ),
};

export const RGB = MACROS.RGB;
export const GetRValue = MACROS.GetRValue;
export const GetGValue = MACROS.GetGValue;
export const GetBValue = MACROS.GetBValue;

// 21. WaitReturn
export const WaitReturn = cdefines(
  {
    OBJECT_0: 0,
    TIMEOUT: 258,
    FAILED: 0xffffffff,
  },
  'WAIT',
);
export type WaitReturn = CDefineValueType<typeof WaitReturn>;

// 22. Default alignments
export const DEFAULT_MACHINECODE_ALIGNMENT = 16;

// 23. ProcessCreationFlags (for CreateProcess*)
export const ProcessCreationFlags = cdefines({
  DEBUG_PROCESS: 0x00000001,
  DEBUG_ONLY_THIS_PROCESS: 0x00000002,
  CREATE_SUSPENDED: 0x00000004,
  DETACHED_PROCESS: 0x00000008,
  CREATE_NEW_CONSOLE: 0x00000010,
  NORMAL_PRIORITY_CLASS: 0x00000020,
  IDLE_PRIORITY_CLASS: 0x00000040,
  HIGH_PRIORITY_CLASS: 0x00000080,
  REALTIME_PRIORITY_CLASS: 0x00000100,
  CREATE_NEW_PROCESS_GROUP: 0x00000200,
  CREATE_UNICODE_ENVIRONMENT: 0x00000400,
  CREATE_SEPARATE_WOW_VDM: 0x00000800,
  CREATE_PROTECTED_PROCESS: 0x00040000,
  EXTENDED_STARTUPINFO_PRESENT: 0x00080000,
  CREATE_DEFAULT_ERROR_MODE: 0x04000000,
  CREATE_NO_WINDOW: 0x08000000,
});
export type ProcessCreationFlags = CDefineValueType<
  typeof ProcessCreationFlags
>;

// 24. FileMapAccess (for MapViewOfFile)
export const FileMapAccess = cdefines(
  {
    COPY: 0x00000001,
    WRITE: 0x00000002,
    READ: 0x00000004,
    EXECUTE: 0x00000020,
    LARGE_PAGES: 0x20000000,
    TARGETS_INVALID: 0x40000000,
    ALL_ACCESS: 0x000f001f,
  },
  'FILE_MAP',
);
export type FileMapAccess = CDefineValueType<typeof FileMapAccess>;

// 25. DuplicateHandleOptions (for DuplicateHandle)
export const DuplicateHandleOptions = cdefines(
  {
    CLOSE_SOURCE: 0x00000001,
    SAME_ACCESS: 0x00000002,
  },
  'DUPLICATE',
);
export type DuplicateHandleOptions = CDefineValueType<
  typeof DuplicateHandleOptions
>;

// 26. TokenAccess (for OpenProcessToken)
export const TokenAccess = cdefines(
  {
    ASSIGN_PRIMARY: 0x0001,
    DUPLICATE: 0x0002,
    IMPERSONATE: 0x0004,
    QUERY: 0x0008,
    QUERY_SOURCE: 0x0010,
    ADJUST_PRIVILEGES: 0x0020,
    ADJUST_GROUPS: 0x0040,
    ADJUST_DEFAULT: 0x0080,
    ADJUST_SESSIONID: 0x0100,
  },
  'TOKEN',
);
export type TokenAccess = CDefineValueType<typeof TokenAccess>;

// 27. CreateRestrictedTokenFlags (for CreateRestrictedToken -- de-elevates a
// token derived from the caller's own primary token, so no
// SE_ASSIGN_PRIMARYTOKEN_NAME privilege is required to CreateProcessAsUser
// with the result)
export const CreateRestrictedTokenFlags = cdefines({
  DISABLE_MAX_PRIVILEGE: 0x1,
  SANDBOX_INERT: 0x2,
  LUA_TOKEN: 0x4,
  WRITE_RESTRICTED: 0x8,
});
export type CreateRestrictedTokenFlags = CDefineValueType<
  typeof CreateRestrictedTokenFlags
>;

// 28. StartupInfoFlags (STARTUPINFO.dwFlags)
export const StartupInfoFlags = cdefines({
  USESHOWWINDOW: 0x00000001,
});
export type StartupInfoFlags = CDefineValueType<typeof StartupInfoFlags>;

// 29. ShowWindowCommand (STARTUPINFO.wShowWindow / ShowWindow's nCmdShow)
export const ShowWindowCommand = cdefines({
  SW_HIDE: 0,
  SW_SHOWNORMAL: 1,
});
export type ShowWindowCommand = CDefineValueType<typeof ShowWindowCommand>;
