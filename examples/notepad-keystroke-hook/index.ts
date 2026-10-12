/**
 * Hooks `user32.dll!TranslateMessage` in a freshly spawned `notepad.exe` and
 * streams every WM_KEYDOWN it sees while you type into the Notepad window to
 * a small local web page -- using `nhook`'s 2-byte park-and-simulate
 * mechanism, not a 5-byte JMP/trampoline (that's `minhook`'s job) and not a
 * DLL injected into notepad at all.
 *
 * Why `TranslateMessage`: any window's message loop
 * (`GetMessage`/`TranslateMessage`/`DispatchMessage`) calls it for every
 * message it pumps, including keystrokes, so it's a single, stable,
 * exported hook point that fires naturally as you type -- no need to find
 * or reverse-engineer notepad.exe's own (unexported, build-specific)
 * internal key handler.
 *
 * How the address is resolved without touching notepad.exe at all: `cimport`
 * already resolved `User32Impl.TranslateMessage`'s address against *this*
 * process's own loaded `user32.dll` at import time. System ("known") DLLs
 * like `user32.dll`/`kernel32.dll` load at the same base address in every
 * process for a given boot, so that address is valid in notepad.exe's
 * address space too -- the same assumption this repo's own tests already
 * rely on (e.g. calling a locally-resolved `Kernel32Impl.GetCurrentThreadId`
 * on a hijacked thread in another process and getting back that process's
 * real thread id).
 *
 * What actually touches notepad.exe's memory: `nhook.create()`/`enable()`/
 * `disable()` only need `ReadProcessMemory`/`WriteProcessMemory`/
 * `VirtualProtectEx` to install the 2-byte `EB FE` patch, driven here through
 * `createAccessor(notepad.pid, createAccessorOptions(2))` -- races every
 * thread of notepad.pid for an `NThread` hijack and hands back an
 * `IndirectNThreadHostAccessor`, so those ops run via thread redirection
 * rather than a fresh `CreateRemoteThread`. Separately, when a real thread in
 * notepad.exe actually *runs into* the patch, `nhook` hijacks that specific
 * parked thread (its own, unrelated `IndirectNThreadHostAccessor`) to read
 * its arguments and safely resume it afterwards. No `CreateRemoteThread`, no
 * injected DLL, no injected machineCode loop, anywhere in this script.
 *
 * By default this is purely observational: the detour is never a custom
 * function that replaces `TranslateMessage` (that's what `minhook`'s
 * JMP+trampoline would do) -- `nhook.resume()` with no explicit return value
 * just simulates the displaced prologue bytes and lets the real, unmodified
 * `TranslateMessage` keep running, so notepad behaves exactly as normal while
 * we watch. The "force all keys to A" checkbox is the one deliberate
 * exception: `hit.args[0]` is a pointer into notepad's own message-loop
 * stack, not a local copy, so `msg.set('wParam', VK_A)` rewrites the MSG
 * struct *in place*, in the target process's memory, before `resume()` --
 * `TranslateMessage` (and notepad's own WndProc after it) then reads that
 * same memory and sees VK_A regardless of what was actually pressed. Still
 * no return-value override, no detour, no simulation change -- just the
 * argument data itself, which is exactly what `hit.args`/`resume()` are for.
 *
 * Scope/ethics: this only spawns and watches *its own* freshly-spawned
 * notepad.exe instance (via `exoproc-dummy`'s `DummyProcess`) --
 * `NHook.poll()` only scans threads belonging to that one pid, so nothing
 * outside this script's own test process is ever touched, logged, or
 * affected.
 *
 * The GUI (server + WebSocket pub/sub + React shell) is entirely
 * `../kit/server.js`/`../kit/client.js` -- see `examples/README.md` for how
 * that's built and why. This file is only the `nhook` logic.
 *
 * Prerequisites:
 *   - `bun run build` at least once (builds this example's client bundle +
 *     the shared Tailwind stylesheet).
 *   - A Wine session with an actual visible desktop (not fully headless) --
 *     you need to be able to click into the spawned Notepad window and type
 *     for this to observe anything. `Xvfb`-only CI environments won't show
 *     you a window to type into; run this locally.
 *
 * Run it the same way any other script in this repo runs under Wine:
 *   BUN_WIN_DIR=/path/to/bun-windows-x64 ./bun-wine run examples/notepad-keystroke-hook/index.ts
 * Then open the printed http://localhost:<port> URL in your browser.
 */
import {
  User32Impl,
  Msg,
  WM,
  NHook,
  ProcessExitedError,
  createAccessor,
  createAccessorOptions,
} from 'exoproc';
import { DummyProcess } from 'exoproc-dummy';
import { createDemo } from '../kit/server.js';

const HOOK_DURATION_MS = 60_000;
const POLL_INTERVAL_MS = 20;
const MAX_VISIBLE_KEYS = 200;

// Most VK codes for letters/digits equal their ASCII code point, so those
// just pass through; everything else gets a readable name where one exists,
// falling back to a raw hex code.
const VK_NAMES: Record<number, string> = {
  0x08: 'Backspace',
  0x09: 'Tab',
  0x0d: 'Enter',
  0x1b: 'Escape',
  0x20: 'Space',
  0x25: 'Left',
  0x26: 'Up',
  0x27: 'Right',
  0x28: 'Down',
  0x2e: 'Delete',
};

function vkCodeToLabel(vkCode: number): { label: string; hex: string } {
  const hex = `0x${vkCode.toString(16)}`;
  if (VK_NAMES[vkCode]) return { label: VK_NAMES[vkCode], hex };
  if (vkCode >= 0x30 && vkCode <= 0x39) {
    return { label: String.fromCharCode(vkCode), hex }; // 0-9
  }
  if (vkCode >= 0x41 && vkCode <= 0x5a) {
    return { label: String.fromCharCode(vkCode), hex }; // A-Z
  }
  return { label: hex, hex };
}

// Pause/resume requests from the page just set a flag here; the main loop
// below is the only place that ever calls hook.disable()/enable(), so there's
// never a hook operation racing against the loop's own poll()/resume() calls.
let pauseRequested = false;
let resumeRequested = false;
// Same idea for the "spell exoproc" toggle -- read once per hit below.
let spellExoproc = false;

// Cycled through one letter per overridden keystroke (wrapping around), not
// reset when the toggle is flipped off/on -- it just keeps advancing.
const FORCE_WORD_LETTERS = Array.from('exoproc');
let forceWordIndex = 0;

function vkCodeForLetter(letter: string): number {
  return letter.toUpperCase().charCodeAt(0);
}

const demo = createDemo({
  title: 'nhook demo -- notepad.exe keystrokes',
  name: 'notepad-keystroke-hook',
  dir: import.meta.dir,
  onMessage(data) {
    if (data === 'pause') pauseRequested = true;
    else if (data === 'resume') resumeRequested = true;
    else if (data === 'spell-exoproc-on') spellExoproc = true;
    else if (data === 'spell-exoproc-off') spellExoproc = false;
  },
});

// visible: true -- this demo needs a real window you can click into and
// type at; DummyProcess otherwise spawns headless (CREATE_NO_WINDOW, no
// explicit lpDesktop), which is right for tests/most examples but leaves
// nothing to see here.
const notepad = new DummyProcess({
  executable: 'notepad.exe',
  args: [],
  visible: true,
});
demo.publishProcess(notepad.pid, true);
demo.publishStatus(
  `Spawned notepad.exe (pid=${notepad.pid}). Installing hook...`,
);

const target = User32Impl.TranslateMessage;
const nhook = new NHook(notepad.pid);

// createAccessor's NThread hijack parks notepad's own thread at *our* spin
// stub for as long as the accessor is alive -- notepad's message loop (and
// so keyboard handling) never runs on its own while that's true, on a
// single-threaded target like this one. Building one fresh, short-lived
// accessor per operation (create/enable/disable) and deinit()ing it right
// after -- instead of keeping one alive for the whole session -- means
// notepad is only ever unresponsive for the brief moment an operation is
// actually running, not for the entire demo. hook.enable()/hook.disable()
// (the convenience forwarders) are deliberately not used below: they always
// reuse whatever `memory` was passed to nhook.create() (Hook.memory is
// readonly), which would keep that original accessor's hijack alive
// indefinitely -- nhook.enable()/disable() (the manager methods) take
// `memory` explicitly instead, so each call can bring its own.
async function withMemory<T>(
  fn: (memory: Awaited<ReturnType<typeof createAccessor>>) => Promise<T>,
): Promise<T> {
  const memory = await createAccessor(notepad.pid, createAccessorOptions(2));
  try {
    return await fn(memory);
  } finally {
    await memory.deinit();
  }
}

try {
  const hook = await withMemory((memory) => nhook.create(memory, target));
  await withMemory((memory) => nhook.enable(memory, hook));
  demo.publishStatus('Hooked TranslateMessage -- watching for keystrokes.');

  const deadline = Date.now() + HOOK_DURATION_MS;
  let keyCount = 0;
  let processExited = false;

  while (Date.now() < deadline) {
    try {
      // Pause/resume actually installs/uninstalls the patch -- while paused,
      // TranslateMessage runs completely unmodified (no thread ever parks at
      // EB FE). Handled here, sequentially with poll()/resume() below, so
      // there's never a hook operation racing against the loop's own use of
      // the same hook/thread.
      if (pauseRequested && hook.enabled) {
        pauseRequested = false;
        await withMemory((memory) => nhook.disable(memory, hook));
        demo.publishStatus('Paused -- hook disabled.');
      }
      if (resumeRequested && !hook.enabled) {
        resumeRequested = false;
        await withMemory((memory) => nhook.enable(memory, hook));
        demo.publishStatus('Resumed -- hook enabled, watching for keystrokes.');
      }

      if (hook.enabled) {
        const hits = await nhook.poll();

        for (const hit of hits) {
          // TranslateMessage(const MSG *lpMsg) -- arg0 (RCX) is the MSG pointer.
          const msg = new Msg(hit.args[0], hit.memory);
          const message = await msg.message;

          if (message === WM.KEY.DOWN || message === WM.SYSKEY.DOWN) {
            const wParam = await msg.wParam;
            const vkCode = Number(BigInt(wParam) & 0xffn);
            if (keyCount < MAX_VISIBLE_KEYS) {
              // Logs the *actual* key pressed, even when spell-exoproc is on
              // below -- the point is seeing what you typed next to what
              // notepad actually received.
              demo.publish({ type: 'key', ...vkCodeToLabel(vkCode) });
              keyCount++;
            }

            if (spellExoproc) {
              // Rewrites the MSG struct's wParam *in place*, in the target
              // process's own memory -- args[0] is a pointer into notepad's
              // message-loop stack, not a local copy. TranslateMessage (and
              // notepad's own WndProc after it) reads wParam from that same
              // memory once resumed, so it sees this letter regardless of
              // what was actually pressed. This is nhook's "modify args,
              // then resume" in its most direct form: no return-value
              // override, no simulation change -- just the argument data
              // itself. One letter of "exoproc" per keystroke, cycling
              // around (not reset by toggling off/on).
              const letter =
                FORCE_WORD_LETTERS[
                  forceWordIndex % FORCE_WORD_LETTERS.length
                ] ?? 'e';
              forceWordIndex++;
              await msg.set('wParam', BigInt(vkCodeForLetter(letter)));
            }
          }

          // No return value -- simulates the stolen prologue bytes and lets
          // the real, unmodified TranslateMessage keep running (with
          // whatever we just wrote into its args). Purely observational.
          await nhook.resume(hit);
        }
      }
    } catch (err) {
      // NHook.poll() throws ProcessExitedError once notepad.exe's thread
      // snapshot comes back empty -- that's how we actually learn the
      // process is gone (a closed window, not an `exit`-event side channel).
      if (!(err instanceof ProcessExitedError)) throw err;
      processExited = true;
      demo.publishProcess(notepad.pid, false);
      demo.publishStatus('notepad.exe closed -- stopping.');
      break;
    }

    // Countdown is a stream-ish value that's fine as a plain broadcast --
    // republished every tick anyway, so a late-connecting client is never
    // more than one tick away from the current number.
    demo.publish({
      type: 'countdown',
      seconds: Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
    });

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  if (processExited) {
    // The real process is already gone -- ReadProcessMemory/WriteProcessMemory
    // against it would just fail, so there's nothing left to restore. Forget
    // the hook locally instead of calling disable()/destroy() (which would
    // try to touch the dead process's memory).
    nhook.forget(target);
    demo.publishStatus('notepad.exe closed -- hook removed.');
  } else {
    await withMemory((memory) => nhook.disable(memory, hook));
    // hook.enabled is now false, so destroy() (which internally re-calls
    // disable() only if still enabled) never touches hook.memory -- the
    // long-deinit()'d accessor from the very first withMemory() above --
    // so this is safe without giving it a fresh one too.
    await hook.destroy();
    demo.publishStatus('Done -- hook removed.');
    demo.publishProcess(notepad.pid, false);
  }
} finally {
  await notepad.stop();
  demo.close();
}
