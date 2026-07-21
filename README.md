# Exoproc

<p align="center">
  <img src="assets/logo.png" alt="Exoproc" width="200">
</p>

[![CI](https://github.com/woldann/exoproc/actions/workflows/ci.yml/badge.svg)](https://github.com/woldann/exoproc/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](./LICENSE)

**Cross-process instrumentation for Windows x64, entirely from TypeScript —
hook functions, redirect threads, and read/write memory _inside another
process_, with no injected DLL and no `CreateRemoteThread`.**

> [!CAUTION]
> **LEGAL & ETHICAL DISCLAIMER**
> This repository contains software engineering and reverse engineering instrumentation tools. It is provided strictly for educational purposes, security analysis, and malware research.
> Under no circumstances should this toolkit be used to exploit commercial software, target production systems, or bypass endpoint protections in protected software.
> The authors and contributors assume no liability for any misuse, damage, or legal consequences resulting from the execution or alteration of this codebase. By cloning, compiling, or referencing this repository, you agree to assume all risk and responsibility.

---

## Demo

![Exoproc demo](assets/demo.gif)

`nhook` streaming real keystrokes out of a freshly spawned `notepad.exe` —
see [`examples/notepad-keystroke-hook/`](./examples/notepad-keystroke-hook).

---

## Why you might care

- 🧵 **`EB FE` park-and-simulate hooking** ([`bun-nhook`](./packages/nhook)) —
  Exoproc's flagship technique: an allocation-free 2-byte inline hook. Park
  any thread that enters the function, hand control to JS, inspect/modify
  args, force a return value, resume.
- 🪝 **Real trampoline hooking, across process boundaries**
  ([`bun-minhook`](./packages/minhook)) — a faithful MinHook-style 5-byte
  `jmp` + trampoline/detour hook, but the target lives in _another process_.
- ⚙️ **Thread redirection, no `CreateRemoteThread`**
  ([`bun-nthread`](./packages/nthread)) — every remote call in this toolkit
  runs by suspending and redirecting one of the target's own live threads,
  never by spawning a new one or injecting machineCode.
- 🧬 **C structs that feel native in TS** ([`bun-xffi`](./packages/xffi)) —
  `player.health = 100`, `entity.position.x`, nested and all, backed 1:1 by
  real (even remote) memory.
- ⚡ **`bun:ffi` all the way down** ([`bun-xffi`](./packages/xffi)) — a
  runtime **TinyCC** JIT for machineCode and a **Capstone** disassembler for
  instruction-level work.

Each package's own README has the code — quick starts, the full API surface,
and how the pieces compose.

---

## Requirements

- **Bun ≥ 1.3.11**
- Windows x64 — or Linux with Wine for development (the whole test suite runs under Wine)

## Quick start

```bash
bun install          # also downloads Capstone deps
bun run build
bun test
```

See [`examples/`](./examples) for standalone, runnable demo projects against
a real target process.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, the Wine
testing workflow, and coding standards.

## Security

Found a vulnerability? Please see [SECURITY.md](./SECURITY.md) for how to
report it responsibly instead of opening a public issue.

## License

[GNU AGPL-3.0-or-later](./LICENSE) — Copyright (C) 2026 Serkan Aksoy. Provided
for lawful security research and education only; you are responsible for how
you use it. Chosen deliberately over a permissive license: any modified
version — including one run as a network service — must have its
corresponding source made available to its users under the same terms.
