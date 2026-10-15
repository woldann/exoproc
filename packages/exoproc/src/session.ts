import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { getCacheDir } from 'exoproc-utils';
import { HostAccessor, withFileLockSync } from 'bun-xffi';

// ── Agent Slots (Max 3 slots, sequential ports) ──────────────────────
export const AGENT_SLOTS = [43378, 43379, 43380] as const;
export type AgentSlot = 1 | 2 | 3;

export function getPortForSlot(slot: AgentSlot): number {
  return AGENT_SLOTS[(slot - 1) as 0 | 1 | 2];
}

export function getSlotForPort(port: number): AgentSlot | null {
  const idx = (AGENT_SLOTS as readonly number[]).indexOf(port);
  return idx !== -1 ? ((idx + 1) as AgentSlot) : null;
}

export interface AgentSlotInfo {
  slot: AgentSlot;
  port: number;
  alive: boolean;
  status?: any;
}

export async function checkAgentSlot(
  slot: AgentSlot,
  host = '127.0.0.1',
  timeoutMs = 500,
): Promise<AgentSlotInfo> {
  const port = getPortForSlot(slot);
  try {
    const res = await fetch(`http://${host}:${port}/status`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return { slot, port, alive: false };
    }
    const status = (await res.json()) as any;
    return {
      slot,
      port,
      alive: Boolean(status && (status.alive || status.uptime !== undefined)),
      status,
    };
  } catch {
    return { slot, port, alive: false };
  }
}

export async function checkAllAgentSlots(
  host = '127.0.0.1',
  timeoutMs = 500,
): Promise<AgentSlotInfo[]> {
  return await Promise.all(
    ([1, 2, 3] as AgentSlot[]).map((slot) =>
      checkAgentSlot(slot, host, timeoutMs),
    ),
  );
}

export async function getNextAvailableAgentSlot(
  host = '127.0.0.1',
): Promise<{ slot: AgentSlot; port: number }> {
  const slots = await checkAllAgentSlots(host, 500);
  const freeSlot = slots.find((s) => !s.alive);
  if (!freeSlot) {
    throw new Error(
      `All 3 agent slots are currently in use (ports 43378, 43379, 43380). Stop an existing agent or select an active slot.`,
    );
  }
  return { slot: freeSlot.slot, port: freeSlot.port };
}

// ── Session Directory & Active Target Management ──────────────────────

export function getSessionsDir(): string {
  const dir = getCacheDir('sessions');
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {}
  }
  return dir;
}

export function getSessionPath(pid: number): string {
  return join(getSessionsDir(), `session-${pid}.json`);
}

export function getActiveTargetPath(): string {
  return join(getCacheDir(), 'active-target.json');
}

export type ActiveTarget =
  | {
      type: 'accessor';
      pid: number;
      sessionPath: string;
      processName?: string;
      windowTitle?: string;
      updatedAt: string;
    }
  | {
      type: 'agent';
      slot: AgentSlot;
      port: number;
      host?: string;
      pid?: number;
      processName?: string;
      windowTitle?: string;
      updatedAt: string;
    };

export function getActiveTarget(): ActiveTarget | null {
  const path = getActiveTargetPath();
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw) as ActiveTarget;
  } catch {
    return null;
  }
}

export function setActiveTarget(target: ActiveTarget | null): void {
  const path = getActiveTargetPath();
  if (!target) {
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {}
    return;
  }
  withFileLockSync(path, () => {
    writeFileSync(path, JSON.stringify(target, null, 2), 'utf8');
  });
}

export function clearActiveTarget(): void {
  setActiveTarget(null);
}

export interface SavedSessionInfo {
  pid: number;
  sessionPath: string;
  accessorType: string;
  savedAt?: string;
  metadata?: Record<string, any>;
  exists: boolean;
}

export function listSavedSessions(): SavedSessionInfo[] {
  const dir = getSessionsDir();
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir);
  const sessions: SavedSessionInfo[] = [];

  for (const file of entries) {
    if (!file.startsWith('session-') || !file.endsWith('.json')) continue;
    const fullPath = join(dir, file);
    try {
      const session = HostAccessor.loadSession(fullPath);
      sessions.push({
        pid: session.processId,
        sessionPath: fullPath,
        accessorType: session.accessorType,
        savedAt: session.savedAt,
        metadata: session.metadata,
        exists: true,
      });
    } catch {
      // file might be locked, corrupted, or being consumed
    }
  }

  return sessions.sort((a, b) =>
    (b.savedAt ?? '').localeCompare(a.savedAt ?? ''),
  );
}

export async function listAllTargets(host = '127.0.0.1'): Promise<{
  active: ActiveTarget | null;
  sessions: SavedSessionInfo[];
  agents: AgentSlotInfo[];
}> {
  const active = getActiveTarget();
  const sessions = listSavedSessions();
  const agents = await checkAllAgentSlots(host);
  return { active, sessions, agents };
}

export async function selectTarget(
  selector: string | number,
  host = '127.0.0.1',
): Promise<ActiveTarget> {
  const s = String(selector).trim().toLowerCase();

  // 1. Check if selecting an agent slot: 1, 2, 3, "slot-1", "agent:1", or port 43378..43380
  let targetSlot: AgentSlot | null = null;
  if (
    s === '1' ||
    s === 'slot-1' ||
    s === 'slot:1' ||
    s === 'agent:1' ||
    s === 'agent-1' ||
    s === '43378'
  ) {
    targetSlot = 1;
  } else if (
    s === '2' ||
    s === 'slot-2' ||
    s === 'slot:2' ||
    s === 'agent:2' ||
    s === 'agent-2' ||
    s === '43379'
  ) {
    targetSlot = 2;
  } else if (
    s === '3' ||
    s === 'slot-3' ||
    s === 'slot:3' ||
    s === 'agent:3' ||
    s === 'agent-3' ||
    s === '43380'
  ) {
    targetSlot = 3;
  }

  if (targetSlot !== null) {
    const slotInfo = await checkAgentSlot(targetSlot, host);
    if (!slotInfo.alive) {
      throw new Error(
        `Agent slot ${targetSlot} (port ${slotInfo.port}) is not running or responding. Start/upgrade an agent first.`,
      );
    }
    const target: ActiveTarget = {
      type: 'agent',
      slot: targetSlot,
      port: slotInfo.port,
      host,
      processName: slotInfo.status?.targetName || 'Minecraft (Java Agent)',
      windowTitle: slotInfo.status?.windowTitle,
      updatedAt: new Date().toISOString(),
    };
    setActiveTarget(target);
    return target;
  }

  // 2. Check if selecting a PID or session file
  const num = parseInt(
    s
      .replace(/^session-/, '')
      .replace(/\.json$/, '')
      .replace(/^pid:/, ''),
    10,
  );
  if (!isNaN(num) && num > 0) {
    const sessionPath = getSessionPath(num);
    if (!existsSync(sessionPath)) {
      const sessions = listSavedSessions();
      const match = sessions.find((item) => item.pid === num);
      if (!match) {
        throw new Error(
          `No saved accessor session found for PID ${num}. Run \`exoproc attach ${num}\` to attach first.`,
        );
      }
    }
    let metadata: any = {};
    try {
      const sess = HostAccessor.loadSession(sessionPath);
      metadata = sess.metadata ?? {};
    } catch {}

    const target: ActiveTarget = {
      type: 'accessor',
      pid: num,
      sessionPath,
      processName: metadata.processName,
      windowTitle: metadata.windowTitle,
      updatedAt: new Date().toISOString(),
    };
    setActiveTarget(target);
    return target;
  }

  throw new Error(
    `Unrecognized target selector: "${selector}". Use 1, 2, 3 for agent slots or specify a PID for accessor sessions.`,
  );
}

// ── Transactional Accessor Execution ─────────────────────────────────

export async function withActiveAccessor<T>(
  fn: (accessor: any, sessionPath: string) => Promise<T>,
): Promise<T> {
  let active = getActiveTarget();

  if (!active || active.type !== 'accessor') {
    // Auto-discover if single session exists
    const sessions = listSavedSessions();
    if (sessions.length === 1 && sessions[0]) {
      const s = sessions[0];
      active = {
        type: 'accessor',
        pid: s.pid,
        sessionPath: s.sessionPath,
        processName: s.metadata?.processName,
        windowTitle: s.metadata?.windowTitle,
        updatedAt: new Date().toISOString(),
      };
      setActiveTarget(active);
    } else if (sessions.length > 1) {
      throw new Error(
        `Multiple saved accessor sessions exist (${sessions.map((s) => s.pid).join(', ')}). Select one using \`exoproc select <pid>\`.`,
      );
    } else {
      throw new Error(
        'No active accessor session found. Attach to a process with `exoproc attach [pid]` first.',
      );
    }
  }

  const sessionPath = active.sessionPath;
  if (!existsSync(sessionPath)) {
    throw new Error(
      `Active session file for PID ${active.pid} not found: ${sessionPath}. Target process may have exited.`,
    );
  }

  // Load accessor: acquires lock, consumes session file, rehydrates instance
  const { createAccessorFromFile } = await import('exoproc-accessors');
  const accessor = await createAccessorFromFile(sessionPath);

  try {
    return await fn(accessor, sessionPath);
  } finally {
    if (accessor && !(accessor as any).isSealed) {
      // Re-save & hibernate the accessor stack back to the session path under file lock
      await (accessor as any).save(sessionPath);
    }
  }
}
