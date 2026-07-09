export * from './types.js';
export * from './pointer.js';
export * from './win/defines.js';
export * from './iaccessor.js';
export * from './accessor.js';
export { AllocNearRangeError } from './near-alloc.js';
export * from './middleware-accessor.js';
export {
  FileTransferReadAccessor,
  FileTransferWriteAccessor,
  MemsetWriteAccessor,
  MemcmpReadAccessor,
  DebugMemoryAccessor,
} from './middleware-accessor.js';
export * from './host-accessor.js';
export * from './callable-accessor.js';
export * from './win/utils.js';
export * from './cfunction.js';
export * from './cjit.js';
export { cjitopen } from './cjit.js';
export * from './ccallback.js';
export * from './cmachinecode.js';
export * from './stub.js';

export * from './cimport.js';
export * from './debug-helper.js';
import {
  struct,
  union,
  Struct,
  SyncStruct,
  toCStructDefinition,
} from './struct.js';
import {
  ffi,
  resolveAddress,
  sizeof,
  alignmentof,
  compileStruct,
  currentProcessId,
  currentProcessHandle,
  stackAlign16,
  alignUp,
  alignDown,
} from './ffi.js';

(ffi as any).struct = struct;
(ffi as any).union = union;

export {
  struct,
  union,
  Struct,
  SyncStruct,
  toCStructDefinition,
  ffi,
  resolveAddress,
  sizeof,
  alignmentof,
  compileStruct,
  currentProcessId,
  currentProcessHandle,
  stackAlign16,
  alignUp,
  alignDown,
};
export * from './win/kernel32.js';
export * from './win/ntdll.js';
export * from './win/msvcrt.js';
export * from './win/structs.js';
export * from './win/user32.js';
export * from './win/gdi32.js';
export * from './win/psapi.js';
export * from './cdefine.js';
export * from './cmacro.js';
export * from './win/memmem.js';
export * from './win/scanner.js';
export * from './win/load.js';

// Re-exporting bun-relay here (rather than xffi having its own wrapper
// around it) also pulls it into the module graph as soon as xffi loads --
// bun-relay's own module-load side effect is what actually tries to bind
// the well-known relay port, not anything in this package.
export * from 'bun-relay';

import { addCJitDefault } from './cjit.js';
import { Kernel32Library } from './win/kernel32.js';
import { NtdllLibrary } from './win/ntdll.js';
import { CrtLibrary } from './win/msvcrt.js';
import { User32Library } from './win/user32.js';
import { Gdi32Library } from './win/gdi32.js';
import { PsapiLibrary } from './win/psapi.js';
import {
  Rect,
  PaintStruct,
  Msg,
  WndClassExW,
  MemoryBasicInformation,
  Point,
  SecurityAttributes,
} from './win/structs.js';
import {
  WS,
  CS,
  BARE,
  DT,
  STOCK,
  WM,
  MACROS,
  INFINITE,
  MemoryState,
  MemoryProtection,
  MemoryFreeType,
  ProcessAccess,
  ThreadAccess,
  ThreadCreationFlags,
  ContextFlags,
  ToolhelpSnapshotFlag,
  GetModuleHandleExFlag,
  WaitReturn,
} from './win/defines.js';

// Register global Windows defaults for CJit
addCJitDefault({
  imports: [
    Kernel32Library,
    NtdllLibrary,
    CrtLibrary,
    User32Library,
    Gdi32Library,
    PsapiLibrary,
  ],
  structs: [
    Rect,
    PaintStruct,
    MemoryBasicInformation,
    Point,
    WndClassExW,
    Msg,
    SecurityAttributes,
  ],
  defines: [
    WS,
    CS,
    BARE,
    DT,
    STOCK,
    WM,
    MACROS,
    {
      INFINITE,
      MemoryState,
      MemoryProtection,
      MemoryFreeType,
      ProcessAccess,
      ThreadAccess,
      ThreadCreationFlags,
      ContextFlags,
      ToolhelpSnapshotFlag,
      GetModuleHandleExFlag,
      WaitReturn,
    },
  ],
});
