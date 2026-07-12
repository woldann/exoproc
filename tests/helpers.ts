import { Kernel32Impl } from '../packages/xffi/src/win/kernel32.js';
import { spawnDeElevatedProcess } from '../packages/nshm/src/nshm.js';

// Fixed duration for the spawned ping.exe -- generous enough that no test in
// this suite ever runs long enough to see it exit underneath them.
const PING_SECONDS = 60;

export class TestProcess {
  public pid: number;
  public handle: number;
  public address: number;

  /**
   * @param executable Executable to spawn (default `ping.exe`). Must be a
   *   process whose threads periodically return to user mode on their own
   *   (e.g. `ping.exe`'s ~1s timer wait between echoes) -- `nthread`'s
   *   hijack redirects RIP via `SetThreadContext`, but that only takes
   *   effect once the thread actually returns to user mode; a thread parked
   *   in an indefinite, event-driven kernel wait (e.g. `cmd.exe`'s
   *   `ReadConsoleInput` with nothing ever typed into it) never does, so the
   *   hijack times out waiting for it to land at the sleep stub (confirmed:
   *   swapping this default to `cmd.exe` made every `IndirectNThreadHostAccessor`-based
   *   test -- `nshm`, `nthread`, `minhook`/`nhook` -- fail with
   *   `CallTimeoutError` / `WAIT_TIMEOUT`). Don't change this default
   *   without verifying against the `nthread`/`nshm`/`minhook`/`nhook` suites,
   *   not just the `xffi` ones that don't hijack an existing thread.
   * @param args Arguments for `executable` (default: a 60s ping, so no test
   *   in this suite ever runs long enough to see it exit underneath them).
   */
  constructor(
    executable: string = 'ping.exe',
    args: string[] = ['127.0.0.1', '-n', String(PING_SECONDS)],
  ) {
    // Spawned the same de-elevated way nshm's own dummy relay process is
    // (CreateProcessAsUserA, not child_process.spawn) -- it needs no
    // elevated privileges either, and this sidesteps node's ChildProcess
    // bookkeeping (its own signal-based kill, 'exit' event) racing against
    // Wine's real process teardown, a likely contributor to the
    // intermittent Bun/Wine segfaults documented in CLAUDE.md.
    const spawned = spawnDeElevatedProcess(executable, args);
    this.pid = spawned.pid;
    this.handle = spawned.handle;

    // Block synchronously until Wine has actually started the process (its
    // main thread must exist before callers can enumerate/hijack it) --
    // there's no async lifecycle to await anymore, so this replaces the old
    // start()'s awaited delay.
    Bun.sleepSync(2000);

    // Simplification: In a real test, we would query the process memory
    this.address = 0x400000; // Usually base address for PE
  }

  // Waits for the spawned process to *actually* be gone before returning --
  // `TerminateProcess` only requests death; `WaitForSingleObject(handle, 0)`
  // polled in a loop (never a blocking wait -- matching xffi's `waitAsync`
  // philosophy so the event loop is never wedged) confirms it before this
  // returns, so the caller (and the next test) never resume while Wine's
  // ntdll is still mid-rundown of the killed process -- a likely
  // contributor to the intermittent Bun/Wine segfault documented in
  // CLAUDE.md (it recurs right after tests that spawn+kill a real process).
  async stop(): Promise<void> {
    const handle = this.handle;
    this.handle = 0;
    if (handle === 0) return;

    Kernel32Impl.TerminateProcess(handle, 0);

    // WAIT_OBJECT_0 = 0 (signaled/terminated); WAIT_TIMEOUT = 0x102 (still
    // alive). Poll up to ~5s so even a slow Wine rundown fully completes
    // before we proceed, rather than being abandoned after a fixed wait.
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (Kernel32Impl.WaitForSingleObject(handle, 0) === 0) break;
      Bun.sleepSync(25);
    }
    Kernel32Impl.CloseHandle(handle);

    // Small extra grace period for Wine's own process-death handling to
    // settle (matching tests/setup.ts's afterAll grace period).
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** A freshly spawned `notepad.exe`, for tests/examples that need a real,
 * visible window to hook or click into (as opposed to `TestProcess`'s
 * headless `ping.exe`, used for pure memory/thread-hijacking mechanics). */
export class TestNotepadProcess extends TestProcess {
  constructor() {
    super('notepad.exe', []);
  }
}
