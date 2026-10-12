import { readFileSync } from 'node:fs';
import chalk from 'chalk';
import { captureScreenshotBuffer } from './screenshot.js';
import {
  writeDaemonState,
  clearDaemonState,
  type DaemonState,
} from './state.js';
import { reflectionService } from './reflection.js';

async function getWinapi(): Promise<any> {
  return await import('bun-winapi');
}

async function getXffi(): Promise<any> {
  return await import('bun-xffi');
}

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
  let currentMatcher: any = null;
  let activeAgentPort: number | null = null;
  let isAttached = false;
  let phase2Ran = false;
  let server: any = null;

  const updateState = () => {
    const state: DaemonState = {
      daemonPid: process.pid,
      port: server?.port ?? options.port ?? 0,
      url: `http://127.0.0.1:${server?.port ?? options.port ?? 0}`,
      startedAt,
      attached: isAttached,
      pid: currentTargetPid,
      targetName: currentTargetName,
      windowTitle: currentWindowTitle,
      profile: currentProfile,
      upgraded: Boolean(activeAgentPort),
      agentPort: activeAgentPort,
    };
    writeDaemonState(state);
    return state;
  };

  const listCandidateProcesses = async (): Promise<CandidateProcess[]> => {
    const candidates: CandidateProcess[] = [];
    const seenPids = new Set<number>();

    // 1. Check windows
    try {
      const { Window } = await getWinapi();
      for (const w of Window.getWindows()) {
        if (!w.isValid()) continue;
        const [, pid] = w.getThreadProcessId();
        if (!pid || seenPids.has(pid)) continue;
        seenPids.add(pid);

        const title = w.getText() || '';
        const className = w.getClassName() || '';
        const isMc =
          className === 'LWJGL' ||
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
      const { ToolhelpSnapshot } = await getWinapi();
      const { ToolhelpSnapshotFlag } = await getXffi();
      const snap = new ToolhelpSnapshot(ToolhelpSnapshotFlag.SNAPPROCESS);
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

  const findMinecraftPid = async (): Promise<{
    pid: number;
    name: string;
    title: string;
  } | null> => {
    // 1. Direct window check for active Minecraft LWJGL window
    try {
      const { Window, Thread } = await getWinapi();
      const lwjglWin = Window.find('LWJGL', null);
      if (lwjglWin) {
        const [, pid] = lwjglWin.getThreadProcessId();
        if (pid) {
          const threads = Thread.getThreads(pid);
          if (threads && threads.length > 0) {
            return {
              pid,
              name: 'javaw.exe',
              title: lwjglWin.getText() || 'Minecraft',
            };
          }
        }
      }
    } catch {}

    // 2. Fallback window scan
    try {
      const { Window } = await getWinapi();
      for (const w of Window.getWindows()) {
        if (!w.isValid()) continue;
        const title = w.getText() || '';
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
    } catch {}

    // 3. Process snapshot scan for java processes
    try {
      const { ToolhelpSnapshot } = await getWinapi();
      const { ToolhelpSnapshotFlag } = await getXffi();
      const snap = new ToolhelpSnapshot(ToolhelpSnapshotFlag.SNAPPROCESS);
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

  const checkProcessAlive = async (pid: number | null): Promise<boolean> => {
    if (!pid) return false;
    try {
      const { Kernel32Impl } = await getXffi();
      const { Window } = await getWinapi();
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
    activeAgentPort = null;
    isAttached = false;
    phase2Ran = false;
    reflectionService.clear();

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
    if (isAttached) {
      detachFromProcess();
    }

    let pid = targetPid;
    let name = 'javaw.exe';
    let title = 'Minecraft';

    if (!pid) {
      const found = await findMinecraftPid();
      if (!found) {
        throw new Error(
          'Minecraft process not found. Please specify PID or launch Minecraft.',
        );
      }
      pid = found.pid;
      name = found.name;
      title = found.title;
    } else {
      try {
        const { Window } = await getWinapi();
        for (const w of Window.getWindows()) {
          if (!w.isValid()) continue;
          const [, p] = w.getThreadProcessId();
          if (p === pid) {
            title = w.getText() || title;
            break;
          }
        }
      } catch {}
    }

    console.log(
      chalk.cyan(
        `\n[Neptune Daemon] Attaching to target PID ${pid} (${name})...`,
      ),
    );

    const { whenStubsReady } = await import('bun-nthread');
    await whenStubsReady();

    const { createAccessor } = await import('exoproc-accessors');
    const host = await createAccessor(pid, {
      njava: 'stealth',
      hostOptions: { timeoutMs: 25000, pollIntervalMs: 2 },
    });

    const { getJavaSync, getNJava } = await import('bun-njava');
    const Java =
      typeof (host as any).getJavaSync === 'function'
        ? (host as any).getJavaSync()
        : getJavaSync(host);
    const reflection = getNJava(host).getReflectionSync();
    const { MinecraftMatcher, MINECRAFT_CANONICAL_SCHEMA } =
      await import('exoproc-minecraft');
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
        let world = mc.theWorld;
        if (typeof world === 'function') {
          try {
            world = await world();
          } catch {}
        }

        if (player) {
          await detectFn(player, {
            canonicalKey: 'EntityPlayerSP',
            category: 'entity',
          }).catch(() => null);
        }
        if (world) {
          await detectFn(world, {
            canonicalKey: 'WorldClient',
            category: 'world',
          }).catch(() => null);
        }

        phase2Ran = Boolean(player || world);
        return phase2Ran;
      } catch {
        return false;
      }
    };

    Java.detect = detectFn;
    Java.detectSync = detectSyncFn;
    Java.neptune = {
      matcher,
      detect: detectFn,
      detectSync: detectSyncFn,
      ensurePhase2,
    };

    currentTargetPid = pid;
    currentTargetName = name;
    currentWindowTitle = title;
    currentProfile = profile || 'auto';
    currentHost = host;
    currentJava = Java;
    currentMatcher = matcher;
    isAttached = true;
    phase2Ran = false;
    reflectionService.clear();

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
      if (currentJava?.neptune?.ensurePhase2) {
        await currentJava.neptune.ensurePhase2();
      }

      // Build parameter list: base params + global variable names
      const paramNames = ['Java', 'print', 'neptune'];
      const paramValues = [
        currentJava ?? null,
        printFn,
        currentJava?.neptune ?? null,
      ];

      // Add Minecraft-specific globals if not already provided
      const allGlobals = { ...globals };

      if (currentJava) {
        if (!allGlobals.mc && currentJava.Minecraft) {
          try {
            allGlobals.mc =
              currentJava.Minecraft.getMinecraft?.() ||
              currentJava.Minecraft.getInstance?.();
          } catch {}
        }

        if (!allGlobals.currentScreen && allGlobals.mc) {
          try {
            allGlobals.currentScreen = allGlobals.mc.currentScreen;
          } catch {}
        }

        if (!allGlobals.buttonList && allGlobals.currentScreen) {
          try {
            allGlobals.buttonList = allGlobals.currentScreen.buttonList || [];
          } catch {}
        }

        if (!allGlobals.minecraftClass) {
          try {
            allGlobals.minecraftClass = currentJava.Minecraft;
          } catch {}
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

  const forwardToAgent = async (
    pathname: string,
    method: string,
    body?: any,
  ): Promise<Response> => {
    if (!activeAgentPort) {
      throw new Error('No in-process agent active');
    }
    const res = await fetch(`http://127.0.0.1:${activeAgentPort}${pathname}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    return Response.json(json, { status: res.status });
  };

  // Start HTTP server immediately
  server = Bun.serve({
    port: options.port ?? 0,
    hostname,
    async fetch(req): Promise<Response> {
      const url = new URL(req.url);

      // --- 1. Daemon Status & System Management ---
      if (req.method === 'GET' && url.pathname === '/status') {
        const isAlive = isAttached
          ? await checkProcessAlive(currentTargetPid)
          : true;
        return Response.json({
          alive: isAlive,
          attached: isAttached,
          daemonPid: process.pid,
          pid: currentTargetPid,
          targetName: currentTargetName,
          windowTitle: currentWindowTitle,
          profile: currentProfile,
          port: server?.port ?? 0,
          upgraded: Boolean(activeAgentPort),
          agentPort: activeAgentPort,
          uptime: Math.floor((Date.now() - startedAt) / 1000),
          mode: 'daemon',
          isStandalone: false,
        });
      }

      if (req.method === 'GET' && url.pathname === '/processes') {
        const candidates = await listCandidateProcesses();
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
        (url.pathname === '/upgrade' ||
          url.pathname === '/upgrade-agent' ||
          url.pathname === '/agent/transition')
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
          const {
            injectAgentInMemory,
            getAgentBytecode,
            extractClassNameFromClassBytes,
          } = await import('njava-agent');
          console.log(
            chalk.cyan(
              `\n[Neptune Daemon] Upgrading target JVM to in-process Java Agent...`,
            ),
          );

          let bytecode: Uint8Array | undefined;
          let className: string =
            body.className || 'org.exoproc.njava.agent.utils.Exoproc';
          let mappings = body.mappings;

          if (body.bytecode) {
            bytecode =
              typeof body.bytecode === 'string'
                ? Buffer.from(body.bytecode, 'base64')
                : new Uint8Array(body.bytecode);
            className =
              body.className ||
              extractClassNameFromClassBytes(bytecode) ||
              className;
          } else if (body.classPath) {
            const { existsSync, readFileSync } = await import('node:fs');
            if (existsSync(body.classPath)) {
              bytecode = new Uint8Array(readFileSync(body.classPath));
              className =
                body.className ||
                extractClassNameFromClassBytes(bytecode) ||
                className;
            } else {
              throw new Error(
                `Agent .class file not found at: ${body.classPath}`,
              );
            }
          }

          if (!bytecode) {
            const buildRes = await getAgentBytecode({
              javaVersion: body.targetVersion,
              obfuscate: body.obfuscate ?? false,
            });
            bytecode = buildRes.bytecode;
            className = body.className || buildRes.className;
            mappings = buildRes.mappings ?? mappings;
          }

          const port = body.port ?? (activeAgentPort || 43378);

          const agentRes = await injectAgentInMemory(currentJava, {
            port,
            targetVersion: body.targetVersion,
            verbose: true,
            buildResult: {
              bytecode,
              className,
              javaVersion: body.targetVersion ?? 8,
              mappings,
            },
          });

          if (agentRes.agentContext) {
            activeAgentPort = agentRes.port;
            if (currentMatcher) {
              currentMatcher.registerTo(
                agentRes.agentContext,
                currentMatcher.mappings as any,
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
                `✓ Successfully upgraded daemon to in-process Java Agent on port ${agentRes.port}!`,
              ),
            );
          }

          updateState();

          return Response.json({
            success: true,
            port: agentRes.port,
            className: agentRes.className,
            upgraded: true,
            message: `Successfully upgraded to in-process Java Agent on port ${agentRes.port}`,
          });
        } catch (err: any) {
          console.error(
            chalk.red(`[Neptune Daemon] Failed to upgrade to agent:`),
            err,
          );
          return Response.json(
            { success: false, error: err?.message || String(err) },
            { status: 500 },
          );
        }
      }

      // --- 2. Code Execution (Direct Runtime & Script Run) ---
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

      // --- 3. Full Agent Reflection Standards ---
      if (req.method === 'GET' && url.pathname === '/classes') {
        if (activeAgentPort) {
          return await forwardToAgent('/classes', 'GET');
        }
        if (!isAttached || !currentJava) {
          return Response.json({ success: true, classes: [] });
        }
        const known = Array.from(reflectionService.classNameToId.keys());
        return Response.json({ success: true, classes: known });
      }

      if (req.method === 'POST' && url.pathname === '/reflection/class') {
        const body = (await req.json().catch(() => ({}))) as any;
        if (activeAgentPort) {
          return await forwardToAgent('/reflection/class', 'POST', body);
        }
        if (!isAttached || !currentJava) {
          return Response.json(
            { success: false, error: 'Daemon not attached to process' },
            { status: 400 },
          );
        }
        const res = await executionMutex.runExclusive(async () => {
          return reflectionService.inspectClass(body.name || '', currentJava);
        });
        return Response.json(res);
      }

      if (req.method === 'POST' && url.pathname === '/reflection/invoke') {
        const body = (await req.json().catch(() => ({}))) as any;
        if (activeAgentPort) {
          return await forwardToAgent('/reflection/invoke', 'POST', body);
        }
        if (!isAttached || !currentJava) {
          return Response.json(
            { success: false, error: 'Daemon not attached to process' },
            { status: 400 },
          );
        }
        const res = await executionMutex.runExclusive(async () => {
          return reflectionService.invokeMethod(body, currentJava);
        });
        return Response.json(res);
      }

      if (req.method === 'POST' && url.pathname === '/reflection/field/get') {
        const body = (await req.json().catch(() => ({}))) as any;
        if (activeAgentPort) {
          return await forwardToAgent('/reflection/field/get', 'POST', body);
        }
        if (!isAttached || !currentJava) {
          return Response.json(
            { success: false, error: 'Daemon not attached to process' },
            { status: 400 },
          );
        }
        const res = await executionMutex.runExclusive(async () => {
          return reflectionService.getField(body, currentJava);
        });
        return Response.json(res);
      }

      if (req.method === 'POST' && url.pathname === '/reflection/field/set') {
        const body = (await req.json().catch(() => ({}))) as any;
        if (activeAgentPort) {
          return await forwardToAgent('/reflection/field/set', 'POST', body);
        }
        if (!isAttached || !currentJava) {
          return Response.json(
            { success: false, error: 'Daemon not attached to process' },
            { status: 400 },
          );
        }
        const res = await executionMutex.runExclusive(async () => {
          return reflectionService.setField(body, currentJava);
        });
        return Response.json(res);
      }

      if (req.method === 'POST' && url.pathname === '/reflection/construct') {
        const body = (await req.json().catch(() => ({}))) as any;
        if (activeAgentPort) {
          return await forwardToAgent('/reflection/construct', 'POST', body);
        }
        if (!isAttached || !currentJava) {
          return Response.json(
            { success: false, error: 'Daemon not attached to process' },
            { status: 400 },
          );
        }
        const res = await executionMutex.runExclusive(async () => {
          return reflectionService.constructInstance(body, currentJava);
        });
        return Response.json(res);
      }

      if (
        req.method === 'POST' &&
        url.pathname === '/reflection/object/class'
      ) {
        const body = (await req.json().catch(() => ({}))) as any;
        if (activeAgentPort) {
          return await forwardToAgent('/reflection/object/class', 'POST', body);
        }
        const res = reflectionService.getObjectClass(body.handle);
        return Response.json(res);
      }

      if (
        req.method === 'POST' &&
        url.pathname === '/reflection/object/string'
      ) {
        const body = (await req.json().catch(() => ({}))) as any;
        if (activeAgentPort) {
          return await forwardToAgent(
            '/reflection/object/string',
            'POST',
            body,
          );
        }
        const res = reflectionService.getObjectString(body.handle);
        return Response.json(res);
      }

      if (req.method === 'POST' && url.pathname === '/reflection/release') {
        const body = (await req.json().catch(() => ({}))) as any;
        if (activeAgentPort) {
          return await forwardToAgent('/reflection/release', 'POST', body);
        }
        const res = reflectionService.releaseHandles(body.handles);
        return Response.json(res);
      }

      // --- 4. Callbacks & SSE ---
      if (req.method === 'GET' && url.pathname === '/callback/events') {
        if (activeAgentPort) {
          const res = await fetch(
            `http://127.0.0.1:${activeAgentPort}/callback/events`,
            {
              headers: { Accept: 'text/event-stream' },
            },
          );
          return new Response(res.body, {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          });
        }
        // Native SSE stream for daemon
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(': connected\n\n'));
          },
        });
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      }

      if (req.method === 'GET' && url.pathname === '/callback/poll') {
        if (activeAgentPort) {
          return await forwardToAgent('/callback/poll', 'GET');
        }
        const evt = reflectionService.invocationQueue.shift() || null;
        return Response.json({ success: true, event: evt });
      }

      if (req.method === 'POST' && url.pathname === '/callback/reply') {
        const body = (await req.json().catch(() => ({}))) as any;
        if (activeAgentPort) {
          return await forwardToAgent('/callback/reply', 'POST', body);
        }
        const pending = reflectionService.pendingCallbackReplies.get(
          Number(body.id),
        );
        if (pending) {
          if (body.success) pending.resolve(body.result);
          else pending.reject(new Error(body.error || 'Callback failed'));
          reflectionService.pendingCallbackReplies.delete(Number(body.id));
        }
        return Response.json({ success: true });
      }

      // --- 5. Screen Capture ---
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

  let consecutiveFails = 0;
  const livenessTimer = setInterval(async () => {
    try {
      if (isAttached && currentTargetPid) {
        const alive = await checkProcessAlive(currentTargetPid);
        if (!alive) {
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
