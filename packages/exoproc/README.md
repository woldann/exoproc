# exoproc

**Modern Windows x64 Out-of-Process Instrumentation & Systems Programming Toolkit for Bun.**

`exoproc` is a modular, high-performance systems engineering framework for Windows x64 running on the **Bun runtime**. It enables memory manipulation, structure compiling, function JIT compilation, and thread redirection/hooking _across process boundaries_ (out-of-process) without DLL injection or remote thread creation.

This package serves as the primary **umbrella package** for the Exoproc ecosystem, re-exporting all sub-modules under a single namespace for maximum convenience.

---

## Installation

```bash
bun add exoproc
```

## Features Included

`exoproc` bundles and re-exports several highly specialized modules:

1. **`bun-winapi` (Process & Memory Management)**: Ergonomic wrappers for Win32 handles, processes, modules, threads, pointer arithmetic, and Toolhelp32 snapshots.
2. **`bun-xffi` (Cross-Process FFI & Structs)**: Define dynamic C-style struct layouts backed 1:1 by remote process memory, compile C code snippets at runtime with JIT (TinyCC), and execute them.
3. **`bun-nthread` (x64 Thread Redirection)**: Redirect execution of running threads in other processes, modifying registers/stack to run function calls (conforming to full x64 ABI) without spawning remote threads.
4. **`bun-minhook` (5-Byte JMP Hooking)**: Standard MinHook-style 5-byte JMP hooks with trampoline generation and automatic far-detour relays.
5. **`bun-nhook` (2-Byte Inline Hooking)**: Zero-allocation, 2-byte inline `EB FE` park-and-simulate hooks.
6. **`bun-capstone` (Disassembler)**: Full TypeScript FFI bindings to the Capstone disassembly engine.

---

## Quick Start (Local Function Hooking)

```typescript
import { MinHook, cmachinecode, Process } from 'exoproc';

// 1. Compile a function using JIT compilation (TinyCC)
const targetFn = cmachinecode({
  returns: 'i32',
  args: ['i32'],
  source: `
    return arg0 * 2 + 1;
  `,
});

async function main() {
  const memory = Process.current.memory;
  const minhook = new MinHook(Process.current.pid);

  console.log(`Original: targetFn(10) => ${targetFn(10)} (Expected: 21)`);

  // 2. Create the hook and resolve trampoline
  const hook = await minhook.create(memory, targetFn);
  const trampolineAddr = hook.trampoline.toBigInt();

  // 3. Define detour function baking in the trampoline address
  const detourFn = cmachinecode({
    returns: 'i32',
    args: ['i32'],
    source: `
      typedef int (*Original)(int);
      Original original = (Original)0x${trampolineAddr.toString(16)}ULL;
      return original(arg0) + 100;
    `,
  });

  // 4. Enable hook
  await hook.enable(detourFn);
  console.log(`Hooked  : targetFn(10) => ${targetFn(10)} (Expected: 121)`);

  // 5. Clean up
  await hook.disable();
  await hook.destroy();
}

main();
```

---

## License

[GNU AGPL-3.0-or-later](https://github.com/woldann/exoproc/blob/main/LICENSE) —
provided for lawful security research and education only.
