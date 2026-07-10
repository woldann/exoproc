import { spawn, type ChildProcess } from 'node:child_process';
import { Kernel32Impl } from '../packages/xffi/src/win/kernel32.js';

// Fixed duration for the spawned ping.exe -- generous enough that no test in
// this suite ever runs long enough to see it exit underneath them.
const PING_SECONDS = 60;

export class TestProcess {
  protected child: ChildProcess;
  public pid: number;
  public handle: number;
  public address: number;

  /**
   * @param executable Executable to spawn (default `ping.exe`, matching this
   *   class's original hardcoded behavior).
   * @param args Arguments for `executable` (default: a 60s ping, so no test
   *   in this suite ever runs long enough to see it exit underneath them).
   */
  constructor(
    executable: string = 'ping.exe',
    args: string[] = ['127.0.0.1', '-n', String(PING_SECONDS)],
  ) {
    this.child = spawn(executable, args, { stdio: 'ignore' });

    if (!this.child.pid) {
      throw new Error(`Failed to spawn test process (${executable})`);
    }
    this.pid = this.child.pid;

    // Block synchronously until Wine has actually started the process (its
    // main thread must exist before callers can enumerate/hijack it) --
    // there's no async lifecycle to await anymore, so this replaces the old
    // start()'s awaited delay.
    Bun.sleepSync(2000);

    this.handle = Number(Kernel32Impl.OpenProcess(0x1f0fff, 0, this.pid));
    // Simplification: In a real test, we would query the process memory
    this.address = 0x400000; // Usually base address for PE
  }

  get process(): ChildProcess {
    return this.child;
  }

  // Waits for the spawned process to *actually* be gone before returning.
  //
  // `child.kill()` alone only sends the signal and returns immediately, and
  // node's `'exit'` event (plus any fixed fallback timeout) fires on node's
  // own bookkeeping -- not on the real OS process object. On a fast machine
  // Wine finishes tearing the process down before anything else runs, so this
  // is invisible; on a slow/loaded CI runner the caller (and the next test)
  // resume while Wine's ntdll is still mid-rundown of the killed process, and
  // that overlap is a likely contributor to the intermittent Bun/Wine
  // segfault documented in CLAUDE.md (it recurs right after tests that
  // spawn+kill a real process, always at the same spot, only on CI).
  //
  // Fix: keep our process handle open, ask node to terminate the process,
  // then poll-wait on the *actual* process object until it is signaled
  // (terminated) before closing the handle and returning. `WaitForSingleObject`
  // is called with a 0 timeout in a loop (never a blocking wait -- matching
  // xffi's `waitAsync` philosophy so the event loop is never wedged), so
  // teardown is deterministic regardless of CPU speed.
  async stop(): Promise<void> {
    const child = this.child;
    const handle = this.handle;
    this.handle = 0;

    // Ask node to terminate the Wine process (maps to TerminateProcess).
    if (child.exitCode === null) child.kill();

    if (handle !== 0) {
      // WAIT_OBJECT_0 = 0 (signaled/terminated); WAIT_TIMEOUT = 0x102 (still
      // alive). Poll up to ~5s so even a slow Wine rundown fully completes
      // before we proceed, rather than being abandoned after a fixed wait.
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if (Kernel32Impl.WaitForSingleObject(handle, 0) === 0) break;
        Bun.sleepSync(25);
      }
      Kernel32Impl.CloseHandle(handle);
    }

    // Reap node's ChildProcess bookkeeping too, then a small extra grace
    // period for Wine's own process-death handling to settle (matching
    // tests/setup.ts's afterAll grace period).
    if (child.exitCode === null) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 3000);
        child.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
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
