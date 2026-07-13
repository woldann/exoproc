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

This is a **bun workspace monorepo** targeting **Windows x64** runtime. Development happens on Linux; nearly all tests run under Wine. Every package's `package.json` `"main"` actually points to `"./dist/index.js"` (a built artifact), **not** `./src/index.ts` -- see "Cross-package `src/` imports can silently resolve to a stale `dist/` build" below for why this matters and when it bites.

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
- **`BootstrapHostAccessor`** (`middleware-accessor.ts`) — solves circular init dependencies. Starts with `target = this` (routes directly through its own backend, bypassing any middleware above), then after `initNext()` switches `target = root`. Required as root for any `InittableMiddlewareAccessor` (e.g. `CallRedirectorAccessor`) whose `onInit` needs `this.root.*` before the full chain above it is wired up.
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
  └─ .backend = RemoteCallableMemoryAccessor(pid)

CallRedirectorAccessor (or Indirect variant) (backend=RemoteCallableMemoryAccessor, root=bootstrap)
outerHost.backend = accessor  ← wired after construction
```

During `CallRedirectorAccessor.onInit()`-driven calls: bootstrap `target=this` → `root.call()` routes through `RemoteCallableMemoryAccessor` directly (isInitializing→skip init). After init: bootstrap `target=outerHost` → full chain active.

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
- **Far-detour relay:** if the resolved detour is outside the 5-byte JMP's rel32 range (e.g. an existing kernel32 function like `GetCurrentThreadId`, which under Wine sits ~17TB from an injected target), `enable()` `allocNear`s a 14-byte relay stub near the target (`jmp qword ptr [rip+0]; <abs u64>`), points the JMP at the relay, and the relay absolutely jumps to the far detour (`MinHookInstance.relay`, lazily allocated, rewritten on hot-swap, freed in `destroy()`). Near detours still get a direct JMP. This is real MinHook's gateway/relay behavior; it's what lets _any_ `CFunction` be a detour regardless of distance. Drive via the handle: `const h = await minhook.create(mem, targetFn); await h.enable(detourSc); await h.disable(); await h.destroy();` (see the Hook base classes in `winapi`). Verified cross-process by `tests/minhook/minhook-indirect-nthread.test.ts`, which injects a function into a spawned `TestProcess` target, hooks it over `IndirectNThreadHostAccessor`, and _invokes_ it on the hijacked thread — a passthrough detour returns the original value (proving the trampoline), a `return 1234` detour overrides it (proving execution) — cross-checked by an independent raw `ReadProcessMemory` read of the installed JMP.

### Testing

- Tests live in `tests/<package>/`.
- `tests/setup.ts` is the global prelude (loaded via bun config); loads `.env` via `dotenv` and provides an `afterAll` grace period for Wine thread cleanup.
- `tests/helpers.ts` provides `TestProcess` (spawns `ping.exe` directly in its constructor via `bun-nshm`'s de-elevated `spawnDeElevatedProcess` -- the same `CreateProcessAsUserA` mechanism `nshm`'s own dummy relay process uses, not `child_process.spawn` -- fixed 60s duration; `pid`/`handle` are plain instance fields, no `start`/`startPing` methods). **Must stay `ping.exe`** (or another process whose threads periodically return to user mode on their own): `nthread`'s hijack redirects RIP via `SetThreadContext`, which only takes effect once the hijacked thread actually returns to user mode, so it requires a target thread that does so on a short cycle (`ping.exe`'s ~1s timer wait between echoes). A thread parked in an indefinite, event-driven kernel wait -- e.g. `cmd.exe`'s main thread blocked in `ReadConsoleInput` with nothing ever typed into it -- never returns on its own, so the hijack times out waiting for it to land at the sleep stub. Confirmed by trying it: swapping this default to `cmd.exe` (to sidestep the `ping.exe` networking-stack crash described below) made every `IndirectNThreadHostAccessor`-based test (`nshm`, `nthread`, `minhook`/`nhook`) fail with `CallTimeoutError`/`WAIT_TIMEOUT`, while `xffi`-only tests (which don't hijack an existing thread) stayed green -- reverted. `TestNotepadProcess` (spawns `notepad.exe`) is a separate case, for tests/examples needing a real visible window.
- Most tests are integration tests requiring a live Windows process under Wine.
- The Wine suite can be flaky; run individual test files when debugging failures.
- Commits: use `--no-verify` to skip the ESLint pre-commit hook (lint errors exist in the codebase that are pre-existing).

#### `CreateThread`/`CreateRemoteThread`/`VirtualAlloc` on a freshly-created thread unreliable under GitHub Actions (issue #5)

Several related, still only partially understood bugs reproduce **only** on GitHub Actions' virtualized Wine runners (never on real hardware, regardless of Wine version), all tracing back to one theme: **WinAPI/CRT calls (`VirtualAlloc`, `malloc`, `fopen`, ...) executed on a thread that was just created are unreliable, whether that thread is local or remote:**

- `Native.Thread.create()` (raw `CreateThread`, spawning a thread **in the current process**) delivers a corrupted `lpParameter` to the new thread's entry point (arrives as `-1`/garbage) even though `CreateThread` itself reports success.
- `Kernel32Impl.VirtualAlloc()` called directly (local process, executable protection) fails with `GetLastError() == 87` (`ERROR_INVALID_PARAMETER`) for a still-unknown reason.
- ~~`RemoteCallableMemoryAccessor.call()` (`CreateRemoteThread` into a _different_ process, one fresh thread per call) reliably delivers every argument~~ **Correction (superseded by the fully root-caused finding below): this is false.** `RemoteCallableMemoryAccessor.call()`/`callSync()` invokes the target function _directly_ as the `CreateRemoteThread` start routine and only ever delivers `args[0]` through its single `lpParameter` slot -- every argument past the first is silently dropped, not "reliably delivered." What was originally attributed here to generic freshly-created-thread flakiness (`isModuleLoadedInProcess()`'s `GetModuleHandleExA(FROM_ADDRESS)` call crashing Wine) was actually this exact deterministic bug: `GetModuleHandleExA` takes 3 arguments, only the first (`flags`) arrived, and the output pointer (`phModule`) that should have been the 3rd argument was leftover register garbage. See the fully-diagnosed `wine: Unhandled page fault` entry further below for the `WINEDEBUG=+relay` evidence and the actual fix. If the _called code itself_ performs a real WinAPI/CRT call at all (`CallRedirectorAccessor.alloc()` → `VirtualAlloc`, `IndirectCallRedirectorAccessor.alloc()` → `malloc`, `FileTransferReadAccessor`/`FileTransferWriteAccessor` → `fopen`, or injected `cmachinecode()` that itself calls `VirtualAlloc`) on a thread spawned this way, treat it as unreliable regardless of argument count -- both the genuine freshly-created-thread flakiness described below _and_ this silent-argument-drop bug can independently cause it to crash or wedge. This was masked for a long time because the old `NamedPipeCallableAccessor` only ever used one `CreateRemoteThread` call, to start a persistent loop thread; every actual call after that ran on that same already-live thread, never a fresh one. Once `NamedPipeCallableAccessor` was removed, chains that route real WinAPI calls through a bare `RemoteCallableMemoryAccessor` (`CallRedirectorAccessor`/`IndirectCallRedirectorAccessor`/`FileTransferRead|WriteAccessor`/`isModuleLoadedInProcess`) started failing/timing out/crashing Wine in CI. Don't assume "just one call" is automatically safe — the risk is any real WinAPI/CRT call touching a freshly-created thread, not the call count, _and_ any call with more than one argument is unsafe on this accessor regardless of freshness.

None of this is a general "bun:ffi argument N is broken" bug — argument delivery is solid in every case above. Whatever's wrong is specific to _executing real syscalls on a just-created thread_ on GitHub's runners specifically.

**The fix used throughout this suite: never run real WinAPI/CRT calls on a freshly-created thread (local or remote).** Spawn a real process (`new TestProcess()` — constructs and spawns `ping.exe` directly, `pid`/`handle` are plain fields, no separate start call), grab one of its existing threads (`Native.Thread.getThreads(pid)[0]`), and drive everything through `IndirectNThreadHostAccessor(pid, tid)` instead — `memory.call()`/`memory.alloc()` hijack that thread's register context directly (`SetThreadContext`/`ResumeThread`), reusing the same already-live thread for every call, bypassing `CreateThread`/`CreateRemoteThread`/local `VirtualAlloc` entirely. This is the pattern in `minhook.test.ts`, `minhook-indirect-nthread.test.ts`, `nhook.test.ts` (both describe blocks), and now also `tests/nthread/call-redirector-nthread.test.ts`, `tests/nthread/cmachinecode-remote.test.ts`, `tests/nthread/module-helpers-nthread.test.ts`, and `tests/nthread/process-cache-accessor-nthread.test.ts` (all moved there from `tests/xffi/` for exactly this reason). Prefer `IndirectNThreadHostAccessor` over hand-rolling a `RedirectorHostAccessor`/`NThread` chain yourself: `IndirectCallableAccessor`'s constructor wires its internal `BootstrapHostAccessor.backend` correctly (`bootstrap.backend = initialBackend`), which a manual `RedirectorHostAccessor` setup can easily forget — `RedirectorHostAccessor` only routes the async ops (`read`/`write`/`alloc`/.../`call`) through `target`, while the sync scalar helpers inherited from `AbstractSyncMemoryAccessor` (`readUInt32Sync` → `readSync`, used by `CallRedirectorAccessor.protect()`) bypass `target` entirely and hit `this.backend` directly; forgetting to set `.backend` crashes with `readSync is not a function` the first time `protect()` runs, exactly what happened here before the fix. Any new test that touches a real WinAPI/CRT call remotely — even a single one — should follow the `IndirectNThreadHostAccessor` pattern rather than reaching for `Native.Thread.create()`/`Kernel32Impl.VirtualAlloc()` locally or a bare `RemoteCallableMemoryAccessor`. `IndirectCallableAccessor`'s constructor (`host-accessor.ts`) enforces this at the type level: it requires an explicit `ICallableMemoryAccessor` backend and has no pid-only overload that could silently default to a bare `RemoteCallableMemoryAccessor` (see the `wine: Unhandled page fault` entry below for the exact crash that implicit default caused). `tests/xffi/process-cache-accessor.test.ts`'s remaining tests only exercise `RemoteCallableMemoryAccessor` via mock backends now (no real Wine process) -- its one real-process test moved to `tests/nthread/process-cache-accessor-nthread.test.ts` for the same reason.

If a test genuinely needs a real thread to enter a hooked function as its actual entry point (to prove nhook's/minhook's park-and-simulate mechanism against **real** execution, not a manufactured call), bake any argument in as a compile-time literal in a tiny `cmachinecode()` wrapper that calls the real target, instead of relying on `lpParameter` — see `makeThreadEntry()` in `nhook.test.ts`.

Do **not** try routing local scratch-thread setup through an existing system `Stub` (e.g. `getRandomSpinStub()`) as a shortcut around the `VirtualAlloc` bug — this was tried and reproducibly segfaulted Bun itself (deterministic crash inside `kernelbase.dll`, confirmed on 2 independent CI runs, same crash hash both times) for reasons never fully diagnosed. Reverted; the cross-process pattern above is the actual fix, and `tests/helpers.ts`'s old `spawnLoopThread`/`cleanupThread`/`SpawnedThread` (the local-thread helpers this bug lived in) were removed once `nhook.test.ts` no longer needed them.

#### Intermittent Bun segfault on the full local Wine suite

Running the entire suite (`bun-wine test` with no path filter), or even just `tests/xffi`, can occasionally crash Bun itself partway through — the process prints "Bun has crashed... this indicates a bug in Bun, not your code" and exits (sometimes also firing an automatic, redacted crash report to `bun.report` via Wine's `powershell.exe` stub, which doesn't actually implement HTTP and likely never sends anything). Confirmed via direct bisection (stashing `cfunction.ts` and re-running the identical `tests/xffi` scope on both versions) that this is **not tied to any specific package's code** — it reproduces at a comparable low rate (roughly 1-in-4 to 2-in-5 per run) on both an unmodified tree and after substantial changes to `cfunction.ts`. Distinct crash sites have been observed so far:

- Historically observed right around `named-pipe-callable.test.ts`/`cmachinecode.test.ts`'s "remote" sub-tests, which spawned a real `ping.exe` child process and injected via `CreateRemoteThread` + named pipes. `NamedPipeCallableAccessor` and that test file have since been removed entirely (see the `CreateThread`/`CreateRemoteThread`/`VirtualAlloc` section above), so this specific crash site no longer applies, but the general "spawn + CreateRemoteThread + teardown" shape can still surface it elsewhere.
- **Root-caused and fixed:** right after `xffi/accessor.test.ts`'s "should route remote process operations through a real process" test (and identically in `scanner.test.ts`'s first `RemoteProcessMemoryAccessor` test) printed `(pass)`, during teardown of that test. This recurred at the _exact same spot_ every time, which pointed at something deterministic rather than a genuine engine race. The actual bug: both tests constructed `new RemoteProcessMemoryAccessor(tp.pid, { handle: tp.handle })` (reusing `TestProcess`'s handle) without `closeHandle: false`, so `RemoteMemoryAccessor.close()` (`ownsHandle` defaults to `true`) called `CloseHandle(tp.handle)` — and then `tp.stop()` called `CloseHandle(tp.handle)` again on the same already-closed handle. A double `CloseHandle` on the same handle value is undefined behavior, and apparently fatal under Wine specifically. Fixed by passing `closeHandle: false` in both places. **Any test that constructs an accessor with `{ handle: tp.handle }` and separately calls `tp.stop()` must pass `closeHandle: false`** — otherwise it's this same double-free bug waiting to happen again. (Simplest is to not pass `tp.handle` at all and let the accessor `OpenProcess` its own handle, as most tests including the `tests/nthread/` ones now do.)
- **Root-caused and fixed:** a `wine: Unhandled page fault on write access to 0x...06 at address 00006fffff34d6xx ... starting debugger` line, always right after `cjit.test.ts`'s "performance: should execute function many times within 500ms" test logged its count, printed to stderr but never failing the actual `bun test` run (exit 0, all tests still passed). Initially misdiagnosed as `ping.exe`'s own internal networking stack crashing on its own (the winedbg dump names `ping.exe`, not `bun.exe`, as the faulting process) -- that theory was wrong. `WINEDEBUG=+relay,+seh` tracing of the actual crashing thread found the real cause: `KERNEL32.CreateRemoteThread(...,startAddress=<GetModuleHandleExA's own address>,lpParameter=0x6,...)` -- i.e. `RemoteCallableMemoryAccessor.call()`/`callSync()` (`callable-accessor.ts`) invokes the target function _directly_ as the `CreateRemoteThread` start routine, and **only delivers `args[0]` through `CreateRemoteThread`'s single `lpParameter` slot -- every argument past the first is silently dropped**, landing as leftover register garbage in the callee. `tests/xffi/process-cache-accessor.test.ts`'s "should resolve metadata and cache status using a real target process" test constructed a bare `RemoteCallableMemoryAccessor` and called `ProcessCacheAccessor.getCoreModules()`, which internally calls `verifyCoreModules()` → `isModuleLoadedInProcess()` → `accessor.call(GetModuleHandleExA, flags, targetAddress, scratchAddr)` -- three arguments. Only `flags` (0x6 = `FROM_ADDRESS|UNCHANGED_REFCOUNT`) actually reached the callee; `scratchAddr` (the `phModule` _output_ pointer `GetModuleHandleExA` writes the resolved handle through) never did, landing as whatever garbage happened to be in R8 at thread-entry -- which was `0x6` again in the reproduced crash, an unwritable address, hence the page fault. Same underlying bug `module-helpers-nthread.test.ts`'s move already worked around for a _different_ direct caller of `isModuleLoadedInProcess()` -- this one was reached indirectly through `ProcessCacheAccessor`'s caching layer and was missed at the time. **Fixed two ways:** (1) `tests/xffi/process-cache-accessor.test.ts`'s real-process test moved to `tests/nthread/process-cache-accessor-nthread.test.ts`, now driven through `IndirectNThreadHostAccessor` (whose `call()` properly marshals every argument via register/stack placement, not a bare 1-arg `CreateRemoteThread`) -- confirmed via bisection: 3/3 clean full-suite runs and 3/3 clean `tests/xffi`-only runs after the move, versus consistent reproduction before it, both against an otherwise-unmodified tree. (2) `IndirectCallableAccessor`'s constructor (`host-accessor.ts`) no longer accepts a raw `pid` that silently defaults to a bare `RemoteCallableMemoryAccessor` backend -- it now requires an explicit `ICallableMemoryAccessor` backend, so this failure mode can't be reached by accident through that class anymore. **The underlying `RemoteCallableMemoryAccessor.call()`/`callSync()` single-argument limitation itself is unfixed and not documented as an error** -- it still silently drops `args[1+]` for any caller that passes them; don't call it directly with more than one argument, and prefer `IndirectNThreadHostAccessor`/`NThread` for any multi-argument remote call.

The first remains a timing-sensitive race in Wine's own emulation rather than a logic bug in this repo. If you hit it, just re-run — it isn't a regression from your change unless you can reproduce it going from 0 crashes to consistently crashing on the same test file in isolation on your branch specifically (verified against an unmodified tree first).

#### Cross-package `src/` imports can silently resolve to a stale `dist/` build

Every package's `package.json` `"main"` points to `"./dist/index.js"`, a **built** artifact — not `./src/index.ts`. This is invisible from `tests/`: files under `tests/` import packages by name (`from 'bun-xffi'`), there's no `tests/node_modules/bun-xffi`, so Bun falls through to `tests/tsconfig.json`'s (inherited from the root `tsconfig.json`) `paths` mapping and resolves straight to live `packages/xffi/src/index.ts`. **But a package's own source importing _another_ package (e.g. `packages/nthread/src/nthread.ts` doing `import { InittableMiddlewareAccessor } from 'bun-xffi'`) resolves differently**: `packages/nthread/node_modules/bun-xffi` exists as a real symlink (`-> ../../xffi`, created by `bun install`), so Node/Bun's ordinary node_modules walk-up finds it _before_ tsconfig paths ever get consulted, and follows it to `packages/xffi/package.json`'s `main` → the **built** `dist/index.js`.

Net effect: edit `packages/xffi/src/*.ts`, then run a test that exercises a _cross-package_ consumer (`nthread`, `nshm`, `nhook`, `minhook` importing from `bun-xffi`/`bun-winapi`/etc.) without rebuilding, and that consumer's copy of the edited class is **whatever `dist/` last had** — not your edit. Concretely hit this once: added `InittableMiddlewareAccessor.initSync()` in `packages/xffi/src/middleware-accessor.ts`, called it from `packages/nthread/src/nthread.ts`'s `NThread.callSync()`, typecheck and lint both clean (they use the root tsconfig's `paths`, so they only ever see live `src/`) — but the actual Wine test run threw `TypeError: this.initSync is not a function`, reproducibly, twice. `grep`ping `packages/xffi/dist/middleware-accessor.js` confirmed it predated the change (present: earlier session's `readSync`/`writeSync`/`callSync` additions from an already-committed state; absent: the brand-new uncommitted `initSync`). Meanwhile the _test file's own_ direct `import { HostAccessor, RedirectorHostAccessor, ... } from 'bun-xffi'` resolved fine via tsconfig paths to live `src/` — so the same `bun test` process had **two different loaded copies** of `middleware-accessor.ts`'s classes simultaneously, and `NThread` extended the stale one.

**Fix: `bun run build`** regenerates every package's `dist/` from current `src/`, which resolves the split immediately (confirmed: 147/147 clean afterward). **After editing any `packages/*/src/` file that another package imports across the workspace boundary (i.e. anything except `tests/`-only or single-package changes), run `bun run build` before trusting a Wine test result that touches the consuming package** — a clean typecheck/lint is not sufficient evidence the runtime picked up the change, precisely because typecheck/lint and `tests/` both only ever see live `src/` through tsconfig paths, while cross-package `src/`-to-`src/` imports don't.

### Adding a new workspace package

When creating a package under `packages/<name>`:

1. Add `"<name>": ["packages/<name>/src/index.ts"]` to `paths` in the root `tsconfig.json`.
2. Add `{ "path": "./packages/<name>" }` to `references` in the root `tsconfig.json`.
3. Create `packages/<name>/tsconfig.json` extending `../../tsconfig.json` (copy from an existing package).
4. If any test files import it by package name, the steps above are required — Bun 1.3.0 uses tsconfig paths for workspace resolution.
