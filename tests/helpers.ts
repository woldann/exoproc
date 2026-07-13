import { Kernel32Impl } from '../packages/xffi/src/win/kernel32.js';
import { StartupInfoA, ProcessInformation } from '../packages/xffi/src/win/structs.js';
import { ProcessCreationFlags } from '../packages/xffi/src/win/defines.js';

// Fixed duration for the spawned ping.exe -- generous enough that no test in
// this suite ever runs long enough to see it exit underneath them.
const PING_SECONDS = 60;

/**
 * Spawns `executable` directly via a plain `CreateProcessA` -- no
 * `child_process` (its own signal-based kill / 'exit' event would race
 * Wine's real process teardown, a likely contributor to the intermittent
 * Bun/Wine segfault documented in CLAUDE.md), but also deliberately *not*
 * `nshm`'s `spawnDeElevatedProcess` (`OpenProcessToken` +
 * `CreateRestrictedToken` + `CreateProcessAsUserA`): that NT token/security
 * API path reproducibly crashed Bun itself (hard segfault at address
 * `0xFFFFFFFFFFFFFFFF`, `bun-report` frames inside `ntdll.dll`/
 * `kernelbase.dll`) the moment the very first test file constructed a
 * `TestProcess`, consistently across GitHub Actions runs, while passing
 * locally -- Wine's NT security-token subsystem is a well-known incomplete
 * area, and this suite's tests never actually needed a de-elevated token
 * (that guarantee matters for `nshm`'s real dummy-relay process, not for a
 * throwaway `ping.exe`/`notepad.exe` test target). Plain `CreateProcessA`
 * gets the same "avoid child_process" benefit without touching advapi32.
 */
function spawnPlainProcess(
  executable: string,
  args: string[],
): { pid: number; handle: number } {
  const commandLine = `"${executable}"${args.length ? ` ${args.join(' ')}` : ''}`;
  const commandLineBuf = Buffer.concat([
    Buffer.from(commandLine + '\0', 'latin1'),
    Buffer.alloc(32),
  ]);

  const startupInfo = StartupInfoA.allocSync();
  startupInfo.assign({
    cb: StartupInfoA.computed.totalSize,
    lpReserved: null,
    lpDesktop: null,
    lpTitle: null,
    dwX: 0,
    dwY: 0,
    dwXSize: 0,
    dwYSize: 0,
    dwXCountChars: 0,
    dwYCountChars: 0,
    dwFillAttribute: 0,
    dwFlags: 0,
    wShowWindow: 0,
    cbReserved2: 0,
    lpReserved2: null,
    hStdInput: 0n,
    hStdOutput: 0n,
    hStdError: 0n,
  });

  const processInfo = ProcessInformation.allocSync();
  processInfo.assign({
    hProcess: 0n,
    hThread: 0n,
    dwProcessId: 0,
    dwThreadId: 0,
  });

  const created = Kernel32Impl.CreateProcessA(
    0,
    commandLineBuf,
    0,
    0,
    0,
    ProcessCreationFlags.CREATE_NO_WINDOW,
    0,
    0,
    startupInfo,
    processInfo,
  );
  if (!created) {
    throw new Error(
      `Failed to spawn test process (${executable}), GetLastError=${Kernel32Impl.GetLastError()}`,
    );
  }

  const pid = Number(processInfo.dwProcessId);
  const handle = Number(processInfo.hProcess);
  const threadHandle = Number(processInfo.hThread);
  if (threadHandle) Kernel32Impl.CloseHandle(threadHandle);

  return { pid, handle };
}

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
    // See spawnPlainProcess() above for why this is a plain CreateProcessA,
    // not child_process.spawn (Wine-teardown race) and not nshm's
    // spawnDeElevatedProcess (crashed Bun outright on GitHub Actions).
    const spawned = spawnPlainProcess(executable, args);
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
