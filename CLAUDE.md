# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

This is an **experimental systems diagnostics and multithreading library** for Windows x64. The goal is to implement reliable **function redirection and context delegation** for Wine compatibility testing, application instrumentation, and runtime profiling, without injecting a DLL or using `CreateRemoteThread`. All techniques explored here are standard debugger development, application profiling, and diagnostics methods.

**Current primary goal:** Make `nhook` reliably install and remove 2-byte inline redirection points (`EB FE`) on arbitrary x64 functions in a live Windows process. Displaced instructions (at most 2, and when 2, the first is always 1-byte) are **simulated** via Capstone disassembly rather than copied into a remote trampoline buffer — so no remote memory allocation is needed for the redirection. Everything else in the stack (xffi, winapi, nthread) exists to support this goal.

## Commands

```bash
# Install dependencies (also runs download-deps postinstall)
bun install

# Build all packages
bun run build
bun run build:clean   # clean first, then build

# Run all tests (Linux host — most tests require Wine)
bun test

# Run tests under Wine (Windows x64 target)
bun-wine test                                      # all tests
bun-wine test tests/xffi/stub.test.ts        # single file
bun-wine run scripts/build.ts                      # any bun command

# Custom bun-windows path (default: $HOME/Downloads/bun-windows-x64)
BUN_WIN_DIR=/other/path bun-wine test

# Type checking
bun run typecheck   # bun x tsc --noEmit -p tests/tsconfig.json
# NOTE: the root tsconfig.json has "files": [] and no "include" -- it exists only
# to hold project references for `tsc --build`. Running `tsc --noEmit` against it
# directly (no -p, no -b) checks zero files and silently reports no errors.
# tests/tsconfig.json is the actual comprehensive entry point (packages + tests).

# Lint / format
bun run lint
bun run lint:fix
bun run format
```

## Runtime Requirements

- **Minimum Bun version: 1.3.0.** Bun 1.2.x has a bug where `cc()` callables count toward an internal `BunCFunction` assertion limit; `cimport()` generates enough callables to exceed it and causes a process crash. Bun 1.3.0 removes this limit.

## Architecture

This is a **bun workspace monorepo** targeting **Windows x64** runtime. Development happens on Linux; nearly all tests run under Wine. Packages export directly from TypeScript source (`"main": "./src/index.ts"`) — there is no transpile step at dev time.

### Package dependency graph

```
utils          (logger, shared error helpers)
  ^
xffi           (low-level FFI foundation — no bun-winapi dependency)
  ^
winapi         (Win32 process/memory/thread/module/snapshot APIs + Hook base classes)
  ^
nthread        (x64 thread redirection — no machineCode injection, uses stubs;
  ^             also IndirectNThreadHostAccessor = indirect chain over an NThread backend)
nhook          (function redirection: 2-byte EB FE park+simulate via thread redirection + Capstone)

minhook        (function redirection: 5-byte JMP + trampoline/detour; needs allocNear.
                depends on winapi + capstone; NOT on nthread — accepts any IMemoryAccessor)

capstone       (Capstone disassembler bindings — standalone)
```

### xffi

The foundational layer. Key concepts:

- **`ffi` / `sizeof` / `alignmentof` / `compileStruct`** (`ffi.ts`) — C-ABI type system for Win64. `sizeof` and `alignmentof` understand primitive aliases (`HANDLE`, `DWORD`, etc.), arrays, nested structs, and unions.
- **`IMemoryAccessor` / `ISyncMemoryAccessor`** (`iaccessor.ts`) — interfaces all accessors implement. Methods: `read`, `write`, `alloc`, `allocNear`, `free`, `protect`, `query`, `scan`, `call`, `machineCode` (+ their `*Sync` twins). `accessor.machineCode(sc)` injects a `CMachineCode` and returns its remote address.
- **`AbstractMemoryAccessor`** (`accessor.ts`) — base class providing helper scalar R/W, debug wrapping, and scan utilities. Subclass this for custom accessors.
- **`MiddlewareAccessor` / `InittableMiddlewareAccessor`** (`middleware-accessor.ts`) — wraps another accessor; `InittableMiddlewareAccessor` adds lazy async `init()`/`deinit()` lifecycle. **Every** memory op (`read`, `write`, `alloc`, `free`, `protect`, `query`, `call`, **and `machineCode`**) is guarded by `!isInitializing → await this.init()` — each has an `XAfterInit` twin that forwards to the backend. (`machineCode` was historically missing this guard, so a `machineCode()`-first call routed down the chain before init: the backend wasn't hijacked/ready yet and `MsvcrtDependentMiddlewareAccessor.onInit`'s msvcrt check spuriously failed. Any new op MUST have the same guard.) `initNext()` skips backends that are already initializing (`!next.isInitializing` guard) to prevent deadlocks when `root.*` is called from within `onInit()`.
- **`allocNear` / `allocNearSync`** (`iaccessor.ts` + `accessor.ts`, pure helpers in `near-alloc.ts`) — accessor **method** (not a standalone fn) that finds/commits free memory within ±~2GB of a target address (for a 5-byte rel32 JMP), by walking `query()` results outward and honoring 64KB allocation granularity. The generic impl on `AbstractMemoryAccessor` uses `this.query()`/`this.alloc()`, so it composes cross-process for free through `CallRedirectorAccessor` (which overrides those). `CallRedirectorAccessor` also has an explicit **region-aware** `allocNear` override (jumps by `RegionSize` instead of naive 64KB steps) since each probe there is an expensive remote `call`.
- **`HostAccessor`** (`host-accessor.ts`) — orchestrating root accessor; initializes all `InittableMiddlewareAccessor` instances in the backend chain via `initNext()`.
- **`BootstrapHostAccessor`** (`middleware-accessor.ts`) — solves circular init dependencies. Starts with `target = this` (routes directly through its own backend, bypassing any middleware above), then after `initNext()` switches `target = root`. Required as root for `NamedPipeCallableAccessor` when `CallRedirectorAccessor` is in the chain above it.
- **`NamedPipeCallableAccessor`** (`middleware-accessor.ts`) — executes remote calls via a named pipe machineCode loop rather than `CreateRemoteThread` per call. The remote machineCode thread loops forever reading `CallRequest` structs (144 bytes: targetFunc addr + arg count + 16 arg slots) and writing back 8-byte results. Root **must** be `BootstrapHostAccessor` — `onInit` uses `this.root.*` for alloc/write/machineCode/call; `this.backend` is only used in the `call` override escape hatch for the initial loop machineCode invocation (scAddress bypass → `this.backend.call`).
- **`CallRedirectorAccessor`** (`middleware-accessor.ts`) — redirects `alloc/free/protect/query` to run inside the target process via `this.root.call(VirtualAlloc/VirtualFree/VirtualProtect/VirtualQuery)`.
- **`IndirectCallRedirectorAccessor`** (`middleware-accessor.ts`) — extends `CallRedirectorAccessor`; for `READWRITE` allocations without a specific address uses `MsvcrtImpl.malloc`/`MsvcrtImpl.free` instead of `VirtualAlloc`. Tracks malloc blocks locally to intercept `free`/`protect`/`query` on them.
- **`waitAsync(handle, timeoutMs)`** (`waiter.ts`) — non-blocking wait for a HANDLE to signal: polls `WaitForSingleObject(handle, 0)` in a loop with a backoff ramp (a few zero-delay instant checks, then 1ms up to a 10ms cap), yielding to the event loop via `setTimeout` between checks. No separate thread/Worker — every check is a real OS query, never a blocking wait, so the JS event loop is never wedged. Replaces the old `callAsync`/`QueueUserWorkItem`-based async call mechanism (`CFunction.callAsync`), which is gone entirely — it required JIT-compiled thread-pool-proc code and a threadsafe `JSCallback`, and hung indefinitely on real Windows because `QueueUserWorkItem`'s worker threads are native NT thread-pool threads Bun has no knowledge of (threadsafe callbacks are only reliable from a Bun `Worker`, per Bun's own docs). `waitAsync` sidesteps the whole problem by never leaving the calling thread.
- **`RemoteCallableMemoryAccessor`** (`callable-accessor.ts`) — creates a remote thread via `CreateRemoteThread` for each call. `call()` awaits `waitAsync()` on the thread handle so the event loop can process I/O while waiting instead of blocking.
- **`Stub` / `registerStub`** (`stub.ts`) — locates existing byte patterns (e.g. `C3` ret, `EB FE` sleep) in system DLLs. Stubs are shared across all processes at identical addresses, so they require no remote allocation. `shouldCloneForAccessor()` returns `false` for stubs. Internally built on `createMachineCode` so they are directly callable via a local accessor.
- **`createMachineCode(address, sig, bytes, callable?)`** (`cmachinecode.ts`) — wraps a known address+bytes+signature into a `CMachineCode`. `callable` defaults to a `BunCFunction` binding; pass a throwing function for remote-only machineCode. Used as the base for `cmachinecode()`, `createRemoteMachineCode()`, and `makeStub()`.
- **`CMachineCode` / `cmachinecode()`** (`cmachinecode.ts`) — user-supplied machineCode that _does_ require remote allocation. `shouldCloneForAccessor()` returns `true`. `cloneForAddress(addr)` returns a `CMachineCode` already at a remote address (`shouldCloneForAccessor() = false`).
- **`cimport`** (`cimport.ts`) — wraps Win32 symbols with `BunCFunction` bindings directly (no intermediate C `_wrapper` functions). `createCFunction(..., undefined)` creates the `BunCFunction`; dummy symbols get a throwing callable.
- **`CJit` / `cjitopen`** (`cjit.ts`) — JIT-compiles C snippets to a shared library at runtime using `bun:ffi` `cc()`. On import, `index.ts` registers default Win32 libraries (kernel32, ntdll, msvcrt, user32, gdi32, psapi) and common structs/defines into `cjitDefaults`.
- **`struct` / `union` / `Struct`** (`struct.ts`) — TypeScript class-based struct definitions with auto-computed offsets.
- **`win/`** — Pre-built `CImportLibrary` definitions for kernel32, ntdll, msvcrt, user32, gdi32, psapi, plus Win32 struct/define constants.

#### Middleware chain composition pattern

```
BootstrapHostAccessor (root, pid, outerHost)
  └─ .backend = NamedPipeCallableAccessor (backend, root=bootstrap)
                  └─ .backend = RemoteCallableMemoryAccessor(pid)

CallRedirectorAccessor (or Indirect variant) (backend=pipe, root=bootstrap)
outerHost.backend = accessor  ← wired after construction
```

During `NamedPipeCallableAccessor.onInit()`: bootstrap `target=this` → `root.alloc()` routes through `pipeAccessor` (isInitializing→skip init) → `RemoteCallableMemoryAccessor.alloc()`. After init: bootstrap `target=outerHost` → full chain active.

### winapi

Ergonomic wrappers over `xffi` Win32 calls:

- `Process`, `Module`, `Thread`, `Handle`, `Snapshot` — typed wrappers for Win32 handles and enumeration.
- `NativePointer` / `SyncNativePointer` — pointer types with address arithmetic.
- **Hook base classes** (`hook.ts`) — the OOP-handle model shared by `nhook` and `minhook`. **The hook API never takes a raw address** — it deals in typed function objects: `HookTarget = CFunction` (the function to hook; its `.args.length` is the default `argCount`) and `HookDetour = CFunction | CMachineCode` (a `CMachineCode` is injected on demand — `resolveDetour` in minhook — a plain `CFunction` is used as-is). `Hook.target` is the `CFunction`; `hook.address` (getter) resolves it to the patch address. `Hook` (abstract class) is a **thin forwarder handle**: it captures `memory` + `manager` at `create()` time, and `hook.enable()` / `hook.disable()` / `hook.destroy()` / `hook.toggle()` just forward into the manager (`manager.enable(memory, hook)` — that's where the real logic lives). Base `Hook.enable()` takes **no** detour (patch hooks don't redirect); `hook.argCount` is a getter over `target.args.length` (no stored field). Only `DetourHook` overrides `enable(detour?)`: its forwarder owns the remember/reuse logic (`if (!detour) detour = this.detour; else this.detour = detour`) and holds `detour?: CFunction` (the last detour, kept as a `CFunction`) — so an omitted detour reinstalls the last one, and the manager just installs whatever it's handed (throws if none). `PatchHook` adds `originalBytes`/`affectedLength`. `HookManager<T>` is a registry/factory (`create`/`register`/`forget`/`get`/`has`/`enableAll`/`disableAll`/`destroyAll` + the abstract `enable`/`disable`/`destroy` impls; `get`/`has`/`forget` also take a `CFunction`, not an address); `PollableHookManager` adds `poll`/`resume` (thread-parking styles); `InterceptHookManager` adds `callOriginal`/`getOriginalArgs`. Concrete handles (`NHookInstance`, `MinHookInstance`) are pure data — they never override the forwarders. Drive hooks via the handle, not `manager.enable(mem, hook)`.

### nthread

Thread redirection without `CreateRemoteThread` or machineCode allocation.

**Flow:** suspend target thread → save context → redirect `RIP` to a `jmp <reg>` stub → set that register to a `jmp $` (sleep) stub → resume → wait for thread to park at sleep stub → execute calls by setting `RIP`/`RCX`/`RDX`/`R8`/`R9` (and `XMM0`–`XMM3` for float/double args) and resuming → wait for return via a `ret` stub return chain.

**Argument passing (Windows x64 ABI):**

- Args 1–4: `f32`/`f64` → `XMM0`–`XMM3` (+ GPR bit-cast mirror for variadic compat); `int`/`ptr` → `RCX`/`RDX`/`R8`/`R9`.
- Args 5+: written to `[callRsp + 40 + (i-4)*8]`. NThread allocates a per-N-stack-arg stub (`add rsp, (0x28+N*8); ret`) in the remote process on first use and restores the original return chain in `finally` after each call. No hard cap on argument count.

**Return values:** `f32` → `XMM0` low 32 bits; `f64` → `XMM0` low 64 bits; everything else → `RAX`. `ContextFlags` includes `FLOATING_POINT` so the kernel saves/restores XMM state.

Key public stub accessors (synchronous, must await `whenReady()` first):

- `getRandomSleepAddress()` — `EB FE` (jmp $)
- `getRandomPushretAddress()` — push reg + ret
- `getRandomJumpAddress()` — jmp reg
- `getRandomRetAddress()` — `C3`
- `getRandomAddRsp28RetAddress()` — `add rsp, 0x28; ret`

**`NThread` is itself an `ICallableMemoryAccessor`** (extends `InittableMiddlewareAccessor`): read/write/alloc forward to its backend (`RemoteCallableMemoryAccessor`), only `call` is overridden to run via hijacking. During `onInit()` it issues bootstrap stub calls via `this.root`, so its root must wrap `NThread` itself (the `RedirectorHostAccessor` → `redirector.target = <the host>` cycle-breaker).

- **`IndirectNThreadHostAccessor`** (`indirect-nthread-host-accessor.ts`) — `extends IndirectCallableAccessor` with an `NThread` as the base callable backend instead of `RemoteCallableMemoryAccessor`. So the full indirect chain (IndirectCallRedirector malloc/memset + machineCode pool + memcmp/file-transfer + marshalling) runs with **every** remote op executed by redirecting a live thread — no `CreateRemoteThread`, no injected pipe-loop. Constructor: `new IndirectNThreadHostAccessor(pid, threadId, options?)`; it wires `nthreadRoot.target = this` (same pattern as `redirector.target = indirect` in the nthread integration test). Proven cross-process with `minhook` (see below), verified by an independent `RemoteCallableMemoryAccessor` reading the installed JMP via raw `ReadProcessMemory`.

### nhook

Cross-process function hooking built on `nthread` and Capstone disassembly for instruction-level trampoline generation. **This is the primary deliverable of the project.**

**Hooking strategy — 2-byte inline hook:**

- Writes `EB FE` (`jmp $`) at the target function address to park any thread that enters it.
- Uses `nthread` to redirect a parked thread, redirect execution to a handler, and resume.
- Because `EB FE` is only 2 bytes, at most 2 instructions are displaced. When 2 instructions are displaced, the **first** must be exactly 1 byte (if it were longer it would cover both bytes alone, leaving only 1 displaced instruction) — making simulation trivial. Instead of allocating a remote trampoline buffer and copying/relocating bytes there, nhook **simulates** the displaced instructions directly (using Capstone to decode them). No remote memory allocation needed for the trampoline.
- Enable/disable patches/unpatches the 2-byte sequence at the hook site; no DLL injection, no `CreateRemoteThread` per call.

### minhook

The **other** hooking strategy — a real MinHook-style trampoline/detour hook (5-byte relative JMP), parallel to nhook's allocation-free 2-byte park+simulate. Depends on `winapi` + `capstone`, **not** `nthread` — it accepts any `IMemoryAccessor`, so it works over `IndirectNThreadHostAccessor` (thread redirection backend), a `CreateRemoteThread`-based indirect chain, or a local accessor equally. Don't conflate the two strategies; each has different tradeoffs.

**Hooking strategy — 5-byte JMP + trampoline:**

- `buildTrampoline` (`trampoline.ts`) reads the target prologue, disassembles (Capstone), accumulates instructions until `>= 5` bytes are covered, refuses to hook if any stolen instruction is a branch, relocates RIP-relative operands, and `allocNear`s a trampoline (stolen bytes + `jmp rel32` back into the unmodified body) within rel32 reach of the target. `originalBytes` MUST be de-tainted via `Buffer.from(Array.from(prologue.subarray(...)))` — a raw read-backed buffer's association makes `disable()`'s restore write silently no-op on cross-process (ReadProcessMemory-backed) reads (same bug nhook's `create()` had).
- Two-phase `create(target)` / `enable(detour)`: `create()` builds the trampoline only (target untouched), so `hook.trampoline` is known before the caller compiles their detour (bake it in as a literal). `target` is a `CFunction`; the detour is a `CMachineCode` (injected on demand via `resolveDetour` → `memory.machineCode`, unless already-injected) or a `CFunction` — never a raw address. `enable()` is idempotent + hot-swappable (re-call with a different detour to re-target the JMP).
- **Far-detour relay:** if the resolved detour is outside the 5-byte JMP's rel32 range (e.g. an existing kernel32 function like `GetCurrentThreadId`, which under Wine sits ~17TB from an injected target), `enable()` `allocNear`s a 14-byte relay stub near the target (`jmp qword ptr [rip+0]; <abs u64>`), points the JMP at the relay, and the relay absolutely jumps to the far detour (`MinHookInstance.relay`, lazily allocated, rewritten on hot-swap, freed in `destroy()`). Near detours still get a direct JMP. This is real MinHook's gateway/relay behavior; it's what lets _any_ `CFunction` be a detour regardless of distance. Drive via the handle: `const h = await minhook.create(mem, targetFn); await h.enable(detourSc); await h.disable(); await h.destroy();` (see the Hook base classes in `winapi`). Verified cross-process by `tests/minhook/minhook-indirect-nthread.test.ts`, which injects a function into ping.exe, hooks it over `IndirectNThreadHostAccessor`, and _invokes_ it on the hijacked thread — a passthrough detour returns the original value (proving the trampoline), a `return 1234` detour overrides it (proving execution) — cross-checked by an independent raw `ReadProcessMemory` read of the installed JMP.

### Testing

- Tests live in `tests/<package>/`.
- `tests/setup.ts` is the global prelude (loaded via bun config); loads `.env` via `dotenv` and provides an `afterAll` grace period for Wine thread cleanup.
- `tests/helpers.ts` provides `TestProcess` (spawns `ping.exe` via Wine directly in its constructor, fixed 60s duration; `pid`/`handle` are plain instance fields, no `start`/`startPing` methods).
- Most tests are integration tests requiring a live Windows process under Wine.
- The Wine suite can be flaky; run individual test files when debugging failures.
- Commits: use `--no-verify` to skip the ESLint pre-commit hook (lint errors exist in the codebase that are pre-existing).

#### Local `CreateThread`/`VirtualAlloc` unreliable under GitHub Actions (issue #5)

Two separate, still only partially understood bugs reproduce **only** on GitHub Actions' virtualized Wine runners (never on real hardware, regardless of Wine version):

- `Native.Thread.create()` (raw `CreateThread`, spawning a thread **in the current process**) delivers a corrupted `lpParameter` to the new thread's entry point (arrives as `-1`/garbage) even though `CreateThread` itself reports success.
- `Kernel32Impl.VirtualAlloc()` called directly (local process, executable protection) fails with `GetLastError() == 87` (`ERROR_INVALID_PARAMETER`) for a still-unknown reason.

Neither is a general "bun:ffi argument N is broken" bug — `CreateRemoteThread` (targeting a **different** process) reliably delivers every argument, including its own 4th arg and its stack-passed `lpParameter`; `RemoteCallableMemoryAccessor`'s entire calling mechanism depends on this working, and it demonstrably does in CI. Whatever's wrong is specific to same-process thread/memory setup on GitHub's runners specifically.

**The fix used throughout this suite: don't call these locally at all.** Spawn a real process (`new TestProcess()` — constructs and spawns `ping.exe` directly, `pid`/`handle` are plain fields, no separate start call), grab one of its existing threads (`Native.Thread.getThreads(pid)[0]`), and drive everything through `IndirectNThreadHostAccessor(pid, tid)` instead — `memory.call()`/`memory.alloc()` hijack that thread's register context directly (`SetThreadContext`/`ResumeThread`), bypassing `CreateThread`/local `VirtualAlloc` entirely. This is the pattern in `minhook.test.ts`, `minhook-indirect-nthread.test.ts`, and `nhook.test.ts` (both describe blocks) — any new test that needs a fresh thread or executable scratch memory should follow it rather than reaching for `Native.Thread.create()`/`Kernel32Impl.VirtualAlloc()` locally.

If a test genuinely needs a real thread to enter a hooked function as its actual entry point (to prove nhook's/minhook's park-and-simulate mechanism against **real** execution, not a manufactured call), bake any argument in as a compile-time literal in a tiny `cmachinecode()` wrapper that calls the real target, instead of relying on `lpParameter` — see `makeThreadEntry()` in `nhook.test.ts`.

Do **not** try routing local scratch-thread setup through an existing system `Stub` (e.g. `getRandomSpinStub()`) as a shortcut around the `VirtualAlloc` bug — this was tried and reproducibly segfaulted Bun itself (deterministic crash inside `kernelbase.dll`, confirmed on 2 independent CI runs, same crash hash both times) for reasons never fully diagnosed. Reverted; the cross-process pattern above is the actual fix, and `tests/helpers.ts`'s old `spawnLoopThread`/`cleanupThread`/`SpawnedThread` (the local-thread helpers this bug lived in) were removed once `nhook.test.ts` no longer needed them.

#### Intermittent Bun segfault on the full local Wine suite

Running the entire suite (`bun-wine test` with no path filter), or even just `tests/xffi`, can occasionally crash Bun itself partway through — the process prints "Bun has crashed... this indicates a bug in Bun, not your code" and exits (sometimes also firing an automatic, redacted crash report to `bun.report` via Wine's `powershell.exe` stub, which doesn't actually implement HTTP and likely never sends anything). Confirmed via direct bisection (stashing `cfunction.ts` and re-running the identical `tests/xffi` scope on both versions) that this is **not tied to any specific package's code** — it reproduces at a comparable low rate (roughly 1-in-4 to 2-in-5 per run) on both an unmodified tree and after substantial changes to `cfunction.ts`. Distinct crash sites have been observed so far:

- Right around `named-pipe-callable.test.ts`/`cmachinecode.test.ts`'s "remote" sub-tests, which spawn a real `ping.exe` child process and inject via `CreateRemoteThread` + named pipes.
- **Root-caused and fixed:** right after `xffi/accessor.test.ts`'s "should route remote process operations through a real process" test (and identically in `scanner.test.ts`'s first `RemoteProcessMemoryAccessor` test) printed `(pass)`, during teardown of that test. This recurred at the _exact same spot_ every time, which pointed at something deterministic rather than a genuine engine race. The actual bug: both tests constructed `new RemoteProcessMemoryAccessor(tp.pid, { handle: tp.handle })` (reusing `TestProcess`'s handle) without `closeHandle: false`, so `RemoteMemoryAccessor.close()` (`ownsHandle` defaults to `true`) called `CloseHandle(tp.handle)` — and then `tp.stop()` called `CloseHandle(tp.handle)` again on the same already-closed handle. A double `CloseHandle` on the same handle value is undefined behavior, and apparently fatal under Wine specifically. Fixed by passing `closeHandle: false` in both places, matching the pattern already correctly used in `file-transfer-accessor.test.ts`/`write-only.test.ts`. **Any test that constructs an accessor with `{ handle: tp.handle }` and separately calls `tp.stop()` must pass `closeHandle: false`** — otherwise it's this same double-free bug waiting to happen again.

The first remains a timing-sensitive race in Wine's own emulation rather than a logic bug in this repo. If you hit it, just re-run — it isn't a regression from your change unless you can reproduce it going from 0 crashes to consistently crashing on the same test file in isolation on your branch specifically (verified against an unmodified tree first).

### Adding a new workspace package

When creating a package under `packages/<name>`:

1. Add `"<name>": ["packages/<name>/src/index.ts"]` to `paths` in the root `tsconfig.json`.
2. Add `{ "path": "./packages/<name>" }` to `references` in the root `tsconfig.json`.
3. Create `packages/<name>/tsconfig.json` extending `../../tsconfig.json` (copy from an existing package).
4. If any test files import it by package name, the steps above are required — Bun 1.3.0 uses tsconfig paths for workspace resolution.
