import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawn } from 'node:child_process';

/**
 * Load a compiled script from dist/scripts/ directory
 * Falls back to checking src/scripts/ for development
 */
export function loadScript(scriptName: string): string {
  const root = findRepoRoot();
  const candidates = [
    join(root, 'packages', 'exoproc', 'dist', 'scripts', `${scriptName}.js`),
    join(root, 'packages', 'exoproc', 'src', 'scripts', `${scriptName}.ts`),
    join(
      root,
      'packages',
      'exoproc-tool',
      'dist',
      'scripts',
      `${scriptName}.js`,
    ),
    join(
      root,
      'packages',
      'exoproc-tool',
      'src',
      'scripts',
      `${scriptName}.ts`,
    ),
    join(root, 'packages', 'neptune', 'dist', 'scripts', `${scriptName}.js`),
    join(root, 'packages', 'neptune', 'src', 'scripts', `${scriptName}.ts`),
    join(
      root,
      'packages',
      'neptune-tool',
      'dist',
      'scripts',
      `${scriptName}.js`,
    ),
    join(
      root,
      'packages',
      'neptune-tool',
      'src',
      'scripts',
      `${scriptName}.ts`,
    ),
    join(import.meta.dirname, '..', 'scripts', `${scriptName}.js`),
    join(import.meta.dirname, '..', 'scripts', `${scriptName}.ts`),
    join(import.meta.dirname, 'scripts', `${scriptName}.js`),
    join(import.meta.dirname, 'scripts', `${scriptName}.ts`),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, 'utf8');
  }
  throw new Error(`Script not found: ${scriptName}`);
}

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

export interface StatusResponse {
  alive: boolean;
  attached: boolean;
  daemonPid: number;
  pid?: number | null;
  targetName?: string | null;
  windowTitle?: string | null;
  profile?: string | null;
  port: number;
  uptime: number;
  upgraded?: boolean;
  agentPort?: number | null;
}

export interface CandidateProcess {
  pid: number;
  name: string;
  windowTitle?: string;
  isMinecraft: boolean;
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
          existsSync(join(curr, 'exoproc-tool')) ||
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

export function getDaemonState(): DaemonState | null {
  const root = findRepoRoot();
  const paths = [
    join(root, 'tmp', '.exoproc-daemon.json'),
    join(root, 'tmp', '.exoproc-tool-daemon.json'),
    join(root, 'tmp', '.neptune-daemon.json'),
    join(root, 'tmp', '.neptune-tool-daemon.json'),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, 'utf8'));
      } catch {}
    }
  }
  return null;
}

export function getDaemonEndpoint(): {
  host: string;
  port: number;
  isRemote: boolean;
} {
  const envHost =
    process.env.HOST || process.env.EXOPROC_HOST || process.env.NEPTUNE_HOST;
  const envPortStr =
    process.env.PORT || process.env.EXOPROC_PORT || process.env.NEPTUNE_PORT;
  const envPort = envPortStr ? parseInt(envPortStr, 10) : undefined;

  if (envHost && envPort) {
    const isRemote = envHost !== '127.0.0.1' && envHost !== 'localhost';
    return { host: envHost, port: envPort, isRemote };
  }

  const state = getDaemonState();
  const host = envHost || '127.0.0.1';
  const port = envPort || state?.port || 0;
  const isRemote = host !== '127.0.0.1' && host !== 'localhost';
  return { host, port, isRemote };
}

export async function checkDaemonAlive(
  portOrHost: number | string,
  port?: number,
): Promise<StatusResponse | null> {
  const host = typeof portOrHost === 'string' ? portOrHost : '127.0.0.1';
  const p = typeof portOrHost === 'number' ? portOrHost : (port ?? 0);
  if (!p) return null;
  try {
    const res = await fetch(`http://${host}:${p}/status`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    return (await res.json()) as StatusResponse;
  } catch {
    return null;
  }
}

export async function ensureDaemon(): Promise<{ host: string; port: number }> {
  const { host, port, isRemote } = getDaemonEndpoint();

  if (port) {
    const status = await checkDaemonAlive(host, port);
    if (status && status.alive) {
      return { host, port };
    }
  }

  if (isRemote) {
    throw new Error(
      `Remote Exoproc daemon at ${host}:${port} is not reachable.`,
    );
  }

  // On Windows, Exoproc acts directly as the tool without requiring a background daemon
  if (process.platform === 'win32' && !process.env.EXOPROC_FORCE_DAEMON) {
    return { host: '127.0.0.1', port: port || 0 };
  }

  // Not running, launch local daemon in background (standby mode)
  console.log(
    '⚡ Exoproc daemon not active. Launching daemon in background...',
  );
  const root = findRepoRoot();
  const daemonExe = existsSync(
    join(
      root,
      'packages',
      'exoproc',
      'dist',
      'daemon',
      'standalone',
      'exoproc-daemon.exe',
    ),
  )
    ? join(
        root,
        'packages',
        'exoproc',
        'dist',
        'daemon',
        'standalone',
        'exoproc-daemon.exe',
      )
    : join(
        root,
        'packages',
        'exoproc-daemon',
        'standalone',
        'exoproc-daemon.exe',
      );
  const daemonJs = existsSync(
    join(
      root,
      'packages',
      'exoproc',
      'dist',
      'daemon',
      'standalone',
      'exoproc-daemon.js',
    ),
  )
    ? join(
        root,
        'packages',
        'exoproc',
        'dist',
        'daemon',
        'standalone',
        'exoproc-daemon.js',
      )
    : join(
        root,
        'packages',
        'exoproc-daemon',
        'standalone',
        'exoproc-daemon.js',
      );
  const exoprocDaemonDist = join(
    root,
    'packages',
    'exoproc',
    'dist',
    'daemon',
    'cli.js',
  );
  const exoprocDaemonSrc = join(
    root,
    'packages',
    'exoproc',
    'src',
    'daemon',
    'cli.ts',
  );
  const neptuneDaemonDist = join(
    root,
    'packages',
    'neptune',
    'dist',
    'daemon',
    'cli.js',
  );
  const neptuneDaemonSrc = join(
    root,
    'packages',
    'neptune',
    'src',
    'daemon',
    'cli.ts',
  );
  const targetScript = existsSync(daemonJs)
    ? daemonJs
    : existsSync(exoprocDaemonDist)
      ? exoprocDaemonDist
      : existsSync(exoprocDaemonSrc)
        ? exoprocDaemonSrc
        : existsSync(neptuneDaemonDist)
          ? neptuneDaemonDist
          : existsSync(neptuneDaemonSrc)
            ? neptuneDaemonSrc
            : null;

  const winBunDir =
    process.env.BUN_WIN_DIR ||
    join(process.env.HOME || '', 'Downloads', 'bun-windows-x64');
  const winBunExe = join(winBunDir, 'bun.exe');
  const env = { ...process.env, WINEDEBUG: process.env.WINEDEBUG || '-all' };

  if (process.platform === 'win32') {
    if (existsSync(daemonExe)) {
      const child = spawn(daemonExe, ['daemon'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    } else if (targetScript) {
      const child = spawn('bun', ['run', targetScript, 'daemon'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    } else {
      throw new Error(
        'Neptune daemon binary or script not found. Please build with `bun run daemon:build`.',
      );
    }
  } else {
    // Linux / Wine environment
    if (existsSync(daemonExe)) {
      const child = spawn('wine', [daemonExe, 'daemon'], {
        detached: true,
        stdio: 'ignore',
        env,
      });
      child.unref();
    } else if (targetScript && existsSync(winBunExe)) {
      const child = spawn('wine', [winBunExe, targetScript, 'daemon'], {
        detached: true,
        stdio: 'ignore',
        env,
      });
      child.unref();
    } else if (targetScript) {
      const child = spawn('bun', ['run', targetScript, 'daemon'], {
        detached: true,
        stdio: 'ignore',
        env,
      });
      child.unref();
    } else {
      throw new Error(
        'Neptune daemon binary or bundle not found. Please build with `bun run daemon:build`.',
      );
    }
  }

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const state = getDaemonState();
    if (state && state.port) {
      const aliveStatus = await checkDaemonAlive('127.0.0.1', state.port);
      if (aliveStatus && aliveStatus.alive) {
        return { host: '127.0.0.1', port: state.port };
      }
    }
  }

  throw new Error(
    'Neptune daemon started in background but failed liveness check.',
  );
}

export async function attachRemote(options?: {
  pid?: number;
  profile?: string;
}): Promise<{
  success: boolean;
  pid?: number;
  targetName?: string;
  windowTitle?: string;
  error?: string;
}> {
  const { host, port } = await ensureDaemon();
  const res = await fetch(`http://${host}:${port}/attach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });
  return (await res.json()) as any;
}

export async function detachRemote(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const { host, port } = getDaemonEndpoint();
  if (!port) return { success: false, error: 'No active daemon endpoint' };
  try {
    const res = await fetch(`http://${host}:${port}/detach`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    });
    return (await res.json()) as any;
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function shutdownRemote(): Promise<{
  success: boolean;
  message?: string;
}> {
  const { host, port } = getDaemonEndpoint();
  if (!port) return { success: false };
  try {
    const res = await fetch(`http://${host}:${port}/shutdown`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    });
    return (await res.json()) as any;
  } catch {
    return { success: true };
  }
}

export async function listProcessesRemote(): Promise<CandidateProcess[]> {
  const { host, port } = await ensureDaemon();
  const res = await fetch(`http://${host}:${port}/processes`);
  const data = (await res.json()) as any;
  return data.processes || [];
}

export async function evalRemote(
  code: string,
  globals?: Record<string, any>,
  timeoutMs?: number,
  options?: any,
): Promise<{ success: boolean; result?: any; logs: string[]; error?: string }> {
  const { host, port } = await ensureDaemon();
  const res = await fetch(`http://${host}:${port}/eval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, globals, ...(options || {}) }),
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  return (await res.json()) as any;
}

export async function runRemote(
  scriptPath?: string,
  scriptCode?: string,
  globals?: Record<string, any>,
  timeoutMs?: number,
  options?: any,
): Promise<{ success: boolean; result?: any; logs: string[]; error?: string }> {
  const { host, port } = await ensureDaemon();
  let code = scriptCode ?? '';
  if (!code && scriptPath) {
    const abs = resolve(process.cwd(), scriptPath);
    if (!existsSync(abs)) {
      throw new Error(`Local script file not found: ${abs}`);
    }
    code = readFileSync(abs, 'utf8');
  }

  const res = await fetch(`http://${host}:${port}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scriptCode: code, globals, ...(options || {}) }),
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  return (await res.json()) as any;
}

export interface ScreenshotRemoteResult {
  success: boolean;
  filePath?: string;
  path?: string;
  width?: number;
  height?: number;
  windowTitle?: string;
  base64?: string;
  error?: string;
}

export async function screenshotRemote(
  outputPath?: string,
): Promise<ScreenshotRemoteResult> {
  const { host, port } = await ensureDaemon();
  const res = await fetch(`http://${host}:${port}/screenshot`);

  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('image/png') || res.status === 200) {
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let localOutPath = outputPath;
    if (!localOutPath) {
      const root = findRepoRoot();
      const tmpDir = join(root, 'tmp');
      if (!existsSync(tmpDir)) {
        try {
          mkdirSync(tmpDir, { recursive: true });
        } catch {}
      }
      localOutPath = join(tmpDir, `screenshot-${Date.now()}.png`);
    } else {
      localOutPath = resolve(process.cwd(), localOutPath);
    }

    const dir = dirname(localOutPath);
    if (!existsSync(dir)) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch {}
    }

    writeFileSync(localOutPath, buffer);

    const width = parseInt(res.headers.get('x-image-width') || '0', 10);
    const height = parseInt(res.headers.get('x-image-height') || '0', 10);
    const titleHeader = res.headers.get('x-window-title');
    const windowTitle = titleHeader
      ? decodeURIComponent(titleHeader)
      : undefined;

    return {
      success: true,
      filePath: localOutPath,
      width: width || undefined,
      height: height || undefined,
      windowTitle,
    };
  }

  // Error case
  try {
    const errData = (await res.json()) as any;
    return { success: false, error: errData.error || `HTTP ${res.status}` };
  } catch {
    return {
      success: false,
      error: `Failed to capture screenshot (HTTP ${res.status})`,
    };
  }
}

export async function fetchScreenshot(): Promise<{
  buffer: Buffer;
  width?: number;
  height?: number;
  base64?: string;
  windowTitle?: string;
}> {
  const { host, port } = await ensureDaemon();
  const res = await fetch(`http://${host}:${port}/screenshot`);
  if (!res.ok) {
    throw new Error(`Failed to capture screenshot: HTTP ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const width = parseInt(res.headers.get('x-image-width') || '0', 10);
  const height = parseInt(res.headers.get('x-image-height') || '0', 10);
  const titleHeader = res.headers.get('x-window-title');
  const windowTitle = titleHeader ? decodeURIComponent(titleHeader) : undefined;
  return {
    buffer,
    width: width || undefined,
    height: height || undefined,
    base64: buffer.toString('base64'),
    windowTitle,
  };
}

let agentMappingPool: any = null;
let agentContextCache: any = null;
let activeMinecraftClient: any = null;
let activeMinecraftMappings: any = null;
let minecraftInitPromise: any = null;
let cachedTargetMode: any = null;

export const DEFAULT_AGENT_PORT = 43378;
export const DEFAULT_EXOPROC_PORT = 43377;
export const DEFAULT_NEPTUNE_PORT = 43377;

export async function probeEndpoint(
  host: string,
  port: number,
): Promise<{ mode: 'daemon' | 'agent' | 'none'; alive: boolean }> {
  try {
    const res = await fetch(`http://${host}:${port}/status`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return { mode: 'none', alive: false };
    const json = (await res.json()) as any;
    if (json.alive) {
      if (typeof json.uptime === 'number' && json.daemonPid === undefined) {
        return { mode: 'agent', alive: true };
      }
      return { mode: 'daemon', alive: true };
    }
  } catch {}
  return { mode: 'none', alive: false };
}

export async function getTargetMode(
  host: string,
  port: number,
): Promise<'daemon' | 'agent' | 'none'> {
  const now = Date.now();
  if (
    cachedTargetMode &&
    cachedTargetMode.host === host &&
    cachedTargetMode.port === port &&
    now - cachedTargetMode.timestamp < 5000
  ) {
    return cachedTargetMode.mode;
  }
  const probe = await probeEndpoint(host, port);
  const mode = probe.mode;
  cachedTargetMode = { host, port, mode, timestamp: now };
  return mode;
}

function resolveMappingsPkg(): any {
  try {
    return require('exoproc-mappings');
  } catch {}
  try {
    return require('njava-mappings');
  } catch {}
  const root = findRepoRoot();
  const candidates = [
    join(root, 'packages', 'njava-mappings', 'dist', 'index.js'),
    join(root, 'packages', 'njava-mappings', 'src', 'index.ts'),
    join(root, 'packages', 'exoproc-mappings', 'dist', 'index.js'),
    join(root, 'packages', 'exoproc-mappings', 'src', 'index.ts'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        return require(c);
      } catch {}
    }
  }
  return null;
}

export function getAgentMappingPool(): any {
  if (!agentMappingPool) {
    try {
      const mappingsMod = resolveMappingsPkg();
      if (mappingsMod) {
        const { loadDatabase, createPool } = mappingsMod;
        try {
          const db = loadDatabase();
          agentMappingPool = createPool({ databases: [db] });
        } catch {
          agentMappingPool = createPool();
        }
        const root = findRepoRoot();
        const candidates = [
          resolve(process.cwd(), 'mappings.json'),
          resolve(process.cwd(), 'live-crawled-mappings.json'),
          resolve(dirname(process.cwd()), 'mappings.json'),
          resolve(root, 'packages/exoproc/live-crawled-mappings.json'),
          resolve(root, 'packages/exoproc/mappings.json'),
          resolve(root, 'packages/minecraft/src/mappings/mappings-1.8.9.json'),
        ];
        for (const p of candidates) {
          if (existsSync(p)) {
            try {
              mappingsMod.loadMappings(p, agentMappingPool);
              break;
            } catch {}
          }
        }
      }
    } catch {}

    if (!agentMappingPool) {
      agentMappingPool = {
        resolveClass: (c: string) => c,
        resolveField: (_c: string, f: string) => f,
        resolveMethod: (_c: string, m: string) => m,
        getAllDetected: () => [],
      };
    }
  }
  return agentMappingPool;
}

export function loadAgentMappingPool(sourcePath?: string): any {
  const pool = getAgentMappingPool();
  if (sourcePath) {
    const abs = resolve(process.cwd(), sourcePath);
    if (!existsSync(abs)) {
      throw new Error(`Mappings pool file not found: ${abs}`);
    }
    try {
      const mappingsMod = resolveMappingsPkg();
      if (mappingsMod?.loadMappings) {
        mappingsMod.loadMappings(abs, pool);
      }
    } catch {}
  }
  return pool;
}

export function getAgentJavaContext(host: string, port: number): any {
  const key = `${host}:${port}`;
  if (agentContextCache && agentContextCache.key === key) {
    return agentContextCache.context;
  }
  const pool = getAgentMappingPool();
  const njavaPkg = 'bun-njava';
  const { createAgentContext } = require(njavaPkg);
  const context = createAgentContext({ host, port, sync: true, pool });
  agentContextCache = { key, context };
  return context;
}

export async function isMinecraftTarget(
  host: string,
  port: number,
): Promise<boolean> {
  if (activeMinecraftClient) return true;
  if (
    process.env.NEPTUNE_MINECRAFT === '1' ||
    process.env.NEPTUNE_MINECRAFT === 'true'
  )
    return true;
  const status = (await checkDaemonAlive(host, port)) as any;
  if (!status) return false;
  if (status.isMinecraft) return true;
  if (status.targetName?.toLowerCase().includes('minecraft')) return true;
  if (status.windowTitle?.toLowerCase().includes('minecraft')) return true;
  if (status.targetJar?.toLowerCase().includes('minecraft')) return true;
  if (status.classpath?.toLowerCase().includes('minecraft')) return true;
  if (status.mode === 'agent') {
    try {
      const java = getAgentJavaContext(host, port);
      const obf =
        java.pool?.resolveClass?.('net.minecraft.client.Minecraft') || 'ave';
      const cls = java.bridge.findClassSync
        ? java.bridge.findClassSync(obf)
        : await java.bridge.findClass(obf);
      if (cls) return true;
      const canonicalCls = java.bridge.findClassSync
        ? java.bridge.findClassSync('net.minecraft.client.Minecraft')
        : await java.bridge.findClass('net.minecraft.client.Minecraft');
      if (canonicalCls) return true;
    } catch {}
  }
  return false;
}

export async function ensureMinecraft(
  host?: string,
  port?: number,
  options?: any,
): Promise<any> {
  if (activeMinecraftClient) {
    return activeMinecraftClient;
  }
  if (minecraftInitPromise) {
    return await minecraftInitPromise;
  }
  const ep = host && port ? { host, port } : await ensureDaemon();
  const effectiveHost = host ?? ep.host;
  const effectivePort = port ?? ep.port;

  if (options?.poolPath) {
    loadAgentMappingPool(options.poolPath);
  }
  const isMc =
    options?.force || (await isMinecraftTarget(effectiveHost, effectivePort));
  if (!isMc) {
    return null;
  }
  minecraftInitPromise = (async () => {
    try {
      const java = getAgentJavaContext(effectiveHost, effectivePort);
      const { MinecraftClient } = await import('exoproc-minecraft');
      activeMinecraftClient =
        typeof (MinecraftClient as any).from === 'function'
          ? await (MinecraftClient as any).from(java, options)
          : await (MinecraftClient as any).attach(java, options);
      activeMinecraftMappings = activeMinecraftClient?.mappings ?? null;
      return activeMinecraftClient;
    } catch (err) {
      if (process.env.DEBUG || process.env.NEPTUNE_DEBUG || options?.force) {
        console.error('[ensureMinecraft Error]', err);
      }
      return null;
    } finally {
      minecraftInitPromise = null;
    }
  })();
  return await minecraftInitPromise;
}

export function getMinecraftMappings(): any {
  return activeMinecraftMappings;
}

export async function getMinecraftClient(options?: any): Promise<any> {
  const { host, port } = await ensureDaemon();
  return await ensureMinecraft(host, port, options);
}

export function resetMinecraftClient(): void {
  activeMinecraftClient = null;
  activeMinecraftMappings = null;
  minecraftInitPromise = null;
}

export async function upgradeRemote(options?: {
  classPath?: string;
  bytecode?: string | Uint8Array;
  className?: string;
  port?: number;
  obfuscate?: boolean;
  targetVersion?: number;
}): Promise<{
  success: boolean;
  port: number;
  className?: string;
  upgraded?: boolean;
  error?: string;
}> {
  const { host, port } = await ensureDaemon();
  const payload: any = { ...options };
  if (options?.bytecode instanceof Uint8Array) {
    payload.bytecode = Buffer.from(options.bytecode).toString('base64');
  }
  const res = await fetch(`http://${host}:${port}/upgrade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as any;
}
