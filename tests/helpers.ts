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

  // Waits for the spawned process to actually exit before returning --
  // `child.kill()` alone only sends the signal and returns immediately,
  // racing the still-in-flight Wine-side process teardown against whatever
  // the caller (and the test runner) does next. That race is a likely
  // contributor to the intermittent Bun/Wine segfault documented in
  // CLAUDE.md (it recurs right after tests that spawn+kill a real process).
  async stop(): Promise<void> {
    if (this.handle !== 0) {
      Kernel32Impl.CloseHandle(this.handle);
      this.handle = 0;
    }
    const child = this.child;
    if (child.exitCode !== null) return;

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      child.once('exit', () => {
        clearTimeout(timeout);
        // Small extra grace period for Wine's own process-death handling to
        // settle, matching tests/setup.ts's afterAll grace period.
        setTimeout(resolve, 250);
      });
      child.kill();
    });
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
