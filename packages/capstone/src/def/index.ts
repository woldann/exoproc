import { load, CType, type CImportSymbol } from 'bun-xffi';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const CapstoneDef = {
  cs_version: { args: [CType.ptr, CType.ptr], returns: CType.u32 },
  cs_support: { args: [CType.i32], returns: CType.i32 },
  cs_open: { args: [CType.i32, CType.i32, CType.ptr], returns: CType.i32 },
  cs_close: { args: [CType.ptr], returns: CType.i32 },
  cs_option: {
    args: [CType.u64, CType.i32, CType.u64],
    returns: CType.i32,
  },
  cs_errno: { args: [CType.u64], returns: CType.i32 },
  // Returns `const char*`: declared as `cstring` (not `ptr`) so bun:ffi
  // marshals the result into a JS-usable `CString` automatically.
  cs_strerror: { args: [CType.i32], returns: CType.cstring },
  cs_disasm: {
    args: [CType.u64, CType.ptr, CType.u64, CType.u64, CType.u64, CType.ptr],
    returns: CType.u64,
  },
  cs_free: { args: [CType.ptr, CType.u64], returns: CType.void },
  cs_reg_name: { args: [CType.u64, CType.u32], returns: CType.cstring },
  cs_insn_name: { args: [CType.u64, CType.u32], returns: CType.cstring },
  cs_group_name: { args: [CType.u64, CType.u32], returns: CType.cstring },
} satisfies Record<string, CImportSymbol>;

import { existsSync } from 'fs';

let dllPath = join(__dirname, '../deps/capstone.dll');
if (!existsSync(dllPath)) {
  dllPath = join(__dirname, '../../deps/capstone.dll');
}

export const CapstoneImpl = load({
  dll: dllPath,
  dllFuncs: CapstoneDef,
});
