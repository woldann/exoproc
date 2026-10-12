import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
} from 'node:fs';
import { resolve, join, dirname } from 'node:path';

export interface DaemonState {
  daemonPid: number;
  port: number;
  url: string;
  startedAt: number;
  attached: boolean;
  pid?: number | null;
  targetName?: string | null;
  windowTitle?: string | null;
  profile?: string | null;
  upgraded?: boolean;
  agentPort?: number | null;
}

export function findRepoRoot(): string {
  const starts = [
    resolve(process.cwd()),
    typeof import.meta !== 'undefined' && import.meta.dirname
      ? resolve(import.meta.dirname)
      : '',
  ].filter(Boolean);

  for (const start of starts) {
    let curr = start;
    for (let i = 0; i < 6; i++) {
      if (
        existsSync(join(curr, 'bunfig.toml')) &&
        (existsSync(join(curr, 'bun-wine')) ||
          existsSync(join(curr, 'neptune-tool')) ||
          existsSync(join(curr, 'package.json')))
      ) {
        return curr;
      }
      const parent = dirname(curr);
      if (parent === curr) break;
      curr = parent;
    }
  }
  return resolve(process.cwd());
}

export function getDaemonStatePath(): string {
  const root = findRepoRoot();
  const tmpDir = join(root, 'tmp');
  if (existsSync(tmpDir)) {
    return join(tmpDir, '.neptune-daemon.json');
  }
  try {
    mkdirSync(tmpDir, { recursive: true });
    return join(tmpDir, '.neptune-daemon.json');
  } catch {
    return join(root, '.neptune-daemon.json');
  }
}

export function readDaemonState(): DaemonState | null {
  try {
    const path = getDaemonStatePath();
    if (!existsSync(path)) return null;
    const content = readFileSync(path, 'utf8');
    return JSON.parse(content) as DaemonState;
  } catch {
    return null;
  }
}

export function writeDaemonState(state: DaemonState): void {
  const path = getDaemonStatePath();
  writeFileSync(path, JSON.stringify(state, null, 2), 'utf8');
}

export function clearDaemonState(): void {
  try {
    const path = getDaemonStatePath();
    if (existsSync(path)) {
      unlinkSync(path);
    }
  } catch {}
}

export async function isDaemonAlive(
  state: DaemonState,
  timeoutMs = 3000,
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`http://127.0.0.1:${state.port}/status`, {
      signal: controller.signal,
    });
    clearTimeout(id);
    if (!res.ok) return false;
    const data = (await res.json()) as any;
    return Boolean(data && data.alive);
  } catch {
    return false;
  }
}
