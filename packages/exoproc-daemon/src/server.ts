import { readFileSync } from 'node:fs';
import { Kernel32Impl, ToolhelpSnapshotFlag } from 'bun-xffi';
import { Window, Thread, ToolhelpSnapshot } from 'bun-winapi';
import { createAccessor } from 'exoproc-accessors';
import { getJavaSync, getNJava } from 'bun-njava';
import { whenStubsReady } from 'bun-nthread';
import {
  MinecraftMatcher,
  MINECRAFT_CANONICAL_SCHEMA,
} from 'exoproc-minecraft';
import chalk from 'chalk';
import { captureScreenshotBuffer } from './screenshot.js';
import {
  writeDaemonState,
  clearDaemonState,
  type DaemonState,
} from './state.js';

export interface StartDaemonOptions {
  pid?: number;
  profile?: string;
  port?: number;
  host?: string;
  autoAttach?: boolean;
  onReady?: (state: DaemonState) => void;
  onError?: (err: Error) => void;
}

export interface CandidateProcess {
  pid: number;
  name: string;
  windowTitle?: string;
  isMinecraft: boolean;
}

export async function runDaemon(
  options: StartDaemonOptions = {},
): Promise<void> {
  const startedAt = Date.now();
  const hostname = options.host || '0.0.0.0';

  let currentTargetPid: number | null = null;
  let currentTargetName: string | null = null;
  let currentWindowTitle: string | null = null;
  let currentProfile: string = options.profile || 'auto';
  let currentHost: any = null;
  let currentJava: any = null;
  let currentMatcher: MinecraftMatcher | null = null;
  let isAttached = false;
  let phase2Ran = false;

  const updateState = () => {
    const state: DaemonState = {
      daemonPid: process.pid,
      port: server.port,
      url: `http://127.0.0.1:${server.port}`,
      startedAt,
      attached: isAttached,
      pid: currentTargetPid,
      targetName: currentTargetName,
      windowTitle: currentWindowTitle,
      profile: currentProfile,
    };
    writeDaemonState(state);
    return state;
  };

  const listCandidateProcesses = (): CandidateProcess[] => {
    const candidates: CandidateProcess[] = [];
    const seenPids = new Set<number>();

    // 1. Check windows
    try {
      for (const w of Window.getWindows()) {
        if (!w.isValid()) continue;
        const [, pid] = w.getThreadProcessId();
        if (!pid || seenPids.has(pid)) continue;
        seenPids.add(pid);

        const title = w.title || '';
        const isMc =
          w.className === 'LWJGL' ||
          (title.includes('Minecraft') &&
            !title.toLowerCase().includes('launcher') &&
            !title.toLowerCase().includes('console'));

        candidates.push({
          pid,
          name: isMc ? 'javaw.exe' : 'unknown',
          windowTitle: title,
          isMinecraft: Boolean(isMc),
        });
      }
    } catch {}

    // 2. Check toolhelp processes
    try {
      const snap = ToolhelpSnapshot.create(ToolhelpSnapshotFlag.SnapProcess);
      if (snap) {
        for (const p of snap.getProcesses()) {
          const lowerName = p.name.toLowerCase();
          if (lowerName.includes('java') || lowerName.includes('minecraft')) {
            if (!seenPids.has(p.pid)) {
              seenPids.add(p.pid);
              candidates.push({
                pid: p.pid,
                name: p.name,
                isMinecraft: true,
              });
            }
          }
        }
        snap.close();
      }
    } catch {}

    return candidates;
  };

  const findMinecraftPid = (): {
    pid: number;
    name: string;
    title: string;
  } | null => {
    // 1. Direct window check for active Minecraft LWJGL window
    try {
      const lwjglWin = Window.find('LWJGL', null);
      if (lwjglWin) {
        const [, pid] = lwjglWin.getThreadProcessId();
        if (pid) {
          const threads = Thread.getThreads(pid);
          if (threads && threads.length > 0) {
            return {
              pid,
              name: 'javaw.exe',
              title: lwjglWin.title || 'Minecraft',
            };
          }
        }
      }
    } catch {}

    // 2. Fallback window scan
    for (const w of Window.getWindows()) {
      if (!w.isValid()) continue;
      const title = w.title || '';
      if (
        title.includes('Minecraft') &&
        !title.toLowerCase().includes('launcher') &&
        !title.toLowerCase().includes('console')
      ) {
        const [, pid] = w.getThreadProcessId();
        if (pid) {
          return { pid, name: 'javaw.exe', title };
        }
      }
    }

    // 3. Process snapshot scan for java processes
    try {
      const snap = ToolhelpSnapshot.create(ToolhelpSnapshotFlag.SnapProcess);
      if (snap) {
        for (const p of snap.getProcesses()) {
          if (p.name.toLowerCase() === 'javaw.exe') {
            snap.close();
            return { pid: p.pid, name: p.name, title: 'Minecraft' };
          }
        }
        snap.close();
      }
    } catch {}

    return null;
  };

  const checkProcessAlive = (pid: number | null): boolean => {
    if (!pid) return false;
    try {
      const h = Kernel32Impl.OpenProcess(0x00100000, false, pid);
      if (!h || h === 0n) {
        for (const w of Window.getWindows()) {
          if (!w.isValid()) continue;
          const [, p] = w.getThreadProcessId();
          if (p === pid) return true;
        }
        return false;
      }
      const res = Kernel32Impl.WaitForSingleObject(h, 0);
      Kernel32Impl.CloseHandle(h);
      return res === 0x102 || res === 258;
    } catch {
      return true;
    }
  };

  const detachFromProcess = (): void => {
    if (!isAttached) return;
    console.log(
      chalk.yellow(
        `\n[Neptune Daemon] Detaching from ${currentTargetName} (PID: ${currentTargetPid})...`,
      ),
    );
    try {
      currentHost?.close();
    } catch {}

    currentTargetPid = null;
    currentTargetName = null;
    currentWindowTitle = null;
    currentHost = null;
    currentJava = null;
    currentMatcher = null;
    isAttached = false;
    phase2Ran = false;

    updateState();
    console.log(
      chalk.cyan(
        `[Neptune Daemon] Transitioned to Standby mode (port ${server.port}). Ready for new attach.`,
      ),
    );
  };

  const attachToProcess = async (
    targetPid?: number,
    profile?: string,
  ): Promise<{
    success: boolean;
    pid: number;
    targetName: string;
    windowTitle: string;
    error?: string;
  }> => {
    // If already attached, detach first
    if (isAttached) {
      detachFromProcess();
    }

    let pid = targetPid;
    let name = 'javaw.exe';
    let title = 'Minecraft';

    if (!pid) {
      const found = findMinecraftPid();
      if (!found) {
        throw new Error(
          'Minecraft process not found. Please specify PID or launch Minecraft.',
        );
      }
      pid = found.pid;
      name = found.name;
      title = found.title;
    } else {
      // Lookup window title if available
      for (const w of Window.getWindows()) {
        if (!w.isValid()) continue;
        const [, p] = w.getThreadProcessId();
        if (p === pid) {
          title = w.title || title;
          break;
        }
      }
    }

    console.log(
      chalk.cyan(
        `\n[Neptune Daemon] Attaching to target PID ${pid} (${name})...`,
      ),
    );

    await whenStubsReady();

    const host = await createAccessor(pid, {
      njava: 'stealth',
      hostOptions: { timeoutMs: 25000, pollIntervalMs: 2 },
    });

    const Java =
      typeof host.getJavaSync === 'function'
        ? host.getJavaSync()
        : getJavaSync(host);
    const reflection = getNJava(host).getReflectionSync();
    const matcher = new MinecraftMatcher(reflection);

    const matched = await matcher.matchCore().catch(() => null);
    if (matched) {
      matcher.registerTo(Java, matched);
    }

    const registerDetectedClass = (res: any) => {
      if (
        res &&
        res.kind === 'class' &&
        res.canonicalKey &&
        res.realClassName
      ) {
        if (res.canonicalKey === 'Minecraft') return;
        const schema = (MINECRAFT_CANONICAL_SCHEMA as any)[res.canonicalKey];
        const canonName = schema?.canonicalClassName ?? res.canonicalKey;
        const fieldMap: Record<string, string> = {};
        for (const f of Object.values(res.fields || {})) {
          const orig = (f as any).originalName;
          const real = (f as any).realName;
          if (orig && real && (f as any).isObfuscated) {
            fieldMap[real] = orig;
          }
        }
        const methodMap: Record<string, string> = {};
        for (const m of Object.values(res.methods || {})) {
          const orig = (m as any).originalName;
          const real = (m as any).realName;
          if (orig && real && (m as any).isObfuscated) {
            methodMap[real] = orig;
          }
        }
        Java.mapClass(res.realClassName, canonName, {
          fields: fieldMap,
          methods: methodMap,
        });
        if (canonName !== res.canonicalKey) {
          Java.mapClass(res.realClassName, res.canonicalKey, {
            fields: fieldMap,
            methods: methodMap,
          });
        }
      }
    };

    const detectFn = async (target: any, opt?: any) => {
      const res = await matcher.detect(target, opt);
      registerDetectedClass(res);
      return res;
    };

    const detectSyncFn = (target: any, opt?: any) => {
      const res = matcher.detectSync(target, opt);
      registerDetectedClass(res);
      return res;
    };

    const ensurePhase2 = async (): Promise<boolean> => {
      if (phase2Ran) return phase2Ran;
      try {
        const Minecraft = Java.type('net.minecraft.client.Minecraft');
        const mc = Minecraft?.theMinecraft ?? Minecraft?.getMinecraft?.();
        if (!mc) return false;

        let player = mc.thePlayer;
        if (typeof player === 'function') {
          try {
            player = await player();
          } catch {}
        }

        if (
          (!player || (!player.$ptr && !player.$address)) &&
          matcher.mappings.Minecraft?.fields?.thePlayer
        ) {
          try {
            const rawField = matcher.mappings.Minecraft.fields.thePlayer;
            player = mc[rawField];
            if (typeof player === 'function') {
              try {
                player = await player();
              } catch {}
            }
          } catch {}
        }

        if (player && (player.$ptr || player.$address)) {
          console.log(
            chalk.cyan(
              '\n🌍 In-world player detected! Automatically running Phase 2 scan (matchWorld)...',
            ),
          );
          const worldMappings = await matcher.matchWorld().catch((err: any) => {
            console.warn(
              '[Neptune Daemon] Phase 2 scan warning:',
              err?.message || err,
            );
            return null;
          });
          if (worldMappings) {
            matcher.registerTo(Java, worldMappings);
            phase2Ran = true;
            console.log(
              chalk.green(
                '✓ Phase 2 match completed and registered into JavaContext.',
              ),
            );
            return true;
          }
        }
      } catch {}
      return false;
    };

    const neptuneObj = {
      pid,
      profile: profile || currentProfile,
      ensurePhase2,
      matchWorld: ensurePhase2,
      detect: detectFn,
      detectSync: detectSyncFn,
    };

    (Java as any).detect = detectFn;
    (Java as any).detectSync = detectSyncFn;
    (Java as any).neptune = neptuneObj;

    currentTargetPid = pid;
    currentTargetName = name;
    currentWindowTitle = title;
    currentProfile = profile || currentProfile;
    currentHost = host;
    currentJava = Java;
    currentMatcher = matcher;
    isAttached = true;
    phase2Ran = false;

    updateState();

    console.log(
      chalk.bold.green(`✓ Attached successfully to ${name} (PID: ${pid})`),
    );
    return {
      success: true,
      pid,
      targetName: name,
      windowTitle: title,
    };
  };

  class AsyncMutex {
    private queue: Promise<void> = Promise.resolve();

    public async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
      const prev = this.queue;
      let release: () => void;
      this.queue = new Promise<void>((resolve) => {
        release = resolve;
      });

      await prev;
      try {
        return await fn();
      } finally {
        release!();
      }
    }
  }

  const executionMutex = new AsyncMutex();

  const handleRunOrEval = async (
    sourceCode: string,
    globals?: Record<string, any>,
  ): Promise<{
    success: boolean;
    result?: any;
    logs: string[];
    error?: string;
  }> => {
    if (!isAttached || !currentJava) {
      return {
        success: false,
        error: 'Daemon is not attached to any process. Run attach first.',
        logs: [],
      };
    }

    const logs: string[] = [];
    const printFn = (...args: any[]) => {
      const line = args
        .map((a) => {
          if (typeof a === 'object' && a !== null) {
            try {
              if ('$ptr' in a || '$classObj' in a || '$raw' in a) {
                return `[Java ${a.$className || a.$class?.name || 'Object'} @ ${a.$ptr || a.$address || ''}]`;
              }
              return JSON.stringify(a);
            } catch {
              return String(a);
            }
          }
          return String(a);
        })
        .join(' ');
      logs.push(line);
      console.log(`[Script] ${line}`);
    };

    try {
      if (currentJava.neptune?.ensurePhase2) {
        await currentJava.neptune.ensurePhase2();
      }

      // Build parameter list: base params + global variable names
      const paramNames = ['Java', 'print', 'neptune'];
      const paramValues = [currentJava, printFn, currentJava.neptune];

      // Add Minecraft-specific globals if not already provided
      const allGlobals = { ...globals };

      // Get Minecraft instance and its state
      if (!allGlobals.mc && currentJava.Minecraft) {
        try {
          allGlobals.mc =
            currentJava.Minecraft.getMinecraft?.() ||
            currentJava.Minecraft.getInstance?.();
        } catch (e) {
          // Ignore if unable to get Minecraft instance
        }
      }

      // Get current screen and button list if not provided
      if (!allGlobals.currentScreen && allGlobals.mc) {
        try {
          allGlobals.currentScreen = allGlobals.mc.currentScreen;
        } catch (e) {
          // Ignore
        }
      }

      if (!allGlobals.buttonList && allGlobals.currentScreen) {
        try {
          allGlobals.buttonList = allGlobals.currentScreen.buttonList || [];
        } catch (e) {
          // Ignore
        }
      }

      // Get Minecraft class
      if (!allGlobals.minecraftClass) {
        try {
          allGlobals.minecraftClass = currentJava.Minecraft;
        } catch (e) {
          // Ignore
        }
      }

      if (allGlobals && typeof allGlobals === 'object') {
        Object.entries(allGlobals).forEach(([key, value]) => {
          paramNames.push(key);
          paramValues.push(value);
        });
      }

      const AsyncFunction = Object.getPrototypeOf(
        async function () {},
      ).constructor;
      const scriptFn = new AsyncFunction(...paramNames, sourceCode);
      const result = await scriptFn(...paramValues);
      return { success: true, result, logs };
    } catch (err: any) {
      return {
        success: false,
        error: err?.stack || err?.message || String(err),
        logs,
      };
    }
  };

  let isShuttingDown = false;
  const shutdown = (reason: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(
      `\n[Neptune Daemon] ${reason} - Shutting down daemon process...`,
    );
    clearInterval(livenessTimer);
    try {
      server?.stop();
    } catch {}
    try {
      currentHost?.close();
    } catch {}
    try {
      clearDaemonState();
    } catch {}
    process.exit(0);
  };

  // Start HTTP server immediately
  const server = Bun.serve({
    port: options.port ?? 0,
    hostname,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === 'GET' && url.pathname === '/status') {
        const isAlive = isAttached ? checkProcessAlive(currentTargetPid) : true;
        return Response.json({
          alive: isAlive,
          attached: isAttached,
          daemonPid: process.pid,
          pid: currentTargetPid,
          targetName: currentTargetName,
          windowTitle: currentWindowTitle,
          profile: currentProfile,
          port: server.port,
          uptime: Math.floor((Date.now() - startedAt) / 1000),
        });
      }

      if (req.method === 'GET' && url.pathname === '/processes') {
        const candidates = listCandidateProcesses();
        return Response.json({ processes: candidates });
      }

      if (req.method === 'POST' && url.pathname === '/attach') {
        const body = (await req.json().catch(() => ({}))) as any;
        try {
          const res = await executionMutex.runExclusive(() =>
            attachToProcess(body.pid, body.profile),
          );
          return Response.json(res);
        } catch (err: any) {
          return Response.json(
            { success: false, error: err?.message || String(err) },
            { status: 400 },
          );
        }
      }

      if (req.method === 'POST' && url.pathname === '/detach') {
        await executionMutex.runExclusive(async () => {
          detachFromProcess();
        });
        return Response.json({
          success: true,
          message:
            'Detached from target process. Daemon remains in Standby mode.',
        });
      }

      if (req.method === 'POST' && url.pathname === '/shutdown') {
        setTimeout(() => shutdown('Client requested shutdown'), 50);
        return Response.json({
          success: true,
          message: 'Daemon shutting down.',
        });
      }

      if (
        req.method === 'POST' &&
        (url.pathname === '/agent/transition' ||
          url.pathname === '/upgrade-agent')
      ) {
        if (!isAttached || !currentJava) {
          return Response.json(
            {
              success: false,
              error: 'Daemon is not attached to any process. Run attach first.',
            },
            { status: 400 },
          );
        }
        try {
          const body = (await req.json().catch(() => ({}))) as any;
          const { injectAgent } = await import('njava-agent');
          console.log(
            chalk.cyan(
              `\n[Neptune Daemon] Transitioning target JVM to in-process Java Agent...`,
            ),
          );
          const agentRes = await injectAgent(currentJava, {
            port: body.port,
            targetVersion: body.targetVersion,
            verbose: true,
          });

          if (agentRes.agentContext) {
            if (currentMatcher) {
              currentMatcher.registerTo(
                agentRes.agentContext,
                currentMatcher.mappings,
              );
            }
            (agentRes.agentContext as any).neptune = (
              currentJava as any
            ).neptune;
            (agentRes.agentContext as any).detect = (currentJava as any).detect;
            (agentRes.agentContext as any).detectSync = (
              currentJava as any
            ).detectSync;
            currentJava = agentRes.agentContext;
            console.log(
              chalk.bold.green(
                `✓ Successfully transitioned daemon to in-process Java Agent on port ${agentRes.port}!`,
              ),
            );
          }

          return Response.json({
            success: true,
            port: agentRes.port,
            jarPath: agentRes.jarPath,
            message: `Transitioned to Java Agent on port ${agentRes.port}`,
          });
        } catch (err: any) {
          console.error(
            chalk.red(`[Neptune Daemon] Failed to transition to agent:`),
            err,
          );
          return Response.json(
            { success: false, error: err?.message || String(err) },
            { status: 500 },
          );
        }
      }

      if (req.method === 'POST' && url.pathname === '/eval') {
        const body = (await req.json().catch(() => ({}))) as any;
        const code = body.code ?? '';
        const globals = body.globals ?? undefined;
        const res = await executionMutex.runExclusive(() =>
          handleRunOrEval(code, globals),
        );
        return Response.json(res);
      }

      if (req.method === 'POST' && url.pathname === '/run') {
        const body = (await req.json().catch(() => ({}))) as any;
        let code = body.scriptCode ?? '';
        if (!code && body.scriptPath) {
          try {
            code = readFileSync(body.scriptPath, 'utf8');
          } catch (e: any) {
            return Response.json(
              {
                success: false,
                error: `Failed to read script file: ${e.message}`,
                logs: [],
              },
              { status: 400 },
            );
          }
        }
        const globals = body.globals ?? undefined;
        const res = await executionMutex.runExclusive(() =>
          handleRunOrEval(code, globals),
        );
        return Response.json(res);
      }

      if (
        (req.method === 'GET' || req.method === 'POST') &&
        url.pathname === '/screenshot'
      ) {
        if (!isAttached || !currentTargetPid) {
          return Response.json(
            {
              success: false,
              error: 'Daemon is not attached to any process. Run attach first.',
            },
            { status: 400 },
          );
        }
        try {
          const shot = await executionMutex.runExclusive(() =>
            captureScreenshotBuffer(currentTargetPid, currentHost),
          );
          if (!shot.success || !shot.buffer) {
            return Response.json(
              {
                success: false,
                error: shot.error || 'Failed to capture screenshot',
              },
              { status: 500 },
            );
          }
          return new Response(shot.buffer, {
            status: 200,
            headers: {
              'Content-Type': 'image/png',
              'Content-Length': String(shot.buffer.length),
              'X-Image-Width': String(shot.width),
              'X-Image-Height': String(shot.height),
              'X-Window-Title': encodeURIComponent(
                shot.windowTitle || currentWindowTitle || '',
              ),
            },
          });
        } catch (err: any) {
          return Response.json(
            { success: false, error: err?.message || String(err) },
            { status: 500 },
          );
        }
      }

      return new Response('Not Found', { status: 404 });
    },
  });

  updateState();

  // If autoAttach or pid specified at startup, attempt initial attach
  if (options.autoAttach || options.pid) {
    try {
      await attachToProcess(options.pid, options.profile);
    } catch (err: any) {
      console.warn(
        chalk.yellow(
          `[Neptune Daemon] Initial attach deferred: ${err?.message || err}`,
        ),
      );
      console.log(
        chalk.cyan(
          `[Neptune Daemon] Running in Standby mode on port ${server.port}. Waiting for attach command from client.`,
        ),
      );
    }
  } else {
    console.log(
      chalk.cyan(
        `[Neptune Daemon] Standby server active on port ${server.port}. Waiting for attach command from client.`,
      ),
    );
  }

  // Liveness monitor: if attached and process terminates, auto-detach to Standby mode (DO NOT exit daemon!)
  let consecutiveFails = 0;
  const livenessTimer = setInterval(() => {
    try {
      if (isAttached && currentTargetPid) {
        if (!checkProcessAlive(currentTargetPid)) {
          consecutiveFails++;
          if (consecutiveFails >= 5) {
            console.log(
              chalk.yellow(
                `\n[Neptune Daemon] Target process PID ${currentTargetPid} terminated.`,
              ),
            );
            detachFromProcess();
            consecutiveFails = 0;
          }
        } else {
          consecutiveFails = 0;
        }
      }
    } catch {
      consecutiveFails++;
    }
  }, 1000);

  process.on('SIGINT', () => shutdown('Received SIGINT'));
  process.on('SIGTERM', () => shutdown('Received SIGTERM'));

  options.onReady?.(updateState());
}
