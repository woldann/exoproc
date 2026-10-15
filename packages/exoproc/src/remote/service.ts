import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import * as client from './client.js';
import * as api from './api.js';
import { guiNavigator } from './gui-navigator.js';
import { hasNativeXffi } from '../capabilities.js';

let _directClient: any = null;
async function getDirectClient() {
  if (!_directClient) {
    const { ExoprocClient } = await import('../client.js');
    _directClient = new ExoprocClient();
  }
  return _directClient;
}

function isDirectSupported(): boolean {
  return hasNativeXffi() && !process.env.EXOPROC_REMOTE;
}

export class ExoprocService {
  // Status and Process Management
  async getStatus(): Promise<client.StatusResponse | null> {
    const { getActiveTarget, checkAgentSlot, listSavedSessions } =
      await import('../session.js');
    const active = getActiveTarget();

    if (active?.type === 'agent') {
      const info = await checkAgentSlot(
        active.slot,
        active.host ?? '127.0.0.1',
      );
      if (info.alive && info.status) {
        return {
          alive: true,
          attached: true,
          daemonPid: 0,
          port: info.port,
          agentPort: info.port,
          buildId: info.status.buildId,
          version: info.status.version,
          uptime: info.status.uptime ?? 0,
          upgraded: true,
          targetName: info.status.targetName || 'Minecraft (Java Agent)',
          windowTitle: info.status.windowTitle,
        };
      }
    }

    if (active?.type === 'accessor') {
      const { HostAccessor } = await import('bun-xffi');
      const { existsSync } = await import('node:fs');
      if (existsSync(active.sessionPath)) {
        try {
          const sess = HostAccessor.loadSession(active.sessionPath);
          return {
            alive: true,
            attached: true,
            daemonPid: process.pid,
            pid: active.pid,
            targetName:
              sess.metadata?.processName || active.processName || 'javaw.exe',
            windowTitle:
              sess.metadata?.windowTitle || active.windowTitle || null,
            profile: sess.metadata?.profileId || 'auto',
            port: 0,
            uptime: Math.floor(
              (Date.now() -
                Date.parse(sess.savedAt || new Date().toISOString())) /
                1000,
            ),
            upgraded: false,
            nativeSupported: true,
          };
        } catch {}
      }
    }

    // Auto-discover if single saved session exists
    const sessions = listSavedSessions();
    if (sessions.length > 0 && sessions[0]) {
      const s = sessions[0];
      return {
        alive: true,
        attached: true,
        daemonPid: process.pid,
        pid: s.pid,
        targetName: s.metadata?.processName || 'javaw.exe',
        windowTitle: s.metadata?.windowTitle || null,
        port: 0,
        uptime: 0,
        upgraded: false,
        nativeSupported: true,
      };
    }

    return null;
  }

  async listProcesses(): Promise<client.CandidateProcess[]> {
    if (isDirectSupported()) {
      try {
        const direct = await getDirectClient();
        const procs = await direct.listProcesses();
        return procs.map((p: any) => ({
          pid: p.pid,
          name: p.name,
          windowTitle: p.windowTitle,
          isMinecraft: p.isMinecraft,
        }));
      } catch {}
    }
    return [];
  }

  async attach(pid?: number): Promise<{
    success: boolean;
    pid?: number;
    message?: string;
    error?: string;
  }> {
    try {
      const { createAccessor } = await import('exoproc-accessors');
      const { getSessionPath, setActiveTarget } = await import('../session.js');

      let targetPid = pid;
      let processName = 'javaw.exe';
      let windowTitle = '';

      if (!targetPid) {
        const procs = await this.listProcesses();
        const target = procs.find(
          (p) => p.isMinecraft || p.name.toLowerCase().includes('java'),
        );
        if (!target) {
          return {
            success: false,
            error:
              'Target Minecraft/Java process not found. Pass PID explicitly: exoproc attach <pid>',
          };
        }
        targetPid = target.pid;
        processName = target.name;
        windowTitle = target.windowTitle || '';
      } else {
        const procs = await this.listProcesses().catch(() => []);
        const target = procs.find((p) => p.pid === targetPid);
        if (target) {
          processName = target.name;
          windowTitle = target.windowTitle || '';
        }
      }

      // Initialize stealth accessor
      const accessor = await createAccessor(targetPid, { njava: 'stealth' });
      accessor.setSessionMetadata('processName', processName);
      accessor.setSessionMetadata('windowTitle', windowTitle);

      const sessionPath = getSessionPath(targetPid);
      // Hibernate thread and save session to cache file under lock
      await (accessor as any).save(sessionPath);

      // Set as active target
      setActiveTarget({
        type: 'accessor',
        pid: targetPid,
        sessionPath,
        processName,
        windowTitle,
        updatedAt: new Date().toISOString(),
      });

      return {
        success: true,
        pid: targetPid,
        message: `Attached directly to ${processName} (PID: ${targetPid}) and cached session to ${sessionPath}`,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  async detach(): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    const { getActiveTarget, clearActiveTarget } =
      await import('../session.js');
    const { existsSync, unlinkSync } = await import('node:fs');
    const active = getActiveTarget();

    if (active?.type === 'accessor') {
      try {
        if (existsSync(active.sessionPath)) {
          unlinkSync(active.sessionPath);
        }
      } catch {}
      clearActiveTarget();
      return {
        success: true,
        message: `Detached from PID ${active.pid} and removed cached session`,
      };
    }

    if (active?.type === 'agent') {
      clearActiveTarget();
      return {
        success: true,
        message: `Detached from Agent slot ${active.slot} (port ${active.port})`,
      };
    }

    clearActiveTarget();
    return {
      success: true,
      message: 'Detached from target process',
    };
  }

  async shutdown(): Promise<{ success: boolean; message?: string }> {
    return await this.detach();
  }

  async selectTarget(selector?: string | number): Promise<any> {
    const { listAllTargets, selectTarget } = await import('../session.js');
    if (selector === undefined || selector === null || selector === '') {
      return await listAllTargets();
    }
    const chosen = await selectTarget(selector);
    return {
      success: true,
      message: `Selected active target: ${chosen.type === 'agent' ? `Agent Slot ${chosen.slot} (Port ${chosen.port})` : `Accessor Session PID ${chosen.pid}`}`,
      target: chosen,
    };
  }

  // Agent Elevation / In-Process Upgrade
  async upgrade(options?: {
    classPath?: string;
    bytecode?: string | Uint8Array;
    className?: string;
    port?: number;
    obfuscate?: boolean;
    targetVersion?: number;
  }): Promise<{
    success: boolean;
    port?: number;
    slot?: number;
    className?: string;
    upgraded?: boolean;
    error?: string;
  }> {
    try {
      const { getNextAvailableAgentSlot, getSlotForPort, setActiveTarget } =
        await import('../session.js');

      let targetPort = options?.port;
      let targetSlot: number | null = null;

      if (!targetPort) {
        const next = await getNextAvailableAgentSlot();
        targetPort = next.port;
        targetSlot = next.slot;
      } else {
        targetSlot = getSlotForPort(targetPort);
      }

      const res = await client.upgradeRemote({
        ...options,
        port: targetPort,
      });

      if (res.success && targetPort) {
        setActiveTarget({
          type: 'agent',
          slot: (targetSlot as any) || 1,
          port: targetPort,
          processName: 'Minecraft (Java Agent)',
          updatedAt: new Date().toISOString(),
        });
      }

      return {
        ...res,
        slot: targetSlot || undefined,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  // Raw Evaluation & Script execution
  async evalCode(
    code: string,
    options?: {
      globals?: Record<string, any>;
      timeoutMs?: number;
      minecraft?: boolean;
      poolPath?: string;
    },
  ): Promise<any> {
    return await client.evalRemote(
      code,
      options?.globals,
      options?.timeoutMs ?? 15000,
      options,
    );
  }

  async runScript(
    scriptPath?: string,
    scriptCode?: string,
    globals?: Record<string, any>,
    options?: { timeoutMs?: number; minecraft?: boolean; poolPath?: string },
  ): Promise<any> {
    return await client.runRemote(
      scriptPath,
      scriptCode,
      globals,
      options?.timeoutMs ?? 20000,
      options,
    );
  }

  // Minecraft Capability (Optional Feature)
  async isMinecraft(): Promise<boolean> {
    const { host, port } = await client.ensureDaemon();
    return await client.isMinecraftTarget(host, port);
  }

  async initMinecraft(
    options?: any,
  ): Promise<{ success: boolean; mappings?: any; error?: string }> {
    try {
      const { host, port } = await client.ensureDaemon();
      const mc = await client.ensureMinecraft(host, port, {
        ...options,
        force: true,
      });
      return {
        success: Boolean(mc),
        mappings: mc?.mappings,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || String(err),
      };
    }
  }

  async getMinecraftClient(): Promise<any> {
    const { host, port } = await client.ensureDaemon();
    return await client.ensureMinecraft(host, port);
  }

  async screenshot(
    outputPath?: string,
  ): Promise<client.ScreenshotRemoteResult> {
    if (isDirectSupported()) {
      const endpoint = client.getDaemonEndpoint();
      if (endpoint.port) {
        const alive = await client.checkDaemonAlive(
          endpoint.host,
          endpoint.port,
        );
        if (alive) return await client.screenshotRemote(outputPath);
      }
      const { captureScreenshot } = await import('../screenshot/index.js');
      const res = await captureScreenshot({ outputPath });
      return {
        success: res.success,
        path: res.filePath,
        filePath: res.filePath,
        width: res.width,
        height: res.height,
        windowTitle: res.windowTitle,
      };
    }
    return await client.screenshotRemote(outputPath);
  }

  async fetchScreenshot(): Promise<{
    buffer: Buffer;
    width?: number;
    height?: number;
    base64?: string;
    windowTitle?: string;
  }> {
    return await client.fetchScreenshot();
  }

  // GUI & Screen Automation
  async getGui(options?: { includePool?: boolean }): Promise<api.GuiInfo> {
    return await api.inspectGui(options);
  }

  async click(buttonIdOrText: number | string): Promise<api.ClickResult> {
    return await api.clickButton(buttonIdOrText);
  }

  async closeScreen(): Promise<{ success: boolean; error?: string }> {
    return await api.closeScreen();
  }

  async resume(): Promise<{
    success: boolean;
    inGame: boolean;
    screenName?: string;
    error?: string;
  }> {
    return await api.resumeGame();
  }

  async navigate(
    targetOrOnProgress?: string | ((msg: string) => void),
    onProgress?: (msg: string) => void,
  ): Promise<{
    success: boolean;
    inGame: boolean;
    screenName?: string;
    steps: string[];
    error?: string;
    coords?: { x: number; y: number; z: number };
  }> {
    let target = 'InGame';
    let progressCb = onProgress;
    if (typeof targetOrOnProgress === 'string') {
      target = targetOrOnProgress;
    } else if (typeof targetOrOnProgress === 'function') {
      progressCb = targetOrOnProgress;
    }

    const res = await guiNavigator.navigateTo(target, progressCb);
    return {
      success: res.success,
      inGame: res.currentScreen === 'InGame',
      screenName: res.currentScreen,
      steps: res.steps,
      coords: res.coords,
      error: res.success ? undefined : res.message,
    };
  }

  // Player & World Telemetry
  async getPlayer(): Promise<api.PlayerInfo> {
    return await api.inspectPlayer();
  }

  async getWorld(): Promise<api.WorldInfo> {
    return await api.inspectWorld();
  }

  async getState(): Promise<{
    status?: client.StatusResponse | null;
    gui: api.GuiInfo;
    player: api.PlayerInfo;
    world: api.WorldInfo;
  }> {
    const status = await this.getStatus();
    const data = await api.inspectState();
    return { status, ...data };
  }

  async getTarget(reach: number = 30): Promise<api.TargetResult> {
    return await api.inspectTarget(reach);
  }

  async getEntities(radius: number = 64): Promise<api.NearbyEntitiesResult> {
    return await api.inspectEntities(radius);
  }

  async getInventory(): Promise<api.InventoryResult> {
    return await api.inspectInventory();
  }

  async getJava(): Promise<api.JavaInfo> {
    return await api.inspectJava();
  }

  // Actions & Controls
  async chat(
    message: string,
  ): Promise<{ success: boolean; message: string; error?: string }> {
    return await api.sendChat(message);
  }

  async look(
    yaw: number,
    pitch: number,
  ): Promise<{ success: boolean; yaw: number; pitch: number; error?: string }> {
    return await api.setPlayerLook(yaw, pitch);
  }

  async action(
    act: 'swing' | 'attack' | 'use' | 'jump',
  ): Promise<api.PlayerActionResult> {
    return await api.triggerPlayerAction(act);
  }

  async jump(): Promise<api.PlayerActionResult> {
    return await api.triggerPlayerAction('jump');
  }

  async attack(): Promise<api.PlayerActionResult> {
    return await api.triggerPlayerAction('attack');
  }

  async use(): Promise<api.PlayerActionResult> {
    return await api.triggerPlayerAction('use');
  }

  async slot(index: number): Promise<api.HotbarSelectResult> {
    return await api.selectHotbarSlot(index);
  }

  // Reflection & Classpool Inspection
  async pool(target?: string): Promise<any> {
    return await api.inspectPool(target);
  }

  async database(target?: string): Promise<any> {
    return await api.inspectDatabase(target);
  }

  // GUI Crawling & Mappings Export
  async crawl(options?: {
    targets?: string[];
    onProgress?: (msg: string) => void;
  }): Promise<any> {
    return await api.crawlGuis(options);
  }

  async exportMappings(
    profile?: string,
    options?: {
      outPath?: string;
      crawlGuis?: boolean;
      minecraft?: boolean;
      targets?: string[];
      onProgress?: (msg: string) => void;
    },
  ): Promise<api.ExportMappingsResult> {
    return await api.exportMappings(profile, options);
  }

  // Agent Export & Dump
  async dumpAgent(
    options: {
      path?: string;
      format?: 'jar' | 'class' | 'mapping';
      javaVersion?: number;
      javaPath?: string;
      obfuscate?: boolean;
      dumpMappings?: boolean | string;
    } = {},
  ): Promise<{
    success: boolean;
    type: 'jar' | 'class' | 'mapping';
    path: string;
    size: number;
    javaVersion: number;
    obfuscated: boolean;
    className?: string;
    classesCount?: number;
    buildId?: string;
    mappingsPath?: string;
    error?: string;
  }> {
    try {
      const {
        getAgentBytecodeSync,
        getAgentJarSync,
        generateObfuscationMappings,
        formatMappingsHumanReadable,
      } = await import('njava-agent');
      const javaVersion =
        options.javaVersion !== undefined ? Number(options.javaVersion) : 8;
      const obfuscate = options.obfuscate ?? true;

      const isMappingOnly =
        options.format === 'mapping' ||
        (options.path &&
          (options.path.toLowerCase().endsWith('.tiny') ||
            options.path.toLowerCase().endsWith('.txt')));

      if (isMappingOnly) {
        const rawRes = getAgentBytecodeSync({
          javaVersion,
          javaPath: options.javaPath,
          obfuscate: false,
        });
        const tiny = generateObfuscationMappings(rawRes.bytecode);

        let targetPath = options.path
          ? resolve(process.cwd(), options.path)
          : undefined;
        const defaultFileName = 'mappings.txt';

        if (targetPath) {
          if (existsSync(targetPath) && statSync(targetPath).isDirectory()) {
            targetPath = join(targetPath, defaultFileName);
          } else if (targetPath.endsWith('/') || targetPath.endsWith('\\')) {
            mkdirSync(targetPath, { recursive: true });
            targetPath = join(targetPath, defaultFileName);
          }
        } else {
          targetPath = resolve(process.cwd(), defaultFileName);
        }

        const parentDir = dirname(targetPath);
        if (!existsSync(parentDir)) {
          mkdirSync(parentDir, { recursive: true });
        }

        const content = targetPath.endsWith('.tiny')
          ? tiny
          : formatMappingsHumanReadable(tiny);
        writeFileSync(targetPath, content, 'utf8');

        return {
          success: true,
          type: 'mapping',
          path: targetPath,
          size: Buffer.byteLength(content),
          javaVersion,
          obfuscated: true,
          mappingsPath: targetPath,
        };
      }

      let targetPath = options.path
        ? resolve(process.cwd(), options.path)
        : undefined;
      const isClass =
        options.format === 'class' ||
        (targetPath && targetPath.toLowerCase().endsWith('.class'));

      const defaultFileName = isClass
        ? 'Exoproc.class'
        : obfuscate
          ? `njava-agent-java${javaVersion}-obf.jar`
          : `njava-agent-java${javaVersion}.jar`;

      if (targetPath) {
        if (existsSync(targetPath) && statSync(targetPath).isDirectory()) {
          targetPath = join(targetPath, defaultFileName);
        } else if (targetPath.endsWith('/') || targetPath.endsWith('\\')) {
          mkdirSync(targetPath, { recursive: true });
          targetPath = join(targetPath, defaultFileName);
        }
      } else {
        targetPath = resolve(process.cwd(), defaultFileName);
      }

      const parentDir = dirname(targetPath);
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }

      let mappingsPath: string | undefined;

      if (isClass) {
        const res = getAgentBytecodeSync({
          javaVersion,
          javaPath: options.javaPath,
          obfuscate,
        });

        writeFileSync(targetPath, res.bytecode);

        if (options.dumpMappings && res.mappings) {
          const mPath =
            typeof options.dumpMappings === 'string'
              ? resolve(process.cwd(), options.dumpMappings)
              : targetPath.replace(/\.class$/, '') + '-mappings.txt';
          const mParent = dirname(mPath);
          if (!existsSync(mParent)) {
            mkdirSync(mParent, { recursive: true });
          }
          const mContent = mPath.endsWith('.tiny')
            ? res.mappings
            : formatMappingsHumanReadable(res.mappings);
          writeFileSync(mPath, mContent, 'utf8');
          mappingsPath = mPath;
        }

        return {
          success: true,
          type: 'class',
          path: targetPath,
          size: res.bytecode.length,
          javaVersion: res.javaVersion,
          obfuscated: obfuscate,
          className: res.className,
          buildId: res.buildId,
          mappingsPath,
        };
      } else {
        const res = getAgentJarSync({
          javaVersion,
          javaPath: options.javaPath,
          outputPath: targetPath,
          obfuscate,
          force: true,
        });

        if (options.dumpMappings && res.mappings) {
          const mPath =
            typeof options.dumpMappings === 'string'
              ? resolve(process.cwd(), options.dumpMappings)
              : targetPath.replace(/\.jar$/, '') + '-mappings.txt';
          const mParent = dirname(mPath);
          if (!existsSync(mParent)) {
            mkdirSync(mParent, { recursive: true });
          }
          const mContent = mPath.endsWith('.tiny')
            ? res.mappings
            : formatMappingsHumanReadable(res.mappings);
          writeFileSync(mPath, mContent, 'utf8');
          mappingsPath = mPath;
        }

        return {
          success: true,
          type: 'jar',
          path: res.jarPath,
          size: res.jarBuffer.length,
          javaVersion: res.javaVersion,
          classesCount: res.classesCount,
          obfuscated: obfuscate,
          buildId: res.buildId,
          mappingsPath,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        type:
          options.format === 'class'
            ? 'class'
            : options.format === 'mapping'
              ? 'mapping'
              : 'jar',
        path: options.path || '',
        size: 0,
        javaVersion:
          options.javaVersion !== undefined ? Number(options.javaVersion) : 8,
        obfuscated: options.obfuscate ?? true,
        error: err?.message || String(err),
      };
    }
  }
}

export const ExoprocRemoteService = ExoprocService;
export const service = new ExoprocService();
export default service;
