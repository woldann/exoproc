# Examples

Small, polished demo projects showing Exoproc against a real, running
process -- as opposed to the README's inline snippets, these are meant to
be copied, run, and poked at directly. Each one is deliberately short: the
GUI/server boilerplate lives once in `kit/`, so an example's own code is
just the actual exoproc logic.

## Layout

```
examples/
  package.json          # own workspace member -- "exoproc-examples"
  components.json        # shadcn/ui config (bunx --bun shadcn@latest add <name>)
  components/             # shadcn/ui components (button, checkbox, label, ...) + ThemeProvider
  lib/utils.ts            # shadcn's cn() helper
  kit/                    # shared demo GUI, applied automatically to every example
    server.ts              # createDemo() -- Hono + Bun.serve + WS pub/sub + static serving
    client.tsx               # mountDemo() (Navbar + ThemeProvider + createRoot),
                              # DemoShell, StatusBar, EventLog, useSocket()
    styles.css                # Tailwind v4 entry point + shadcn theme tokens
  notepad-keystroke-hook/
    index.ts                  # the exoproc/nhook logic -- everything below the navbar
    client.tsx                  # the page-specific UI, built from kit/client.tsx
```

Each future example gets its own `examples/<name>/{index.ts,client.tsx}`
folder and reuses `kit/`. `mountDemo()` renders the shared `Navbar`
automatically -- an example's `client.tsx` never adds it itself; everything
an example's `client.tsx` returns renders below it. The navbar shows:

- project identity + the example's `name` (from `createDemo({ name })`)
- a live process status badge (`demo.publishProcess(pid, alive)`)
- the theme toggle

Adding a new shadcn/ui component (e.g. a dialog): `cd examples && bunx --bun
shadcn@latest add dialog`.

## Building

The client bundles and Tailwind stylesheet are pre-built by the repo's
normal build, **not** by the example script itself when it runs under
Wine -- `Bun.build()`/the Tailwind CLI can't resolve any symlinked
`node_modules` entry from inside a `bun-wine` (Windows bun.exe via Wine)
process. Run this once (and again whenever you change a `client.tsx` or
`kit/styles.css`):

```bash
bun run build
```

This produces `examples/<name>/client.js` next to each example's
`client.tsx`, and `examples/kit/styles.generated.css`. Both are gitignored
generated artifacts, same as every package's own `dist/` output.

## Running an example

Examples run through Wine, via the `bun-wine` wrapper from the repo root.

```bash
BUN_WIN_DIR=/path/to/bun-windows-x64 ./bun-wine run examples/notepad-keystroke-hook/index.ts
```

## `notepad-keystroke-hook/`: scope and GUI

Spawns and hooks only its own freshly-spawned `notepad.exe` instance --
`NHook.poll()` only scans threads belonging to that one pid, so nothing
outside the script's own test process is ever touched, logged, or affected.
`TranslateMessage`'s signature and the `MSG` struct layout are standard,
publicly documented Win32 ABI.

`index.ts` is only the hook logic (create/enable/poll/resume, pause-resume,
detecting `notepad.exe` closing via `ProcessExitedError`). Everything about
displaying it -- the server, the WebSocket, the page shell, the dark
Tailwind theme -- is `kit/server.js`/`kit/client.js`; `client.tsx` is just
the notepad-specific bits (key log, pause button, hex toggle) built from
`kit/client.tsx`'s shared components. The server runs inside `bun-wine`,
doing the actual hooking, but the page itself renders in _your host
machine's own browser_, entirely outside Wine -- sidestepping the
portability risk of anything that has to render _inside_ the Wine process.

## Examples

| Path                      | Demonstrates                                                                                                                                                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notepad-keystroke-hook/` | `nhook`'s 2-byte park-and-simulate hook (not a JMP/trampoline) installed on `user32.dll!TranslateMessage` in a freshly spawned `notepad.exe`, streaming real keystrokes to a React UI (built on the shared `kit/`) as you type -- purely observational, no detour function, no injected code. |
