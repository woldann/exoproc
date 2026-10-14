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
    if (isDirectSupported()) {
      const endpoint = client.getDaemonEndpoint();
      if (endpoint.port) {
        const alive = await client.checkDaemonAlive(
          endpoint.host,
          endpoint.port,
        );
        if (alive) return alive;
      }
      const direct = await getDirectClient();
      return {
        alive: true,
        attached: Boolean(direct.pid),
        daemonPid: process.pid,
        pid: direct.pid ?? null,
        targetName: direct.processName ?? null,
        windowTitle: direct.windowTitle ?? null,
        profile: direct.activeProfile?.id ?? 'auto',
        port: 0,
        uptime: 0,
        upgraded: direct.isUpgraded ?? false,
        agentPort: direct.agentPort ?? null,
        nativeSupported: true,
      };
    }
    try {
      const { host, port } = await client.ensureDaemon();
      const status = await client.checkDaemonAlive(host, port);
      if (
        status &&
        ((status as any).buildId !== undefined ||
          (status as any).version !== undefined ||
          (status as any).isStandalone !== undefined)
      ) {
        return {
          alive: true,
          attached: true,
          daemonPid: 0,
          port,
          agentPort: port,
          buildId: (status as any).buildId,
          version: (status as any).version,
          uptime: status.uptime,
          upgraded: true,
          targetName: 'Minecraft (In-Process Java Agent)',
        };
      }
      return status;
    } catch {
      const endpoint = client.getDaemonEndpoint();
      const status = await client.checkDaemonAlive(
        endpoint.host,
        endpoint.port,
      );
      if (status) return status;
      const agentStatus = await client.checkDaemonAlive(
        endpoint.host,
        client.DEFAULT_AGENT_PORT,
      );
      if (agentStatus) {
        return {
          alive: true,
          attached: true,
          daemonPid: 0,
          port: client.DEFAULT_AGENT_PORT,
          agentPort: client.DEFAULT_AGENT_PORT,
          buildId: (agentStatus as any).buildId,
          version: (agentStatus as any).version,
          uptime: agentStatus.uptime,
          upgraded: true,
          targetName: 'Minecraft (In-Process Java Agent)',
        };
      }
      return null;
    }
  }

  async listProcesses(): Promise<client.CandidateProcess[]> {
    if (isDirectSupported()) {
      const endpoint = client.getDaemonEndpoint();
      if (endpoint.port) {
        const alive = await client.checkDaemonAlive(
          endpoint.host,
          endpoint.port,
        );
        if (alive) return await client.listProcessesRemote();
      }
      const direct = await getDirectClient();
      const procs = await direct.listProcesses();
      return procs.map((p: any) => ({
        pid: p.pid,
        name: p.name,
        windowTitle: p.windowTitle,
        isMinecraft: p.isMinecraft,
      }));
    }
    return await client.listProcessesRemote();
  }

  async attach(pid?: number): Promise<{
    success: boolean;
    pid?: number;
    message?: string;
    error?: string;
  }> {
    if (isDirectSupported()) {
      const endpoint = client.getDaemonEndpoint();
      if (endpoint.port) {
        const alive = await client.checkDaemonAlive(
          endpoint.host,
          endpoint.port,
        );
        if (alive) return await client.attachRemote({ pid });
      }
      try {
        const direct = await getDirectClient();
        const procs = await direct.listProcesses();
        const target = pid
          ? procs.find((p: any) => p.pid === pid)
          : procs.find((p: any) => p.isMinecraft || p.isJava);
        if (!target) {
          return { success: false, error: 'Target process not found' };
        }
        await direct.connect(target.pid);
        return {
          success: true,
          pid: target.pid,
          message: `Attached directly to ${target.name} (PID: ${target.pid})`,
        };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }
    return await client.attachRemote({ pid });
  }

  async detach(): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    if (isDirectSupported()) {
      const endpoint = client.getDaemonEndpoint();
      if (endpoint.port) {
        const alive = await client.checkDaemonAlive(
          endpoint.host,
          endpoint.port,
        );
        if (alive) return await client.detachRemote();
      }
      const direct = await getDirectClient();
      await direct.disconnect();
      return {
        success: true,
        message: 'Detached directly from target process',
      };
    }
    return await client.detachRemote();
  }

  async shutdown(): Promise<{ success: boolean; message?: string }> {
    if (isDirectSupported()) {
      const endpoint = client.getDaemonEndpoint();
      if (endpoint.port) {
        const alive = await client.checkDaemonAlive(
          endpoint.host,
          endpoint.port,
        );
        if (alive) return await client.shutdownRemote();
      }
      const direct = await getDirectClient();
      await direct.disconnect();
      return { success: true, message: 'Direct session reset' };
    }
    return await client.shutdownRemote();
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
    className?: string;
    upgraded?: boolean;
    error?: string;
  }> {
    return await client.upgradeRemote(options);
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
