# Exoproc

<p align="center">
  <img src="assets/logo.png" alt="Exoproc" width="200">
</p>

[![CI](https://github.com/woldann/exoproc/actions/workflows/ci.yml/badge.svg)](https://github.com/woldann/exoproc/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](./LICENSE)

**Cross-process instrumentation & JVM runtime reflection for Windows x64, entirely from TypeScript — hook native functions, redirect threads, inspect memory, and interact with live Java/Minecraft processes with zero DLL injection and no `CreateRemoteThread`.**

> [!CAUTION]
> **LEGAL & ETHICAL DISCLAIMER**
> This repository contains software engineering and reverse engineering instrumentation tools. It is provided strictly for educational purposes, security analysis, and malware research.
> Under no circumstances should this toolkit be used to exploit commercial software, target production systems, or bypass endpoint protections in protected software.
> The authors and contributors assume no liability for any misuse, damage, or legal consequences resulting from the execution or alteration of this codebase. By cloning, compiling, or referencing this repository, you agree to assume all risk and responsibility.

---

## What is Exoproc?

Exoproc combines low-level Windows x64 systems instrumentation with high-level runtime reflection into a unified TypeScript programming interface:

### 1. Native Systems & Hooking

- 🧵 **`EB FE` park-and-simulate hooking** ([`bun-nhook`](./packages/nhook)) — Exoproc's flagship technique: an allocation-free 2-byte inline hook. Park any thread that enters the function, hand control to JS, inspect/modify args, force a return value, resume.
- 🪝 **Real trampoline hooking, across process boundaries** ([`bun-minhook`](./packages/minhook)) — a faithful MinHook-style 5-byte `jmp` + trampoline/detour hook, but the target lives in _another process_.
- ⚙️ **Thread redirection, no `CreateRemoteThread`** ([`bun-nthread`](./packages/nthread)) — every remote call in this toolkit runs by suspending and redirecting one of the target's own live threads, never by spawning a new one or injecting shellcode.
- 🧬 **C structs that feel native in TS** ([`bun-xffi`](./packages/xffi)) — `player.health = 100`, `entity.position.x`, nested and all, backed 1:1 by real (even remote) memory.
- ⚡ **`bun:ffi` all the way down** ([`bun-xffi`](./packages/xffi)) — a runtime **TinyCC** JIT for machine code and a **Capstone** disassembler for instruction-level work.

### 2. JVM Reverse Engineering & Scripting

- ☕ **Transparent Java Reflection** ([`bun-njava`](./packages/njava)) — Use `Java.type('java.lang.System')` to interact with remote JVM classes, call static/instance methods, and access fields directly from TypeScript.
- 🛡️ **Seamless Exception Mapping** — Java `Throwable` exceptions (`ClassNotFoundException`, `InvocationTargetException`, etc.) are caught and unwrapped into standard JavaScript `Error` objects, catchable via standard `try / catch`.
- 🔄 **Nashorn Compatibility (Java 8 – 21+)** — Nashorn-compatible shims (`Java.type`, `Java.from`, `Java.to`) that function even on modern runtimes where Nashorn was removed.
- 🤖 **Minecraft Automation & AI Agents** ([`exoproc-tool`](./packages/exoproc-tool)) — Graph-based universal menu pathfinder (`/navigate`), in-game entity/inventory introspection, and Model Context Protocol (MCP) server for autonomous AI gameplay agents.

---

## Quick Example: Running Scripts against JVM Targets

Write automation scripts in clean TypeScript:

```ts
import { Java } from 'exoproc';

// 1. Read Java version from target JVM process
const System = Java.type('java.lang.System');
print(`[+] Java Version: ${System.getProperty('java.version')}`);

// 2. Access JVM classes or handle missing APIs cleanly
try {
  const Nashorn = Java.type('jdk.nashorn.api.scripting.NashornScriptEngine');
  print('[+] Nashorn engine ready');
} catch (err: any) {
  print(`[-] Error: ${err.message}`);
}
```

Execute instantly against the target process:

```bash
exoproc run script.ts
```

Output:

```text
[+] Java Version: 21.0.8
[-] Error: jdk.nashorn.api.scripting.NashornScriptEngine
```

---

## Workspace Packages

| Package                                     | Description                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`exoproc`](./packages/exoproc)             | High-level client library, daemon orchestration, and Minecraft bridges             |
| [`exoproc-tool`](./packages/exoproc-tool)   | CLI commands (`run`, `navigate`, `status`) and Model Context Protocol (MCP) server |
| [`bun-njava`](./packages/njava)             | JNI & Agent reflection bridges, dynamic class proxies (`Java.type`), and mappings  |
| [`njava-agent`](./packages/njava-agent)     | In-process high-speed Java bytecode injection and RPC agent                        |
| [`njava-runtime`](./packages/njava-runtime) | Modular Java execution contexts and Nashorn compatibility layer                    |
| [`bun-nhook`](./packages/nhook)             | Allocation-free 2-byte inline function hook (`EB FE` park & simulate)              |
| [`bun-minhook`](./packages/minhook)         | 5-byte JMP relative trampoline detour hook across process boundaries               |
| [`bun-nthread`](./packages/nthread)         | Thread hijacking and context redirection engine                                    |
| [`bun-xffi`](./packages/xffi)               | Low-level C-ABI types, memory accessors, and runtime TinyCC JIT                    |
| [`bun-winapi`](./packages/winapi)           | Typed Win32 API handles, memory management, and process snapshots                  |
| [`@exoproc/simulate`](./packages/simulate)  | Standalone in-browser x86_64 virtual machine, OS simulation kernel, and debugger   |
| [`docs`](./apps/docs)                       | Next.js 16 + Fumadocs documentation site and interactive debugging labs            |

---

## Requirements

- **Bun ≥ 1.3.11**
- Windows x64 — or Linux with Wine for development (the full test suite runs under Wine)

## Quick Start

```bash
bun install          # install dependencies & Capstone assets
bun run build        # build all monorepo packages
bun test             # run unit test suite
bun run web          # start local documentation website (http://localhost:3000)
```

See [`examples/`](./examples) for standalone, runnable demo projects against real target processes.

## Documentation

Full Turkish and English documentation, interactive debugger labs, and architecture guides are available in [`apps/docs`](./apps/docs) or via:

```bash
bun run web
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, the Wine testing workflow, and coding standards.

## Security

Found a vulnerability? Please see [SECURITY.md](./SECURITY.md) for how to report it responsibly instead of opening a public issue.

## License

[GNU AGPL-3.0-or-later](./LICENSE) — Copyright (C) 2026 Serkan Aksoy. Provided for lawful security research and education only; you are responsible for how you use it. Chosen deliberately over a permissive license: any modified version — including one run as a network service — must have its corresponding source made available to its users under the same terms.
