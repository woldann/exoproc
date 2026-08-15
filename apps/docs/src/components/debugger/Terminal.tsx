'use client';

import { useEffect, useRef } from 'react';
import type { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { getExoprocApi } from '../../shell/renderer/bootstrap';

const CONSOLE_COLS = 80;
const CONSOLE_ROWS = 25;
/** xterm sends this for Backspace; erase-in-place is `\b \b` (back, blank, back). */
const KEY_BACKSPACE = '\x7f';
const KEY_ENTER = '\r';
const KEY_CTRL_C = '\x03';

/**
 * A real simulated `cmd.exe` session (its own process in the shared
 * `Win64Machine`, independent of whatever the debugger is attached to),
 * rendered through xterm.js -- over `window.exoproc.terminal` rather than
 * a client-side `getGlobalWin64Machine()` session directly, same boundary
 * `IdeTerminalPanel` already crossed for the IDE's own terminal.
 *
 * Deliberately does **not** reuse `ITerminalService`/`IdeTerminalPanel`'s
 * session wrapper: that one's `pendingEcho` de-dup logic is built for the
 * plain `drainHostText()` byte-queue model, where the engine's own
 * `Win32CommandPrompt.execute()` echo repeats the submitted line verbatim
 * in the output stream and has to be stripped so it doesn't double up
 * against xterm's local per-keystroke echo. This panel instead requests
 * `create({ presenter: true })` -- the worker runs the session through
 * `ConsoleScreenPresenter` (a screen-buffer diff, not a byte queue), which
 * is required for full fidelity with anything that writes the console
 * screen buffer directly (`SetConsoleCursorPosition`,
 * `FillConsoleOutputCharacterA`, `SetConsoleTextAttribute` -- notably this
 * repo's own `cls.exe`), none of which the plain byte queue ever sees. A
 * diff naturally emits nothing for cells that already match, so the local
 * echo and the engine's own repaint never need de-duplicating in the
 * first place -- they simply overlap on the same unchanged cells.
 */
export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineBufferRef = useRef('');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let term: XTerm | undefined;
    let sessionId: string | undefined;
    let unsubscribeData: (() => void) | undefined;
    let unsubscribeClose: (() => void) | undefined;
    let dataSubscription: { dispose(): void } | undefined;

    const api = getExoprocApi();

    void Promise.all([
      import('@xterm/xterm').then(({ Terminal }) => Terminal),
      api.terminal.create({ presenter: true }),
    ]).then(([Terminal, session]) => {
      if (disposed) {
        void api.terminal.dispose(session.id);
        return;
      }
      sessionId = session.id;

      term = new Terminal({
        cols: CONSOLE_COLS,
        rows: CONSOLE_ROWS,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, monospace",
        fontSize: 13,
        theme: {
          background: '#1e1e1e',
          foreground: '#cccccc',
          cursor: '#cccccc',
        },
        convertEol: false,
        disableStdin: false,
        cursorBlink: true,
      });
      term.open(container);
      term.write(session.initialOutput);

      unsubscribeData = api.terminal.onData((event) => {
        if (event.sessionId !== sessionId) return;
        term?.write(event.chunk);
      });
      unsubscribeClose = api.terminal.onClose((event) => {
        if (event.sessionId !== sessionId) return;
        term?.write('\r\n[oturum kapandı]\r\n');
      });

      dataSubscription = term.onData((data) => {
        if (!sessionId) return;

        if (data === KEY_CTRL_C) {
          // No true guest-side interrupt semantics in the simulated engine --
          // this only discards whatever the user hasn't submitted yet.
          lineBufferRef.current = '';
          term?.write('^C\r\n');
          return;
        }

        if (data === KEY_ENTER) {
          const line = lineBufferRef.current;
          lineBufferRef.current = '';
          term?.write('\r\n');
          void api.terminal.sendLine(sessionId, line);
          return;
        }

        if (data === KEY_BACKSPACE) {
          if (lineBufferRef.current.length === 0) return;
          lineBufferRef.current = lineBufferRef.current.slice(0, -1);
          term?.write('\b \b');
          return;
        }

        // Ignore other control/escape sequences (arrow keys, etc.) -- no
        // history/cursor editing in this line buffer, matching the scope
        // decision to keep the terminal a real-but-simple cmd.exe session.
        if (data.length === 1 && data.charCodeAt(0) < 0x20) return;

        lineBufferRef.current += data;
        term?.write(data);
      });
    });

    return () => {
      disposed = true;
      dataSubscription?.dispose();
      unsubscribeData?.();
      unsubscribeClose?.();
      if (sessionId) void api.terminal.dispose(sessionId);
      term?.dispose();
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-[#1e1e1e] p-2">
      <div ref={containerRef} className="min-h-0 flex-1" />
    </div>
  );
}
