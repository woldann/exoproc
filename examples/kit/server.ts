/**
 * Shared server for every example's demo GUI: a `Hono` app serving the HTML
 * shell, the example's pre-built client bundle, the shared Tailwind
 * stylesheet, and a pub/sub WebSocket -- all behind one `createDemo()` call
 * so an example's own file only has to contain its actual exoproc logic.
 *
 * The client bundle and stylesheet are read from disk, not built here --
 * `Bun.build()`/the Tailwind CLI can't run from inside a `bun-wine`
 * (Windows bun.exe under Wine) process (confirmed: fails to resolve any
 * symlinked `node_modules` entry there), so `scripts/build.ts` pre-builds
 * both natively ahead of time (see that file).
 */
import chalk from 'chalk';
import terminalLink from 'terminal-link';
import { Hono } from 'hono';
import { upgradeWebSocket, websocket } from 'hono/bun';

const EVENTS_TOPIC = 'events';

export interface Demo {
  /**
   * Broadcasts a JSON-serialized event to every connected client. Pub/sub
   * has no history -- a client connecting after the fact never sees events
   * broadcast before it joined. Fine for a stream (e.g. `{ type: 'key' }`,
   * one entry per keystroke), not for "the current state" -- use
   * `publishStatus`/`publishProcess` for that instead.
   */
  publish(event: unknown): void;
  /**
   * Broadcasts the tracked process's pid/liveness to the navbar's status
   * badge, and remembers it so a client connecting later still gets it.
   */
  publishProcess(pid: number, alive: boolean): void;
  /**
   * Broadcasts `{ type: 'status', text }` to every client, and remembers it
   * so a client connecting later immediately sees the current status
   * instead of whatever `StatusBar`'s initial state happened to be.
   */
  publishStatus(text: string): void;
  /** The demo's local URL (already printed to the console by `createDemo()`). */
  url: string;
  /** Stops the server. */
  close(): void;
}

export interface CreateDemoOptions {
  /** Used as the page `<title>`. */
  title: string;
  /** Short identifier shown in the navbar -- normally the example's own folder name. */
  name: string;
  /** The example's own `import.meta.dir` -- the kit reads `client.js` from here. */
  dir: string;
  /** Called for every raw string message a client sends over `/ws` (e.g. "pause"). */
  onMessage?: (data: string) => void;
}

function pageHtml(title: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<link rel="stylesheet" href="/styles.css">
<script>
  // Blocking, before first paint -- avoids a flash of the light theme while
  // React (and ThemeProvider's own effect) is still loading. Keep the
  // storage key and "dark" fallback in sync with kit/client.tsx's mountDemo().
  try {
    var t = localStorage.getItem('exoproc-demo-theme') || 'dark';
    if (t === 'system') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.classList.add(t);
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
</script>
</head>
<body class="min-h-screen bg-background font-mono text-foreground">
  <div id="root" class="mx-auto max-w-3xl p-8"></div>
  <script type="module" src="/client.js"></script>
</body>
</html>`;
}

async function readGeneratedFile(path: string, what: string): Promise<string> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(
      `${what} not found at ${path} -- run \`bun run build\` first.`,
    );
  }
  return file.text();
}

export function createDemo(opts: CreateDemoOptions): Demo {
  const app = new Hono();

  // Last known value of the two "current state" events -- replayed to each
  // newly-connected client in onOpen below, since pub/sub itself has no
  // history/replay for anyone who missed the original broadcast.
  let lastStatusEvent: { type: 'status'; text: string } | undefined;
  let lastProcessEvent:
    { type: '__process'; pid: number; alive: boolean } | undefined;

  app.get('/', (c) => c.html(pageHtml(opts.title)));

  app.get('/client.js', async (c) => {
    const js = await readGeneratedFile(
      `${opts.dir}/client.js`,
      'Client bundle',
    );
    return c.text(js, 200, {
      'content-type': 'application/javascript; charset=utf-8',
    });
  });

  app.get('/styles.css', async (c) => {
    const css = await readGeneratedFile(
      `${import.meta.dir}/styles.generated.css`,
      'Tailwind stylesheet',
    );
    return c.text(css, 200, { 'content-type': 'text/css; charset=utf-8' });
  });

  app.get(
    '/ws',
    upgradeWebSocket(() => ({
      onOpen(_evt, ws) {
        ws.raw?.subscribe(EVENTS_TOPIC);
        // Connection-specific initial state -- sent directly to this one
        // socket, not broadcast.
        ws.send(JSON.stringify({ type: '__init', name: opts.name }));
        // Catch this one client up on the current status/process state --
        // see the `Demo.publish` doc for why this can't just rely on the
        // original broadcast.
        if (lastStatusEvent) ws.send(JSON.stringify(lastStatusEvent));
        if (lastProcessEvent) ws.send(JSON.stringify(lastProcessEvent));
      },
      onMessage(evt) {
        if (typeof evt.data === 'string') opts.onMessage?.(evt.data);
      },
    })),
  );

  const server = Bun.serve({ port: 0, fetch: app.fetch, websocket });
  const url = (() => {
    try {
      const u = new URL(server.url.href);
      if (
        u.hostname === '0.0.0.0' ||
        u.hostname === '[::]' ||
        u.hostname === '::'
      ) {
        u.hostname = 'localhost';
      }
      return u.href;
    } catch {
      return server.url.href;
    }
  })();

  console.log();
  const styledLink = terminalLink(chalk.cyan(url), url, {
    fallback: (text) => text,
  });
  console.log(`  ${chalk.green('➜')}  ${chalk.bold('Local:')}   ${styledLink}`);
  console.log();

  return {
    publish(event) {
      server.publish(EVENTS_TOPIC, JSON.stringify(event));
    },
    publishProcess(pid, alive) {
      lastProcessEvent = { type: '__process', pid, alive };
      server.publish(EVENTS_TOPIC, JSON.stringify(lastProcessEvent));
    },
    publishStatus(text) {
      lastStatusEvent = { type: 'status', text };
      server.publish(EVENTS_TOPIC, JSON.stringify(lastStatusEvent));
    },
    url,
    close() {
      server.stop();
    },
  };
}
