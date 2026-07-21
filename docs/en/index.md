---
layout: home

hero:
  name: Exoproc
  text: Cross-process instrumentation for Windows x64
  tagline: Work with remote process memory and threads from TypeScript, without DLL injection or CreateRemoteThread.
  actions:
    - theme: brand
      text: Get started
      link: /en/getting-started
    - theme: alt
      text: NThread design
      link: /en/nthread/overview

features:
  - title: NThread
    details: Runs remote calls by parking and redirecting a live target thread.
  - title: Unified accessor model
    details: One read/write/call surface for local, remote, and thread-redirected memory.
  - title: Hook choices
    details: EB FE park-and-simulate or a conventional trampoline/detour.
---

## What these docs cover

Alongside API usage, these docs explain why the system is designed this way: the NThread execution model, Windows x64 ABI boundaries, lifecycle ownership, and the conditions that can crash or stall a target process.

Use Exoproc only for authorized security research, debugging, and education.
