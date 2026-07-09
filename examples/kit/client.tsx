/**
 * Shared React primitives for every example's demo GUI -- keeps each
 * example's own `client.tsx` down to just its page-specific bits.
 *
 * `Button`/`Checkbox`/`Label` are the real shadcn/ui components (installed
 * via `bunx --bun shadcn@latest add <name>` into `components/ui/`, on top
 * of Radix primitives) -- this file only adds the app-specific composites
 * (`DemoShell`, `StatusBar`, `EventLog`, `useSocket`) that shadcn doesn't
 * provide.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Moon, Sun, TerminalSquare } from 'lucide-react';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Label } from '../components/ui/label.js';
import { ThemeProvider, useTheme } from '../components/theme-provider.js';

export { Button, ThemeProvider, useTheme };

interface ProcessInfo {
  pid: number;
  alive: boolean;
}

/**
 * Kit-level connection used only by the navbar: reads the `__init` (example
 * name) and `__process` messages every `createDemo()` server sends/
 * broadcasts. Independent from each example's own `useSocket()` connection
 * -- the two just happen to share the same `/ws` endpoint and silently
 * ignore each other's message types.
 */
function useDemoMeta() {
  const [name, setName] = useState('');
  const [process, setProcess] = useState<ProcessInfo | null>(null);

  useEffect(() => {
    const ws = new WebSocket('ws://' + location.host + '/ws');
    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.type === '__init') setName(msg.name);
      else if (msg.type === '__process')
        setProcess({ pid: msg.pid, alive: msg.alive });
    };
    return () => ws.close();
  }, []);

  return { name, process };
}

/**
 * Top bar shared by every demo -- project identity, the example's name,
 * live process status, and the theme toggle. Rendered automatically by
 * `mountDemo()`; an example's own `client.tsx` never adds it itself.
 * Everything below it (the actual demo UI) is each example's own
 * responsibility.
 */
function Navbar() {
  const { theme, setTheme } = useTheme();
  const { name, process } = useDemoMeta();
  const isDark = theme === 'dark';

  return (
    <div className="mb-6 flex items-center justify-between border-b pb-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <TerminalSquare className="h-4 w-4 text-primary" />
        exoproc examples
        {name && <span className="text-muted-foreground/60">/ {name}</span>}
        {process && (
          <Badge variant={process.alive ? 'default' : 'secondary'}>
            pid {process.pid} &middot; {process.alive ? 'running' : 'exited'}
          </Badge>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </div>
  );
}

/**
 * Mounts `children` into `#root`, wrapped in the shared `ThemeProvider` and
 * `Navbar` -- every example's `client.tsx` ends with `mountDemo(<App />)`
 * instead of hand-rolling `createRoot`/`getElementById`/theming/a navbar
 * each time.
 */
export function mountDemo(children: ReactNode): void {
  const container = document.getElementById('root');
  if (!container) throw new Error('#root element not found');
  createRoot(container).render(
    <ThemeProvider defaultTheme="dark">
      <Navbar />
      {children}
    </ThemeProvider>,
  );
}

export function DemoShell({
  subtitle,
  children,
}: {
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-2xl shadow-black/40">
      {subtitle && (
        <div className="mb-4 text-sm text-muted-foreground">{subtitle}</div>
      )}
      {children}
    </div>
  );
}

export function StatusBar({ status }: { status: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-emerald-400">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      {status}
    </div>
  );
}

export function LabeledCheckbox({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <Label htmlFor={id} className="text-muted-foreground">
        {label}
      </Label>
    </div>
  );
}

export function EventLog<T>({
  items,
  render,
  empty,
}: {
  items: T[];
  render: (item: T, index: number) => ReactNode;
  empty: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [items]);

  return (
    <div
      ref={ref}
      className="mt-4 max-h-[60vh] min-h-16 overflow-y-auto break-words rounded-lg border bg-background/60 p-4 leading-loose"
    >
      {items.length === 0 ? (
        <span className="text-muted-foreground">{empty}</span>
      ) : (
        items.map((item, i) => (
          <span
            key={i}
            className="mb-1 mr-1 inline-block rounded border bg-secondary px-2 py-0.5 text-secondary-foreground"
          >
            {render(item, i)}
          </span>
        ))
      )}
    </div>
  );
}

/**
 * Owns the `/ws` connection: parses incoming JSON messages as `T` and hands
 * them to `onEvent`, and returns a `send` function plus live `connected`
 * state (matches the connection itself, not any server-pushed status text).
 */
export function useSocket<T>(onEvent: (msg: T) => void): {
  send: (data: string) => void;
  connected: boolean;
} {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const ws = new WebSocket('ws://' + location.host + '/ws');
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (evt) => onEventRef.current(JSON.parse(evt.data));
    return () => ws.close();
  }, []);

  return {
    send: (data) => wsRef.current?.send(data),
    connected,
  };
}
