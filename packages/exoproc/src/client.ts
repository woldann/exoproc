import { existsSync, readFileSync } from 'node:fs';
let _winapi: any = null;
let _xffi: any = null;
let _accessors: any = null;
let _njava: any = null;

function getWinApi() {
  if (!_winapi) {
    if (process.platform !== 'win32') {
      throw new Error(
        'Native Windows API requires Windows or Wine environment',
      );
    }
    _winapi = require('bun-winapi');
  }
  return _winapi;
}

function getXffi() {
  if (!_xffi) {
    if (process.platform !== 'win32') {
      throw new Error('Native XFFI requires Windows or Wine environment');
    }
    _xffi = require('bun-xffi');
  }
  return _xffi;
}

function getAccessors() {
  if (!_accessors) {
    if (process.platform !== 'win32') {
      throw new Error('Native accessors require Windows or Wine environment');
    }
    _accessors = require('exoproc-accessors');
  }
  return _accessors;
}

function getNJava() {
  if (!_njava) {
    _njava = require('bun-njava');
  }
  return _njava;
}
import {
  MinecraftClient,
  MinecraftMatcher,
  type MinecraftClientOptions,
  type MinecraftPlayer,
  type MinecraftWorld,
  type MinecraftTimer,
  type MinecraftSettings,
} from 'exoproc-minecraft';

export interface GameContext {
  client?: MinecraftClient;
  thePlayer?: MinecraftPlayer;
  rawPlayer?: any;
  java?: any;
  theWorld?: MinecraftWorld;
  timer?: MinecraftTimer;
  gameSettings?: MinecraftSettings;
  tickCount: number;
  deltaTimeMs: number;
  captureScreenshot: (outputPath?: string) => Promise<ScreenshotResult>;
}

export type ModuleContext = GameContext;

import {
  GAME_PROFILES,
  detectProfileFromWindow,
  type GameProfile,
} from './config/profiles.js';
import {
  captureScreenshot,
  type ScreenshotOptions,
  type ScreenshotResult,
} from './screenshot/index.js';
import {
  getAgentJavaContext,
  ensureMinecraft,
  DEFAULT_AGENT_PORT,
  getDaemonEndpoint,
  checkDaemonAlive,
  attachRemote,
  type StatusResponse,
} from './remote/client.js';

export interface RunningProcessInfo {
  pid: number;
  name: string;
  windowTitle: string;
  isMinecraft: boolean;
  isJava: boolean;
  isRecognized: boolean;
  recognitionReason?: string;
  suggestedProfile: GameProfile;
}

export interface NeptuneTelemetry {
  connected: boolean;
  pid?: number;
  processName?: string;
  windowTitle?: string;
  profileId?: string;
  profileName?: string;
  playerName?: string;
  health: number;
  maxHealth: number;
  posX: number;
  posY: number;
  posZ: number;
  motionX: number;
  motionY: number;
  motionZ: number;
  yaw: number;
  pitch: number;
  onGround: boolean;
  timerSpeed: number;
  fps: number;
  tickCount: number;
}

export class NeptuneClient {
  public pid?: number;
  public processName?: string;
  public windowTitle?: string;
  public activeProfile?: GameProfile;
  public phase2Completed = false;
  public host?: any;
  public mcClient?: MinecraftClient;
  public java?: any;
  public rawMc?: any;
  public isUpgraded = false;
  public agentPort?: number;
  private isDaemonConnection = false;
  private daemonHost = '127.0.0.1';
  private daemonPort = 0;
  private running = false;
  private tickInterval?: any;
  private tickCount = 0;
  private lastTickTime = Date.now();
  private telemetryListeners: Array<(telemetry: NeptuneTelemetry) => void> = [];

  constructor() {}

  public onTelemetry(
    listener: (telemetry: NeptuneTelemetry) => void,
  ): () => void {
    this.telemetryListeners.push(listener);
    return () => {
      const idx = this.telemetryListeners.indexOf(listener);
      if (idx !== -1) this.telemetryListeners.splice(idx, 1);
    };
  }

  /**
   * Enumerates running Windows processes and matches their visible window titles.
   */
  public async listProcesses(): Promise<RunningProcessInfo[]> {
    if (process.platform !== 'win32') {
      return [];
    }
    const { ToolhelpSnapshot, Window } = getWinApi();
    const { ToolhelpSnapshotFlag } = getXffi();
    const processMap = new Map<number, { name: string; windowTitle: string }>();

    // 1. Enumerate all processes via ToolhelpSnapshot
    try {
      const snap = new ToolhelpSnapshot(ToolhelpSnapshotFlag.SNAPPROCESS);
      for (const p of snap.getProcesses()) {
        processMap.set(p.pid, { name: p.name, windowTitle: '' });
      }
      snap.close();
    } catch {}

    // 2. Enumerate visible windows to associate window titles with PIDs
    try {
      for (const win of Window.getWindows(256)) {
        try {
          const [_tid, pid] = win.getThreadProcessId();
          const title = win.getText()?.trim();
          const cls = win.getClassName()?.trim();
          if (!pid || !title) continue;
          if (title === 'Default IME' || cls === 'IME' || cls === 'Wine IME')
            continue;

          const entry = processMap.get(pid);
          if (entry) {
            if (
              !entry.windowTitle ||
              cls === 'LWJGL' ||
              title.toLowerCase().includes('minecraft')
            ) {
              entry.windowTitle = title;
            }
          } else {
            processMap.set(pid, { name: 'Unknown', windowTitle: title });
          }
        } catch {}
      }
    } catch {}

    // 3. Format and classify processes
    const results: RunningProcessInfo[] = [];

    for (const [pid, info] of processMap.entries()) {
      const nameLower = info.name.toLowerCase();
      const titleLower = info.windowTitle.toLowerCase();

      // Launchers (C++/Qt or Electron wrapper processes) are NOT the Minecraft game
      const isLauncher =
        nameLower.includes('prismlauncher') ||
        nameLower.includes('multimc') ||
        nameLower.includes('curseforge') ||
        nameLower.includes('tlauncher') ||
        (nameLower.includes('launcher') && !nameLower.includes('java'));

      const isJavaProcess =
        nameLower.includes('javaw') || nameLower.includes('java');

      const isMinecraft =
        !isLauncher &&
        (isJavaProcess ||
          titleLower.includes('minecraft') ||
          titleLower.includes('lunar') ||
          titleLower.includes('badlion') ||
          titleLower.includes('feather') ||
          titleLower.includes('labymod'));

      const isJava =
        !isLauncher &&
        (isJavaProcess ||
          titleLower.includes('1.8.9') ||
          titleLower.includes('1.7.10'));

      let isRecognized = false;
      let recognitionReason: string | undefined;

      if (titleLower.includes('lunar')) {
        isRecognized = true;
        recognitionReason = 'Lunar Client (Recognized)';
      } else if (titleLower.includes('badlion')) {
        isRecognized = true;
        recognitionReason = 'Badlion Client (Recognized)';
      } else if (titleLower.includes('feather')) {
        isRecognized = true;
        recognitionReason = 'Feather Client (Recognized)';
      } else if (titleLower.includes('labymod')) {
        isRecognized = true;
        recognitionReason = 'LabyMod (Recognized)';
      } else if (titleLower.includes('forge') || titleLower.includes('fml')) {
        isRecognized = true;
        recognitionReason = 'Minecraft Forge (Recognized)';
      } else if (
        titleLower.includes('minecraft') ||
        titleLower.includes('1.8.9') ||
        titleLower.includes('1.7.10')
      ) {
        isRecognized = true;
        recognitionReason = 'Minecraft 1.8.9 / 1.7 (Recognized)';
      } else if (nameLower.includes('javaw') || nameLower.includes('java')) {
        isRecognized = true;
        recognitionReason = 'Minecraft Java Runtime (javaw.exe)';
      } else if (isMinecraft) {
        isRecognized = true;
        recognitionReason = 'Minecraft Process';
      }

      const suggestedProfile = detectProfileFromWindow(
        info.windowTitle,
        info.name,
      );

      results.push({
        pid,
        name: info.name,
        windowTitle: info.windowTitle,
        isMinecraft,
        isJava,
        isRecognized,
        recognitionReason,
        suggestedProfile,
      });
    }

    // Sort: Recognized Minecraft window titles FIRST, then other Minecraft, then Java, then alphabetized
    return results.sort((a, b) => {
      if (a.isRecognized && !b.isRecognized) return -1;
      if (!a.isRecognized && b.isRecognized) return 1;
      if (a.isMinecraft && !b.isMinecraft) return -1;
      if (!a.isMinecraft && b.isMinecraft) return 1;
      if (a.isJava && !b.isJava) return -1;
      if (!a.isJava && b.isJava) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Connects to a specific process PID and applies profile-driven MatchOptions.
   */
  public async connect(
    pid: number,
    profileId?: string,
    customOptions: MinecraftClientOptions = {},
  ): Promise<MinecraftClient> {
    this.pid = pid;
    this.isDaemonConnection = false;
    this.isUpgraded = false;
    this.agentPort = undefined;

    // Find process info and window title for profile heuristics
    const procList = await this.listProcesses();
    const targetInfo = procList.find((p) => p.pid === pid);
    this.processName = targetInfo?.name ?? 'javaw.exe';
    this.windowTitle = targetInfo?.windowTitle ?? '';

    // Determine profile
    if (profileId && GAME_PROFILES[profileId]) {
      this.activeProfile = GAME_PROFILES[profileId];
    } else if (targetInfo) {
      this.activeProfile = targetInfo.suggestedProfile;
    } else {
      this.activeProfile = detectProfileFromWindow(
        this.windowTitle,
        this.processName,
      );
    }

    const mergedOptions: MinecraftClientOptions = {
      ...this.activeProfile.matchOptions,
      ...customOptions,
    };

    const { createAccessor } = getAccessors();
    const { getJavaSync } = getNJava();

    this.host = await createAccessor(pid, { njava: 'stealth' });
    this.mcClient = await MinecraftClient.attach(this.host, mergedOptions);

    // Initialize fast Java sync proxy
    try {
      this.java =
        typeof (this.host as any).getJavaSync === 'function'
          ? (this.host as any).getJavaSync()
          : getJavaSync(this.host);
      const matcher = new MinecraftMatcher(this.mcClient.bridge);
      matcher.registerTo(this.java, this.mcClient.mappings);
      const Minecraft = this.java.type('net.minecraft.client.Minecraft');
      try {
        this.rawMc =
          typeof Minecraft.getMinecraft === 'function'
            ? Minecraft.getMinecraft()
            : Minecraft.theMinecraft;
      } catch {
        this.rawMc = Minecraft.theMinecraft;
      }
      console.log(
        '[Neptune] ✓ Initialized fast Java reflection proxy for live Minecraft synchronization',
      );
    } catch (proxyErr: any) {
      console.warn(
        '[Neptune] Standby for Java reflection proxy:',
        proxyErr?.message ?? proxyErr,
      );
    }

    this.startTickLoop();
    return this.mcClient;
  }

  /**
   * Connects to a running NJava Agent HTTP server.
   * Completely cross-platform, works directly on Linux/macOS/Windows without Windows accessors.
   */
  public async connectAgent(
    options: {
      host?: string;
      port?: number;
      poolPath?: string;
      profileId?: string;
    } = {},
  ): Promise<MinecraftClient> {
    const host = options.host ?? '127.0.0.1';
    const port = options.port ?? DEFAULT_AGENT_PORT;

    this.java = getAgentJavaContext(host, port);
    this.mcClient = await ensureMinecraft(host, port, {
      poolPath: options.poolPath,
      force: true,
    });
    if (!this.mcClient) {
      throw new Error(
        `Failed to initialize MinecraftClient from agent at ${host}:${port}`,
      );
    }

    try {
      const Minecraft = this.java.type('net.minecraft.client.Minecraft');
      try {
        this.rawMc =
          typeof Minecraft.getMinecraft === 'function'
            ? Minecraft.getMinecraft()
            : Minecraft.theMinecraft;
      } catch {
        this.rawMc = Minecraft.theMinecraft;
      }
    } catch {}

    if (options.profileId && GAME_PROFILES[options.profileId]) {
      this.activeProfile = GAME_PROFILES[options.profileId];
    }

    this.startTickLoop();
    this.isDaemonConnection = false;
    this.isUpgraded = true;
    this.agentPort = port;
    return this.mcClient;
  }

  /**
   * Connects to a running Neptune daemon HTTP server.
   */
  public async connectDaemon(
    options: {
      host?: string;
      port?: number;
      pid?: number;
      profile?: string;
    } = {},
  ): Promise<StatusResponse> {
    const ep = getDaemonEndpoint();
    const host = options.host ?? ep.host;
    const port = options.port ?? ep.port;

    if (options.pid || options.profile) {
      await attachRemote({ pid: options.pid, profile: options.profile });
    }

    const status = await checkDaemonAlive(host, port);
    if (!status || !status.alive) {
      throw new Error(`Neptune daemon at ${host}:${port} is not reachable`);
    }

    this.pid = status.pid ?? undefined;
    this.processName = status.targetName ?? undefined;
    this.windowTitle = status.windowTitle ?? undefined;
    this.isDaemonConnection = true;
    this.daemonHost = host;
    this.daemonPort = port;
    this.isUpgraded = Boolean(status.upgraded);
    this.agentPort = status.agentPort ?? undefined;

    if (status.profile && GAME_PROFILES[status.profile]) {
      this.activeProfile = GAME_PROFILES[status.profile];
    }

    if (status.attached) {
      try {
        this.java = getAgentJavaContext(host, port);
        this.mcClient = await ensureMinecraft(host, port).catch(() => null);
        if (this.mcClient && this.java) {
          try {
            const Minecraft = this.java.type('net.minecraft.client.Minecraft');
            this.rawMc =
              typeof Minecraft.getMinecraft === 'function'
                ? Minecraft.getMinecraft()
                : Minecraft.theMinecraft;
          } catch {}
        }
      } catch {}
    }

    return status;
  }

  /**
   * Upgrades the active external memory or daemon connection to an in-process Java Agent.
   * Loads the agent .class bytecode and dynamically defines it into JVM memory (ClassLoader.defineClass).
   * Elevates Neptune's Java reflection and Minecraft client to communicate directly with the in-process agent.
   */
  public async upgradeToAgent(
    options: {
      classPath?: string;
      bytecode?: Uint8Array;
      className?: string;
      port?: number;
      obfuscate?: boolean;
      poolPath?: string;
      targetVersion?: number;
    } = {},
  ): Promise<{
    success: boolean;
    port: number;
    className: string;
    upgraded: boolean;
  }> {
    const targetPort = options.port ?? DEFAULT_AGENT_PORT;

    // 1. If connected via Daemon, call daemon /upgrade endpoint
    if (this.isDaemonConnection && this.daemonHost && this.daemonPort) {
      const payload: any = {
        classPath: options.classPath,
        port: targetPort,
        obfuscate: options.obfuscate,
        targetVersion: options.targetVersion,
      };
      if (options.bytecode) {
        payload.bytecode = Buffer.from(options.bytecode).toString('base64');
      }
      const res = await fetch(
        `http://${this.daemonHost}:${this.daemonPort}/upgrade`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as any;
      if (!data.success) {
        throw new Error(
          `Daemon upgrade failed: ${data.error || 'Unknown error'}`,
        );
      }

      const effectivePort: number = data.port || targetPort;
      this.isUpgraded = true;
      this.agentPort = effectivePort;
      this.java = getAgentJavaContext(this.daemonHost, effectivePort);
      this.mcClient = await ensureMinecraft(this.daemonHost, effectivePort, {
        poolPath: options.poolPath,
        force: true,
      }).catch(() => null);
      if (this.mcClient && this.java) {
        try {
          const Minecraft = this.java.type('net.minecraft.client.Minecraft');
          this.rawMc =
            typeof Minecraft.getMinecraft === 'function'
              ? Minecraft.getMinecraft()
              : Minecraft.theMinecraft;
        } catch {}
      }

      return {
        success: true,
        port: effectivePort,
        className: data.className || 'Exoproc',
        upgraded: true,
      };
    }

    // 2. Direct / in-process / external memory connection upgrade
    if (!this.java && !this.host) {
      throw new Error(
        'Neptune is not attached to any process. Call connect(pid) or connectDaemon() before upgrading.',
      );
    }

    const {
      injectAgentInMemory,
      getAgentBytecode,
      extractClassNameFromClassBytes,
    } = await import('njava-agent');

    let bytecode = options.bytecode;
    let className = options.className;
    let mappings: any = undefined;

    if (!bytecode && options.classPath) {
      if (!existsSync(options.classPath)) {
        throw new Error(`Agent .class file not found at: ${options.classPath}`);
      }
      bytecode = new Uint8Array(readFileSync(options.classPath));
      className =
        className ||
        extractClassNameFromClassBytes(bytecode) ||
        'org.exoproc.njava.agent.utils.Exoproc';
    }

    if (!bytecode) {
      const buildRes = await getAgentBytecode({
        javaVersion: options.targetVersion,
        obfuscate: options.obfuscate ?? false,
      });
      bytecode = buildRes.bytecode;
      className = className || buildRes.className;
      mappings = buildRes.mappings;
    }

    className = className || 'org.exoproc.njava.agent.utils.Exoproc';

    // Inject agent .class directly into target JVM memory (zero disk JARs)
    const injectRes = await injectAgentInMemory(this.java, {
      port: targetPort,
      classPath: options.classPath,
      bytecode,
      className,
      mappings,
      verbose: true,
      buildResult: {
        bytecode,
        className,
        javaVersion: options.targetVersion ?? 8,
        mappings,
      },
    });

    // Elevate Neptune to in-process agent
    this.java = getAgentJavaContext('127.0.0.1', targetPort);
    this.isUpgraded = true;
    this.agentPort = targetPort;

    try {
      this.mcClient = await ensureMinecraft('127.0.0.1', targetPort, {
        poolPath: options.poolPath,
        force: true,
      }).catch(() => null);
      if (this.mcClient && this.java) {
        const Minecraft = this.java.type('net.minecraft.client.Minecraft');
        this.rawMc =
          typeof Minecraft.getMinecraft === 'function'
            ? Minecraft.getMinecraft()
            : Minecraft.theMinecraft;
      }
    } catch {}

    return {
      success: true,
      port: targetPort,
      className: injectRes.className,
      upgraded: true,
    };
  }

  /**
   * Alias for upgradeToAgent.
   */
  public async upgrade(
    options?: Parameters<NeptuneClient['upgradeToAgent']>[0],
  ) {
    return this.upgradeToAgent(options);
  }

  /**
   * Executes a Nashorn-style JavaScript script in-process against the connected Minecraft instance.
   */
  public async executeScript(
    scriptPathOrCode: string,
    options: {
      pid?: number;
      timeoutMs?: number;
      onLog?: (msg: string) => void;
      globals?: Record<string, any>;
    } = {},
  ): Promise<any> {
    const targetPid = options.pid ?? this.pid;
    if (!targetPid && !this.java) {
      throw new Error(
        'NeptuneClient.executeScript: not connected to any process or agent. Call connect or connectAgent first.',
      );
    }
    if (!this.java && targetPid) {
      await this.connect(targetPid);
    }

    const isFile = existsSync(scriptPathOrCode);
    const sourceCode = isFile
      ? readFileSync(scriptPathOrCode, 'utf8')
      : scriptPathOrCode;

    const logs: string[] = [];
    const printFn = (...args: any[]) => {
      const line = args
        .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
        .join(' ');
      logs.push(line);
      options.onLog?.(line);
    };

    const paramNames = ['Java', 'print', 'neptune', 'client', 'mc'];
    const paramValues = [this.java, printFn, this, this, this.rawMc];

    if (options.globals && typeof options.globals === 'object') {
      for (const [key, value] of Object.entries(options.globals)) {
        if (!paramNames.includes(key)) {
          paramNames.push(key);
          paramValues.push(value);
        }
      }
    }

    const AsyncFunction = Object.getPrototypeOf(
      async function () {},
    ).constructor;
    const scriptFn = new AsyncFunction(...paramNames, sourceCode);
    return await scriptFn(...paramValues);
  }

  /**
   * Captures a screenshot of the attached (or auto-detected) target game window via NThread.
   * Can be called directly on an actively injected/connected NeptuneClient instance.
   */
  public async captureScreenshot(
    options: ScreenshotOptions = {},
  ): Promise<ScreenshotResult> {
    if (!this.host) {
      const { screenshotRemote } = await import('./remote/client.js');
      const res = await screenshotRemote(options.outputPath ?? undefined);
      if (res.success && res.filePath) {
        return {
          success: true,
          filePath: res.filePath,
          width: res.width ?? 0,
          height: res.height ?? 0,
          windowTitle: res.windowTitle ?? '',
        };
      }
      throw new Error(
        res.error || 'Failed to capture screenshot via remote endpoint',
      );
    }

    let targetPid = options.pid ?? this.pid;
    if (!targetPid) {
      const procs = await this.listProcesses();
      const targetProc = procs.find((p) => p.isMinecraft || p.isJava);
      if (targetProc) {
        targetPid = targetProc.pid;
      }
    }
    return captureScreenshot({
      accessor: options.accessor ?? this.host,
      ...options,
      pid: targetPid,
    });
  }

  /**
   * Creates a live ModuleContext with both MinecraftClient wrappers and raw Java proxies.
   */
  public async createModuleContext(): Promise<ModuleContext> {
    const now = Date.now();
    const deltaTimeMs = now - this.lastTickTime;

    let player: MinecraftPlayer | undefined;
    let world: MinecraftWorld | undefined;
    let timer: MinecraftTimer | undefined;
    let settings: MinecraftSettings | undefined;
    let rawPlayer: any;

    // Self-healing: if Java proxy was pending or failed during connect, initialize it here
    if (!this.java && this.host && this.mcClient) {
      try {
        this.java =
          typeof (this.host as any).getJavaSync === 'function'
            ? (this.host as any).getJavaSync()
            : getNJava().getJavaSync(this.host);
        const matcher = new MinecraftMatcher(this.mcClient.bridge);
        matcher.registerTo(this.java, this.mcClient.mappings);
        console.log(
          '[Neptune] ✓ Lazily initialized fast Java reflection proxy',
        );
      } catch {}
    }

    if (!this.rawMc && this.java) {
      try {
        const Minecraft = this.java.type('net.minecraft.client.Minecraft');
        try {
          this.rawMc =
            typeof Minecraft.getMinecraft === 'function'
              ? Minecraft.getMinecraft()
              : Minecraft.theMinecraft;
        } catch {
          this.rawMc = Minecraft.theMinecraft;
        }
      } catch {}
    }

    if (this.rawMc) {
      try {
        const p = this.rawMc.thePlayer;
        if (p && typeof p === 'object' && (p.$ptr || p.$address)) {
          rawPlayer = p;

          // Auto-trigger Phase 2 world scanning when entering a world
          if (!this.phase2Completed && this.mcClient && this.java) {
            this.phase2Completed = true;
            console.log(
              '[Neptune] 🌍 In-world player detected! Automatically running Phase 2 matching (matchWorld)...',
            );
            const matcher = new MinecraftMatcher(this.mcClient.bridge);
            matcher
              .matchWorld(this.activeProfile?.matchOptions)
              .then((worldMappings) => {
                if (worldMappings) {
                  matcher.registerTo(this.java, worldMappings);
                  (this.mcClient as any).mappings = worldMappings;
                  console.log(
                    '[Neptune] ✓ Phase 2 auto-resolution completed & registered',
                  );
                }
              })
              .catch((err) => {
                this.phase2Completed = false;
                console.warn(
                  '[Neptune] Phase 2 auto-resolution failed:',
                  err?.message || err,
                );
              });
          }
        }
      } catch {}
    }

    if (this.mcClient) {
      try {
        player = await this.mcClient.getPlayer();
        if (player && rawPlayer) {
          player.rawPlayer = rawPlayer;
          player.capabilities = rawPlayer.capabilities;
        }
      } catch {}
      try {
        world = await this.mcClient.getWorld();
      } catch {}
      try {
        timer = await this.mcClient.getTimer();
      } catch {}
      try {
        settings = await this.mcClient.getSettings();
      } catch {}
    }

    return {
      client: this.mcClient,
      thePlayer: player,
      rawPlayer,
      java: this.java,
      theWorld: world,
      timer,
      gameSettings: settings,
      tickCount: this.tickCount,
      deltaTimeMs,
      captureScreenshot: (outputPath?: string) =>
        this.captureScreenshot({ outputPath }),
    };
  }

  /**
   * Auto-detects and connects to the best matching Minecraft process.
   */
  public async findAndConnect(
    profileId?: string,
    options: MinecraftClientOptions = {},
  ): Promise<MinecraftClient> {
    const procs = await this.listProcesses();
    const mcProc = procs.find((p) => p.isMinecraft || p.isJava);

    if (!mcProc) {
      throw new Error('No running Minecraft / Java process found');
    }

    return await this.connect(
      mcProc.pid,
      profileId ?? mcProc.suggestedProfile.id,
      options,
    );
  }

  public startTickLoop(tickRateHz = 30): void {
    if (this.running) return;
    this.running = true;
    const intervalMs = Math.floor(1000 / tickRateHz);

    this.tickInterval = setInterval(async () => {
      if (!this.running) return;
      await this.tick();
    }, intervalMs);
  }

  public stopTickLoop(): void {
    this.running = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = undefined;
    }
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    this.tickCount++;

    if (!this.mcClient && !this.rawMc) return;

    try {
      await this.createModuleContext();
      this.lastTickTime = now;

      // Collect telemetry if listeners exist
      if (this.telemetryListeners.length > 0) {
        const telemetry = await this.getTelemetry();
        for (const listener of this.telemetryListeners) {
          try {
            listener(telemetry);
          } catch {}
        }
      }
    } catch {}
  }

  public async getTelemetry(): Promise<NeptuneTelemetry> {
    if (!this.mcClient) {
      return {
        connected: false,
        processName: this.processName,
        windowTitle: this.windowTitle,
        profileId: this.activeProfile?.id,
        profileName: this.activeProfile?.name,
        health: 0,
        maxHealth: 20,
        posX: 0,
        posY: 0,
        posZ: 0,
        motionX: 0,
        motionY: 0,
        motionZ: 0,
        yaw: 0,
        pitch: 0,
        onGround: false,
        timerSpeed: 1.0,
        fps: 0,
        tickCount: this.tickCount,
      };
    }

    try {
      let posX = 0,
        posY = 0,
        posZ = 0;
      let motionX = 0,
        motionY = 0,
        motionZ = 0;
      let yaw = 0,
        pitch = 0;
      let onGround = false;
      let health = 20,
        maxHealth = 20;

      // Fast path or fallback: extract metrics from raw Java proxy
      if (this.rawMc) {
        try {
          const rawP = this.rawMc.thePlayer;
          if (rawP) {
            if (typeof rawP.posX === 'number') posX = rawP.posX;
            if (typeof rawP.posY === 'number') posY = rawP.posY;
            if (typeof rawP.posZ === 'number') posZ = rawP.posZ;
            if (typeof rawP.motionX === 'number') motionX = rawP.motionX;
            if (typeof rawP.motionY === 'number') motionY = rawP.motionY;
            if (typeof rawP.motionZ === 'number') motionZ = rawP.motionZ;
            if (typeof rawP.rotationYaw === 'number') yaw = rawP.rotationYaw;
            if (typeof rawP.rotationPitch === 'number')
              pitch = rawP.rotationPitch;
            if (typeof rawP.onGround === 'boolean') onGround = rawP.onGround;
          }
        } catch {}
      }

      try {
        const player = await this.mcClient.getPlayer();
        if (player) {
          const pos = await player
            .getPos()
            .catch(() => ({ x: posX, y: posY, z: posZ }));
          posX = pos.x;
          posY = pos.y;
          posZ = pos.z;

          const motion = await player
            .getMotion()
            .catch(() => ({ x: motionX, y: motionY, z: motionZ }));
          motionX = motion.x;
          motionY = motion.y;
          motionZ = motion.z;

          const rot = await player.getRotation().catch(() => ({ yaw, pitch }));
          yaw = rot.yaw;
          pitch = rot.pitch;

          onGround = await player.isOnGround().catch(() => onGround);
          health = await player.getHealth().catch(() => 20);
          maxHealth = await player.getMaxHealth().catch(() => 20);
        }
      } catch {}

      let timerSpeed = 1.0;
      try {
        const timer = await this.mcClient.getTimer();
        if (timer) {
          timerSpeed = await timer.getTimerSpeed().catch(() => 1.0);
        }
      } catch {}

      return {
        connected: true,
        pid: this.pid,
        processName: this.processName,
        windowTitle: this.windowTitle,
        profileId: this.activeProfile?.id,
        profileName: this.activeProfile?.name,
        health,
        maxHealth,
        posX: Number(posX.toFixed(2)),
        posY: Number(posY.toFixed(2)),
        posZ: Number(posZ.toFixed(2)),
        motionX: Number(motionX.toFixed(3)),
        motionY: Number(motionY.toFixed(3)),
        motionZ: Number(motionZ.toFixed(3)),
        yaw: Number(yaw.toFixed(1)),
        pitch: Number(pitch.toFixed(1)),
        onGround,
        timerSpeed: Number(timerSpeed.toFixed(2)),
        fps: 60,
        tickCount: this.tickCount,
      };
    } catch {
      return {
        connected: true,
        pid: this.pid,
        processName: this.processName,
        windowTitle: this.windowTitle,
        profileId: this.activeProfile?.id,
        profileName: this.activeProfile?.name,
        health: 20,
        maxHealth: 20,
        posX: 0,
        posY: 0,
        posZ: 0,
        motionX: 0,
        motionY: 0,
        motionZ: 0,
        yaw: 0,
        pitch: 0,
        onGround: false,
        timerSpeed: 1.0,
        fps: 60,
        tickCount: this.tickCount,
      };
    }
  }

  public async disconnect(): Promise<void> {
    this.stopTickLoop();
    this.mcClient = undefined;
    this.host = undefined;
    this.pid = undefined;
    this.processName = undefined;
    this.windowTitle = undefined;
    this.activeProfile = undefined;
  }
}
