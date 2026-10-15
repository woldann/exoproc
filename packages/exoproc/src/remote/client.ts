import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import {
  getCacheDir,
  getAgentCacheDir,
  getDaemonStatePath,
} from '@woldann/exoproc-utils';

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
  version?: string;
  buildId?: string;
  upgraded?: boolean;
  agentPort?: number | null;
  nativeSupported?: boolean;
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

export function getDaemonStateDir(): string {
  return getCacheDir();
}

export function getDaemonState(): DaemonState | null {
  const paths = [
    getDaemonStatePath(),
    join(tmpdir(), '.exoproc-daemon.json'),
    join(tmpdir(), '.exoproc-tool-daemon.json'),
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
  const envHost = process.env.HOST || process.env.EXOPROC_HOST;
  const envPortStr = process.env.PORT || process.env.EXOPROC_PORT;
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

export async function checkAgentAlive(
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
    const json = (await res.json()) as StatusResponse;
    if (json.alive && (json as any).buildId) {
      loadAgentMappingsForBuildId((json as any).buildId);
    }
    return json;
  } catch {
    return null;
  }
}
export const checkDaemonAlive = checkAgentAlive;

export async function ensureAgentEndpoint(): Promise<{
  host: string;
  port: number;
}> {
  const { getActiveTarget, checkAgentSlot } = await import('../session.js');
  const active = getActiveTarget();

  if (active?.type === 'agent') {
    return { host: active.host || '127.0.0.1', port: active.port };
  }

  // Probe agent slots 1, 2, 3
  for (const slot of [1, 2, 3] as const) {
    const info = await checkAgentSlot(slot);
    if (info.alive) {
      return { host: '127.0.0.1', port: info.port };
    }
  }

  return { host: '127.0.0.1', port: 0 };
}
export const ensureDaemon = ensureAgentEndpoint;

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
  _timeoutMs?: number,
  options?: any,
): Promise<{ success: boolean; result?: any; logs: string[]; error?: string }> {
  const { getActiveTarget, withActiveAccessor, checkAgentSlot } =
    await import('../session.js');
  const { isToolMode } = await import('../capabilities.js');
  const active = getActiveTarget();

  if (active?.type === 'agent') {
    const isAlive = await checkAgentAlive(
      active.host ?? '127.0.0.1',
      active.port,
    );
    if (isAlive) {
      return await executeScriptWithAgent(
        active.host ?? '127.0.0.1',
        active.port,
        code,
        globals,
        options,
      );
    }
  }

  if (active?.type === 'accessor') {
    if (isToolMode()) {
      throw new Error(
        `Active target is an accessor session (PID: ${active.pid}), which requires native Windows x64 memory APIs.\n` +
          `You are running under Linux Bun. Please run via bun-wine instead:\n` +
          `  ./bun-wine dist-tests/exoproc-cli.js <command>`,
      );
    }
    return await withActiveAccessor(async (accessor) => {
      return await executeScriptWithAccessor(accessor, code, globals, options);
    });
  }

  // Fallback 1: check agent slots 1, 2, 3
  for (const slot of [1, 2, 3] as const) {
    const info = await checkAgentSlot(slot);
    if (info.alive) {
      return await executeScriptWithAgent(
        '127.0.0.1',
        info.port,
        code,
        globals,
        options,
      );
    }
  }

  // Fallback 2: auto-discovery of saved accessor session
  if (isToolMode()) {
    throw new Error(
      `No active Java agent reachable on port 43378-43380. Direct accessor sessions require Windows x64.\n` +
        `If targeting Minecraft running under Wine, please run via bun-wine:\n` +
        `  ./bun-wine dist-tests/exoproc-cli.js <command>`,
    );
  }

  try {
    return await withActiveAccessor(async (accessor) => {
      return await executeScriptWithAccessor(accessor, code, globals, options);
    });
  } catch (err: any) {
    throw new Error(
      'No active Exoproc target. Attach to a process with `exoproc attach [pid]` or select an active target with `exoproc select`.',
    );
  }
}

export async function runRemote(
  scriptPath?: string,
  scriptCode?: string,
  globals?: Record<string, any>,
  timeoutMs?: number,
  options?: any,
): Promise<{ success: boolean; result?: any; logs: string[]; error?: string }> {
  let code = scriptCode ?? '';
  if (!code && scriptPath) {
    const abs = resolve(process.cwd(), scriptPath);
    if (!existsSync(abs)) {
      throw new Error(`Local script file not found: ${abs}`);
    }
    code = readFileSync(abs, 'utf8');
  }
  return await evalRemote(code, globals, timeoutMs, options);
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
  const { getActiveTarget, withActiveAccessor } = await import('../session.js');
  const active = getActiveTarget();

  if (active?.type === 'accessor') {
    return await withActiveAccessor(async (accessor) => {
      const { captureScreenshot } = await import('../screenshot/index.js');
      const res = await captureScreenshot({ accessor, outputPath });
      return {
        success: res.success,
        filePath: res.filePath,
        path: res.filePath,
        width: res.width,
        height: res.height,
        windowTitle: res.windowTitle,
      };
    });
  }

  const { host, port } = await ensureDaemon();
  if (port) {
    const res = await fetch(`http://${host}:${port}/screenshot`);
    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('image/png') || res.status === 200) {
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let localOutPath = outputPath;
      if (!localOutPath) {
        localOutPath = resolve(process.cwd(), `screenshot-${Date.now()}.png`);
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
        path: localOutPath,
        width: width || undefined,
        height: height || undefined,
        windowTitle,
      };
    }
  }

  // Fallback to local capture
  try {
    const { captureScreenshot } = await import('../screenshot/index.js');
    const res = await captureScreenshot({ outputPath });
    return {
      success: res.success,
      filePath: res.filePath,
      path: res.filePath,
      width: res.width,
      height: res.height,
      windowTitle: res.windowTitle,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || String(err),
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
  const { getActiveTarget, withActiveAccessor } = await import('../session.js');
  const active = getActiveTarget();

  if (active?.type === 'accessor') {
    return await withActiveAccessor(async (accessor) => {
      const { captureScreenshot } = await import('../screenshot/index.js');
      const res = await captureScreenshot({ accessor });
      const buffer = res.filePath
        ? readFileSync(res.filePath)
        : Buffer.alloc(0);
      return {
        buffer,
        width: res.width,
        height: res.height,
        base64: buffer.toString('base64'),
        windowTitle: res.windowTitle,
      };
    });
  }

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

export async function executeScriptWithAccessor(
  accessor: any,
  sourceCode: string,
  globals?: Record<string, any>,
  options?: any,
): Promise<{ success: boolean; result?: any; logs: string[]; error?: string }> {
  const logs: string[] = [];
  const printFn = (...args: any[]) => {
    const line = args
      .map((a) => {
        if (typeof a === 'object' && a !== null) {
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        }
        return String(a);
      })
      .join(' ');
    logs.push(line);
  };

  try {
    let Java: any = null;
    try {
      const njava = await import('@woldann/bun-njava');
      Java =
        typeof accessor.getJavaSync === 'function'
          ? accessor.getJavaSync()
          : (njava as any).getJavaSync?.(accessor);
    } catch {}

    const javaProxy = Java
      ? new Proxy(
          {},
          {
            get(_t, pkg) {
              function makePkgProxy(current: string): any {
                return new Proxy(
                  {},
                  {
                    get(_t2, member) {
                      const fullName = `${current}.${String(member)}`;
                      try {
                        return Java.type(fullName);
                      } catch {
                        return makePkgProxy(fullName);
                      }
                    },
                  },
                );
              }
              return makePkgProxy(String(pkg));
            },
          },
        )
      : {};

    let mc: any = null;
    let rawMc: any = null;
    try {
      const { MinecraftClient, MinecraftMatcher } =
        await import('@woldann/exoproc-minecraft');
      const mcClient = await MinecraftClient.attach(accessor, options);
      if (Java) {
        const matcher = new MinecraftMatcher(mcClient.bridge);
        matcher.registerTo(Java, mcClient.mappings);
        try {
          const MC = Java.type('net.minecraft.client.Minecraft');
          rawMc =
            typeof MC.getMinecraft === 'function'
              ? MC.getMinecraft()
              : MC.theMinecraft;
        } catch {}
      }
      mc = mcClient;
    } catch {}

    const allGlobals: Record<string, any> = {
      Java,
      java: javaProxy,
      print: printFn,
      console: {
        log: printFn,
        error: printFn,
        warn: printFn,
        info: printFn,
      },
      mc,
      minecraft: mc,
      rawMc,
      client: mc,
      exoproc: mc,
      ...(globals || {}),
    };

    let cleanCode = sourceCode;
    const rawTrimmed = sourceCode.trim();

    // Check if the script should auto-return its final expression
    const lines = rawTrimmed.split('\n');
    let lastIdx = lines.length - 1;
    while (lastIdx >= 0) {
      const line = lines[lastIdx];
      if (line !== undefined && line.trim() === '') {
        lastIdx--;
      } else {
        break;
      }
    }
    const lastLine = lines[lastIdx]?.trim();
    if (lastIdx >= 0 && lastLine !== undefined) {
      const isEligible =
        !lastLine.startsWith('return ') &&
        !lastLine.startsWith('const ') &&
        !lastLine.startsWith('let ') &&
        !lastLine.startsWith('var ') &&
        !lastLine.startsWith('function ') &&
        !lastLine.startsWith('class ') &&
        !lastLine.startsWith('import ') &&
        !lastLine.startsWith('export ') &&
        !lastLine.startsWith('if ') &&
        !lastLine.startsWith('if(') &&
        !lastLine.startsWith('while ') &&
        !lastLine.startsWith('while(') &&
        !lastLine.startsWith('for ') &&
        !lastLine.startsWith('for(') &&
        !lastLine.startsWith('try ') &&
        !lastLine.startsWith('try{') &&
        !lastLine.startsWith('catch') &&
        !lastLine.startsWith('finally') &&
        !lastLine.endsWith(';') &&
        !lastLine.endsWith('{') &&
        !lastLine.endsWith('}');

      if (isEligible) {
        lines[lastIdx] = `return (${lastLine});`;
        cleanCode = lines.join('\n');
      }
    }

    const AsyncFunction = Object.getPrototypeOf(
      async function () {},
    ).constructor;
    const fn = new AsyncFunction(...Object.keys(allGlobals), cleanCode);
    const result = await fn(...Object.values(allGlobals));
    return { success: true, result, logs };
  } catch (err: any) {
    return {
      success: false,
      logs,
      error: err?.message || String(err),
    };
  }
}

let agentMappingPool: any = null;
let agentContextCache: any = null;
let activeMinecraftClient: any = null;
let activeMinecraftMappings: any = null;
let minecraftInitPromise: any = null;
let cachedTargetMode: any = null;

export const DEFAULT_AGENT_PORT = 43378;
export const DEFAULT_EXOPROC_PORT = 43377;

export async function probeEndpoint(
  host: string,
  port: number,
): Promise<{
  mode: 'daemon' | 'agent' | 'none';
  alive: boolean;
  buildId?: string;
}> {
  try {
    const res = await fetch(`http://${host}:${port}/status`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return { mode: 'none', alive: false };
    const json = (await res.json()) as any;
    if (json.alive) {
      if (json.buildId) {
        loadAgentMappingsForBuildId(json.buildId);
      }
      if (typeof json.uptime === 'number' && json.daemonPid === undefined) {
        return { mode: 'agent', alive: true, buildId: json.buildId };
      }
      return { mode: 'daemon', alive: true, buildId: json.buildId };
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
    return require('@woldann/exoproc-mappings');
  } catch {}
  try {
    return require('njava-mappings');
  } catch {}
  const root = findRepoRoot();
  const candidates = [
    join(root, 'packages', 'njava-mappings', 'dist', 'index.js'),
    join(root, 'packages', 'njava-mappings', 'src', 'index.ts'),
    join(root, 'packages', '@woldann/exoproc-mappings', 'dist', 'index.js'),
    join(root, 'packages', '@woldann/exoproc-mappings', 'src', 'index.ts'),
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
          resolve(root, 'packages/minecraft/src/mappings/mappings-1.8.9.json'),
          resolve(root, 'packages/minecraft/dist/mappings/mappings-1.8.9.json'),
          resolve(process.cwd(), 'mappings.json'),
          resolve(process.cwd(), 'live-crawled-mappings.json'),
          resolve(dirname(process.cwd()), 'mappings.json'),
          resolve(root, 'packages/exoproc/live-crawled-mappings.json'),
          resolve(root, 'packages/exoproc/mappings.json'),
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

const loadedAgentBuildIds = new Set<string>();

/**
 * Automatically loads the cached Tiny v1 mapping file (<buildId>.tiny) matching
 * the running agent build into the shared agentMappingPool.
 */
export function loadAgentMappingsForBuildId(buildId: string): boolean {
  if (!buildId || loadedAgentBuildIds.has(buildId)) return false;
  try {
    const tinyPath = join(getAgentCacheDir(), `${buildId}.tiny`);
    if (existsSync(tinyPath)) {
      const pool = getAgentMappingPool();
      const mappingsMod = resolveMappingsPkg();
      if (mappingsMod?.loadMappings) {
        mappingsMod.loadMappings(tinyPath, pool);
        loadedAgentBuildIds.add(buildId);
        return true;
      }
    }
  } catch {}
  return false;
}

export function getAgentJavaContext(
  host: string,
  port: number,
  options?: { pool?: any; buildId?: string },
): any {
  if (options?.buildId) {
    loadAgentMappingsForBuildId(options.buildId);
  }
  const key = `${host}:${port}`;
  if (agentContextCache && agentContextCache.key === key) {
    return agentContextCache.context;
  }
  const pool = options?.pool ?? getAgentMappingPool();
  const njavaPkg = '@woldann/bun-njava';
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
    process.env.EXOPROC_MINECRAFT === '1' ||
    process.env.EXOPROC_MINECRAFT === 'true'
  )
    return true;
  const status = (await checkDaemonAlive(host, port)) as any;
  if (!status) return false;
  if (status.isMinecraft) return true;
  if (status.targetName?.toLowerCase().includes('minecraft')) return true;
  if (status.windowTitle?.toLowerCase().includes('minecraft')) return true;
  if (status.targetJar?.toLowerCase().includes('minecraft')) return true;
  if (status.classpath?.toLowerCase().includes('minecraft')) return true;
  if (status.mode === 'agent' || status.buildId || status.port) {
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
      const { MinecraftClient } = await import('@woldann/exoproc-minecraft');
      activeMinecraftClient =
        typeof (MinecraftClient as any).from === 'function'
          ? await (MinecraftClient as any).from(java, options)
          : await (MinecraftClient as any).attach(java, options);
      activeMinecraftMappings = activeMinecraftClient?.mappings ?? null;
      return activeMinecraftClient;
    } catch (err) {
      if (process.env.DEBUG || process.env.EXOPROC_DEBUG || options?.force) {
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
  const { ExoprocService } = await import('./service.js');
  const service = new ExoprocService();
  return (await service.upgrade(options)) as any;
}

export async function executeScriptWithAgent(
  host: string,
  port: number,
  sourceCode: string,
  globals?: Record<string, any>,
  options?: any,
): Promise<{ success: boolean; result?: any; logs: string[]; error?: string }> {
  const logs: string[] = [];
  const printFn = (...args: any[]) => {
    const line = args
      .map((a) => {
        if (typeof a === 'object' && a !== null) {
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        }
        return String(a);
      })
      .join(' ');
    logs.push(line);
  };

  try {
    const context = getAgentJavaContext(host, port, options);
    const Java = Object.assign(context, {
      type: context.type.bind(context),
      from: context.from?.bind(context),
      to: context.to?.bind(context),
      extend: context.extend?.bind(context),
      super: context.super?.bind(context),
      runOn: context.runOn?.bind(context),
      runOnAsync: context.runOnAsync?.bind(context),
    });

    const javaProxy = new Proxy(
      {},
      {
        get(_t, pkg) {
          function makePkgProxy(current: string): any {
            return new Proxy(
              {},
              {
                get(_t2, member) {
                  const fullName = `${current}.${String(member)}`;
                  try {
                    return context.type(fullName);
                  } catch {
                    return makePkgProxy(fullName);
                  }
                },
              },
            );
          }
          return makePkgProxy(String(pkg));
        },
      },
    );

    let mc: any = null;
    try {
      mc = await ensureMinecraft(host, port, options);
    } catch {}

    const allGlobals: Record<string, any> = {
      Java,
      java: javaProxy,
      print: printFn,
      console: {
        log: printFn,
        error: printFn,
        warn: printFn,
        info: printFn,
      },
      mc,
      minecraft: mc,
      ...(globals || {}),
    };

    let cleanCode = sourceCode;
    const rawTrimmed = sourceCode.trim();

    // Check if the script should auto-return its final expression
    const lines = rawTrimmed.split('\n');
    let lastIdx = lines.length - 1;
    while (lastIdx >= 0) {
      const line = lines[lastIdx];
      if (line !== undefined && line.trim() === '') {
        lastIdx--;
      } else {
        break;
      }
    }
    const lastLine = lines[lastIdx]?.trim();
    if (lastIdx >= 0 && lastLine !== undefined) {
      const isEligible =
        !lastLine.startsWith('return ') &&
        !lastLine.startsWith('const ') &&
        !lastLine.startsWith('let ') &&
        !lastLine.startsWith('var ') &&
        !lastLine.startsWith('function ') &&
        !lastLine.startsWith('class ') &&
        !lastLine.startsWith('import ') &&
        !lastLine.startsWith('export ') &&
        !lastLine.startsWith('if ') &&
        !lastLine.startsWith('if(') &&
        !lastLine.startsWith('while ') &&
        !lastLine.startsWith('while(') &&
        !lastLine.startsWith('for ') &&
        !lastLine.startsWith('for(') &&
        !lastLine.startsWith('try ') &&
        !lastLine.startsWith('try{') &&
        !lastLine.startsWith('catch') &&
        !lastLine.startsWith('finally') &&
        !lastLine.startsWith('throw ') &&
        !lastLine.startsWith('}') &&
        !lastLine.startsWith('//') &&
        !lastLine.startsWith('/*') &&
        !lastLine.startsWith('*') &&
        (lastLine.endsWith(';')
          ? !lastLine.slice(0, -1).includes(';')
          : !lastLine.includes(';'));

      if (isEligible && !/\breturn\b/.test(rawTrimmed)) {
        const stripped = lastLine.replace(/;+$/, '');
        lines[lastIdx] = `return (${stripped});`;
        cleanCode = lines.join('\n');
      }
    }

    try {
      if (typeof (globalThis as any).Bun?.Transpiler === 'function') {
        const transpiler = new (globalThis as any).Bun.Transpiler({
          loader: 'ts',
        });
        cleanCode = transpiler.transformSync(cleanCode);
      }
    } catch {}

    const paramNames = Object.keys(allGlobals);
    const paramValues = Object.values(allGlobals);

    const AsyncFunction = Object.getPrototypeOf(
      async function () {},
    ).constructor;
    const scriptFn = new AsyncFunction(...paramNames, cleanCode);
    const result = await scriptFn(...paramValues);
    return { success: true, result, logs };
  } catch (err: any) {
    return {
      success: false,
      error: err?.stack || err?.message || String(err),
      logs,
    };
  }
}
