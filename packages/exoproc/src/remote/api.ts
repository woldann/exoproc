import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import {
  evalRemote,
  loadScript,
  getAgentMappingPool,
  ensureMinecraft,
  ensureDaemon,
  getTargetMode,
  type ScreenshotRemoteResult,
} from './client.js';
import { resolveSimpleScreenName } from './gui-navigator.js';

export interface ButtonInfo {
  id: number;
  text: string;
  enabled: boolean;
  visible: boolean;
  x: number;
  y: number;
  realClass?: string;
}

export interface PoolField {
  originalName: string;
  realName: string;
  typeName: string;
  isStatic?: boolean;
}

export interface PoolMethod {
  originalName: string;
  realName: string;
  returnType: string;
  paramTypes: string[];
  isStatic?: boolean;
}

export interface PoolDetails {
  canonicalKey: string;
  canonicalClassName: string;
  realClassName: string;
  superclassName: string;
  fields: PoolField[];
  methods: PoolMethod[];
}

export interface GuiInfo {
  hasScreen: boolean;
  screenName: string;
  simpleName?: string;
  canonicalClass: string;
  realClassName: string;
  superclassName: string;
  inGame: boolean;
  playerLoaded: boolean;
  playerCoords?: { x: number; y: number; z: number };
  buttons: ButtonInfo[];
  poolDetails?: PoolDetails | null;
}

export interface ClickResult {
  success: boolean;
  id?: number;
  text?: string;
  error?: string;
}

export interface PlayerInfo {
  inGame: boolean;
  screenName?: string;
  coords?: { x: number; y: number; z: number };
  x?: number;
  y?: number;
  z?: number;
  rotation?: { yaw: number; pitch: number };
  yaw?: number;
  pitch?: number;
  onGround?: boolean;
  health?: number;
  air?: number;
  flying?: boolean;
  allowFly?: boolean;
  creative?: boolean;
  fallDistance?: number;
  sprinting?: boolean;
  sneaking?: boolean;
}

export interface WorldInfo {
  inGame: boolean;
  screenName?: string;
  loadedEntities?: number;
  entityCount?: number;
  playersOnline?: number;
  isRemote?: boolean;
  worldTime?: number;
  isRaining?: boolean;
  dimensionId?: number;
  serverBrand?: string;
}

export interface DbSummaryItem {
  canonicalKey: string;
  canonicalClassName: string;
  superclass: string;
  fieldCount: number;
  methodCount: number;
}

export interface DbMatchItem {
  canonicalKey: string;
  canonicalClassName: string;
  superclass: string;
  fields: Array<{ name: string; type: string }>;
  methods: Array<{
    name: string;
    params: string[];
    returnType: string;
    isStatic: boolean;
  }>;
}

export interface PoolSummaryItem {
  realClassName: string;
  canonicalKey: string;
  canonicalClassName: string;
  superclassName: string;
  fieldCount: number;
  methodCount: number;
}

export interface PoolMatchItem {
  canonicalKey: string;
  canonicalClassName: string;
  simpleName: string;
  realClassName: string;
  superclassName: string;
  fields: Array<{
    originalName: string;
    realName: string;
    typeName: string;
    isStatic: boolean;
  }>;
  methods: Array<{
    originalName: string;
    realName: string;
    returnType: string;
    paramTypes: string[];
    isStatic: boolean;
  }>;
}

/**
 * Inspect active Minecraft screen, buttons, and reflection pool metadata.
 */
export async function inspectGui(options?: {
  includePool?: boolean;
}): Promise<GuiInfo> {
  const code = loadScript('inspect-gui');
  const resp = await evalRemote(code);
  if (!resp.success) {
    throw new Error(resp.error || 'Failed to inspect Minecraft GUI');
  }

  let hasScreen = false;
  let screenName = 'None';
  let canonicalClass = '';
  let realClassName = '';
  let superclassName = '';
  let inGame = false;
  let playerLoaded = false;
  let playerCoords: { x: number; y: number; z: number } | undefined;
  const buttons: ButtonInfo[] = [];

  for (const log of resp.logs) {
    if (log.startsWith('RESULT:PLAYER|')) {
      const parts = log.split('|');
      playerLoaded = parts[1] === 'true';
      if (playerLoaded) {
        inGame = true;
        playerCoords = {
          x: parseFloat(parts[2] || '0'),
          y: parseFloat(parts[3] || '0'),
          z: parseFloat(parts[4] || '0'),
        };
      }
    } else if (log === 'RESULT:NO_SCREEN') {
      hasScreen = false;
      screenName = 'None';
      inGame = true;
    } else if (log.startsWith('RESULT:SCREEN|')) {
      hasScreen = true;
      const parts = log.split('|');
      screenName = parts[1] || '';
      canonicalClass = parts[2] || '';
      realClassName = parts[3] || '';
      superclassName = parts[4] || '';
      inGame =
        screenName.toLowerCase().includes('hud') ||
        screenName.toLowerCase().includes('none');
    } else if (log.startsWith('RESULT:BTN|')) {
      const parts = log.split('|');
      let btnText = parts[2] || '';
      const realClass = parts[7] || '';
      if (!btnText && realClass) {
        if (
          realClass === 'avz' ||
          realClass.includes('GuiButtonLanguage') ||
          realClass.includes('Language')
        ) {
          btnText = 'Language...';
        } else if (
          realClass === 'awc' ||
          realClass.includes('GuiLockIconButton') ||
          realClass.includes('Lock')
        ) {
          btnText = 'Lock';
        }
      }
      buttons.push({
        id: parseInt(parts[1] || '0', 10),
        text: btnText,
        enabled: parts[3] === 'true',
        visible: parts[4] === 'true',
        x: parseInt(parts[5] || '0', 10),
        y: parseInt(parts[6] || '0', 10),
        realClass: realClass || undefined,
      });
    }
  }

  // Deep reflection metadata query
  let poolDetails: PoolDetails | null = null;
  const shouldQueryPool = options?.includePool !== false;
  const targetLookup = canonicalClass || screenName;

  if (
    shouldQueryPool &&
    targetLookup &&
    !targetLookup.includes('None') &&
    !targetLookup.includes('HUD')
  ) {
    try {
      const poolScript = loadScript('inspect-pool');
      const poolCode =
        `var TARGET_CLASS = ${JSON.stringify(targetLookup)};\n` + poolScript;
      const poolResp = await evalRemote(poolCode);
      if (poolResp.success) {
        for (const line of poolResp.logs) {
          if (line.startsWith('RESULT:POOL_MATCH|')) {
            poolDetails = JSON.parse(
              line.substring('RESULT:POOL_MATCH|'.length),
            );
            if (poolDetails?.realClassName) {
              realClassName = poolDetails.realClassName;
            }
            if (poolDetails?.superclassName) {
              superclassName = poolDetails.superclassName;
            }
            break;
          }
        }
      }
    } catch {}
  }

  const simpleName = resolveSimpleScreenName({
    screenName,
    canonicalClass,
    realClassName,
    playerLoaded,
    buttons,
  });

  return {
    hasScreen,
    screenName,
    simpleName,
    canonicalClass,
    realClassName,
    superclassName,
    inGame,
    playerLoaded,
    playerCoords,
    buttons,
    poolDetails,
  };
}

/**
 * Click a GUI button by its ID or text label.
 */
export async function clickButton(
  target: string | number | { index?: number; id?: number; text?: string },
): Promise<ClickResult> {
  const clickScript = loadScript('click-button');
  const code = `var TARGET_BUTTON = ${JSON.stringify(target)};\n` + clickScript;
  const resp = await evalRemote(code);
  if (!resp.success) {
    return { success: false, error: resp.error || 'Click evaluation failed' };
  }

  for (const log of resp.logs) {
    if (log.startsWith('RESULT:CLICK|')) {
      try {
        const jsonStr = log.substring('RESULT:CLICK|'.length);
        const data = JSON.parse(jsonStr);
        const id =
          typeof data.id === 'number'
            ? data.id
            : (data.clickedButton?.id ?? data.button?.id);
        const text =
          data.text ?? data.clickedButton?.text ?? data.button?.displayString;
        return { success: true, id, text, ...data };
      } catch {}
    }
  }

  return { success: false, error: 'No response received from click executor' };
}

/**
 * Close the current active GUI screen (return to game).
 */
export async function closeScreen(): Promise<{
  success: boolean;
  error?: string;
}> {
  const closeScript = loadScript('close-screen');
  const resp = await evalRemote(closeScript);
  if (!resp.success) {
    return { success: false, error: resp.error || 'Failed to close screen' };
  }
  return { success: true };
}

/**
 * Resume gameplay by clicking "Back to Game", closing the active pause screen,
 * or returning to game world.
 */
export async function resumeGame(): Promise<{
  success: boolean;
  inGame: boolean;
  screenName?: string;
  error?: string;
}> {
  try {
    const state = await inspectGui({ includePool: false });
    if (
      state.playerLoaded &&
      (!state.hasScreen || state.screenName === 'None')
    ) {
      return { success: true, inGame: true, screenName: state.screenName };
    }

    if (
      state.screenName === 'GuiIngameMenu' ||
      (state.playerLoaded && state.hasScreen)
    ) {
      const backBtn = state.buttons.find(
        (b) =>
          b.id === 4 ||
          b.id === 0 ||
          b.text.toLowerCase().includes('back to game') ||
          b.text.toLowerCase().includes('oyuna dön'),
      );
      if (backBtn) {
        await clickButton(backBtn.id);
      } else {
        await closeScreen();
      }
    } else {
      await closeScreen();
    }

    const nextState = await inspectGui({ includePool: false });
    return {
      success: true,
      inGame: Boolean(
        nextState.playerLoaded &&
        (!nextState.hasScreen || nextState.screenName === 'None'),
      ),
      screenName: nextState.screenName,
    };
  } catch (err: any) {
    return {
      success: false,
      inGame: false,
      error: err?.message || String(err),
    };
  }
}

/**
 * Autonomous game navigator: handles full state transitions from Main Menu,
 * Select World, or Pause Menu into active gameplay.
 */
export async function autoNavigateWorld(
  onProgress?: (msg: string) => void,
): Promise<{
  success: boolean;
  message?: string;
  coords?: { x: number; y: number; z: number };
  error?: string;
}> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  onProgress?.('Checking Minecraft state...');
  const initial = await inspectGui({ includePool: false });

  if (
    initial.playerLoaded &&
    (!initial.hasScreen ||
      initial.screenName === 'None' ||
      initial.screenName.includes('HUD'))
  ) {
    const msg = `Already inside game world! Player at (${initial.playerCoords?.x?.toFixed(1) ?? '?'}, ${initial.playerCoords?.y?.toFixed(1) ?? '?'}, ${initial.playerCoords?.z?.toFixed(1) ?? '?'})`;
    onProgress?.(msg);
    return { success: true, message: msg, coords: initial.playerCoords };
  }

  for (let attempt = 0; attempt < 25; attempt++) {
    const current = await inspectGui({ includePool: false });

    if (
      current.playerLoaded &&
      (!current.hasScreen ||
        current.screenName === 'None' ||
        current.screenName.includes('HUD'))
    ) {
      const msg = `Entered game world! Player at (${current.playerCoords?.x?.toFixed(1) ?? '?'}, ${current.playerCoords?.y?.toFixed(1) ?? '?'}, ${current.playerCoords?.z?.toFixed(1) ?? '?'})`;
      onProgress?.(msg);
      return { success: true, message: msg, coords: current.playerCoords };
    }

    if (
      current.screenName === 'GuiGameOver' ||
      current.screenName === 'axe' ||
      current.buttons.some((b) => b.text.toLowerCase().includes('respawn'))
    ) {
      onProgress?.('Death screen detected. Clicking Respawn...');
      const respawnBtn = current.buttons.find(
        (b) => b.id === 0 || b.text.toLowerCase().includes('respawn'),
      );
      if (respawnBtn) {
        await clickButton(respawnBtn.id);
      }
      await sleep(1000);
      continue;
    }

    if (
      current.screenName === 'GuiIngameMenu' ||
      (current.playerLoaded && current.hasScreen)
    ) {
      onProgress?.('In-Game Menu open. Unpausing...');
      const backBtn = current.buttons.find(
        (b) =>
          b.id === 4 ||
          b.text.toLowerCase().includes('back to game') ||
          b.text.toLowerCase().includes('oyuna dön'),
      );
      if (backBtn) {
        await clickButton(backBtn.id);
      } else {
        await closeScreen();
      }
      await sleep(800);
      continue;
    }

    if (current.screenName === 'GuiMainMenu') {
      onProgress?.('At Main Menu: Clicking Singleplayer (Button 1)...');
      await clickButton(1);
      await sleep(1000);
      continue;
    }

    if (current.screenName === 'GuiSelectWorld') {
      const playBtn = current.buttons.find(
        (b) => b.id === 1 && b.text.toLowerCase().includes('play'),
      );
      if (playBtn && playBtn.enabled) {
        onProgress?.('Clicking Play Selected World (Button 1)...');
        await clickButton(1);
      } else {
        const createBtn = current.buttons.find(
          (b) => b.id === 3 || b.text.toLowerCase().includes('create'),
        );
        if (createBtn) {
          onProgress?.('Clicking Create New World (Button 3)...');
          await clickButton(createBtn.id);
        } else {
          await clickButton(0);
        }
      }
      await sleep(1500);
      continue;
    }

    if (current.screenName === 'GuiCreateWorld') {
      onProgress?.('At Create World: Triggering world creation (Button 0)...');
      await clickButton(0);
      onProgress?.('Generating terrain & waiting for player spawn...');
      for (let w = 0; w < 35; w++) {
        await sleep(1000);
        const check = await inspectGui({ includePool: false });
        if (
          check.playerLoaded &&
          (!check.hasScreen ||
            check.screenName === 'None' ||
            check.screenName.includes('HUD'))
        ) {
          const msg = `World created! Player spawned at (${check.playerCoords?.x?.toFixed(1) ?? '?'}, ${check.playerCoords?.y?.toFixed(1) ?? '?'}, ${check.playerCoords?.z?.toFixed(1) ?? '?'})`;
          onProgress?.(msg);
          return { success: true, message: msg, coords: check.playerCoords };
        }
      }
      continue;
    }

    onProgress?.(`Closing active screen ${current.screenName}...`);
    await closeScreen();
    await sleep(1000);
  }

  return {
    success: false,
    error: 'Navigation timed out before entering game world.',
  };
}

/**
 * Inspect active player entity state in world.
 */
export async function inspectPlayer(): Promise<PlayerInfo> {
  const code = loadScript('inspect-player');
  const resp = await evalRemote(code);
  if (!resp.success) {
    throw new Error(resp.error || 'Failed to inspect player');
  }

  for (const log of resp.logs) {
    if (log.startsWith('NOT_IN_WORLD|')) {
      const [, screenName] = log.split('|');
      return { inGame: false, screenName };
    }
    if (log.startsWith('PLAYER|')) {
      const [
        ,
        x,
        y,
        z,
        yaw,
        pitch,
        onGround,
        health,
        air,
        flying,
        creative,
        allowFly,
      ] = log.split('|');
      const posX = parseFloat(x || '0');
      const posY = parseFloat(y || '0');
      const posZ = parseFloat(z || '0');
      const rotYaw = parseFloat(yaw || '0');
      const rotPitch = parseFloat(pitch || '0');

      return {
        inGame: true,
        coords: {
          x: posX,
          y: posY,
          z: posZ,
        },
        x: posX,
        y: posY,
        z: posZ,
        rotation: {
          yaw: rotYaw,
          pitch: rotPitch,
        },
        yaw: rotYaw,
        pitch: rotPitch,
        onGround: onGround === 'true',
        health:
          health && health !== 'N/A' && !isNaN(parseFloat(health))
            ? parseFloat(health)
            : undefined,
        air:
          air && air !== 'N/A' && !isNaN(parseInt(air, 10))
            ? parseInt(air, 10)
            : undefined,
        flying: flying === 'true',
        creative: creative === 'true',
        allowFly: allowFly === 'true',
      };
    }
  }

  return { inGame: false };
}

/**
 * Inspect active Minecraft world status.
 */
export async function inspectWorld(): Promise<WorldInfo> {
  const code = loadScript('inspect-world');
  const resp = await evalRemote(code);
  if (!resp.success) {
    throw new Error(resp.error || 'Failed to inspect world');
  }

  for (const log of resp.logs) {
    if (log.startsWith('NOT_IN_WORLD|')) {
      const [, screenName] = log.split('|');
      return { inGame: false, screenName };
    }
    if (log.startsWith('WORLD|')) {
      const [, entities, players, isRemote, time, raining] = log.split('|');
      return {
        inGame: true,
        loadedEntities: parseInt(entities || '0', 10),
        playersOnline: parseInt(players || '0', 10),
        isRemote: isRemote === 'true',
        worldTime: parseInt(time || '0', 10),
        isRaining: raining === 'true',
      };
    }
  }

  return { inGame: false };
}

/**
 * Query dynamic matcher pool status or single class details.
 */
export async function inspectPool(target?: string): Promise<{
  isSingle: boolean;
  match?: PoolMatchItem | null;
  list?: PoolSummaryItem[] | null;
}> {
  const script = loadScript('inspect-pool');
  const code =
    (target ? `var TARGET_CLASS = ${JSON.stringify(target)};\n` : '') + script;
  const resp = await evalRemote(code);
  if (!resp.success) {
    throw new Error(resp.error || 'Failed to inspect pool');
  }

  let isSingle = Boolean(target);
  let match: PoolMatchItem | null = null;
  let list: PoolSummaryItem[] | null = null;

  for (const log of resp.logs) {
    if (log.startsWith('RESULT:POOL_LIST|')) {
      isSingle = false;
      list = JSON.parse(log.substring('RESULT:POOL_LIST|'.length));
    } else if (log.startsWith('RESULT:POOL_MATCH|')) {
      isSingle = true;
      match = JSON.parse(log.substring('RESULT:POOL_MATCH|'.length));
    }
  }

  return { isSingle, match, list };
}

/**
 * Query canonical schema database or single schema definition.
 */
export async function inspectDatabase(target?: string): Promise<{
  isSingle: boolean;
  match?: DbMatchItem | null;
  list?: DbSummaryItem[] | null;
}> {
  const script = loadScript('inspect-database');
  const code =
    (target ? `var TARGET_CLASS = ${JSON.stringify(target)};\n` : '') + script;
  const resp = await evalRemote(code);
  if (!resp.success) {
    throw new Error(resp.error || 'Failed to inspect database');
  }

  let isSingle = Boolean(target);
  let match: DbMatchItem | null = null;
  let list: DbSummaryItem[] | null = null;

  for (const log of resp.logs) {
    if (log.startsWith('RESULT:DB_LIST|')) {
      isSingle = false;
      list = JSON.parse(log.substring('RESULT:DB_LIST|'.length));
    } else if (log.startsWith('RESULT:DB_MATCH|')) {
      isSingle = true;
      match = JSON.parse(log.substring('RESULT:DB_MATCH|'.length));
    }
  }

  return { isSingle, match, list };
}

/**
 * Perform a single consolidated snapshot of GUI, player, and world state.
 * Minimizes roundtrips and avoids queuing overhead on the daemon.
 */
export async function inspectState(): Promise<{
  gui: GuiInfo;
  player: PlayerInfo;
  world: WorldInfo;
}> {
  const [gui, player, world] = await Promise.all([
    inspectGui().catch(
      (err) =>
        ({
          hasScreen: false,
          screenName: 'None',
          buttons: [],
          error: err?.message,
        }) as any,
    ),
    inspectPlayer().catch(
      (err) =>
        ({
          inGame: false,
          error: err?.message,
        }) as any,
    ),
    inspectWorld().catch(
      (err) =>
        ({
          inGame: false,
          error: err?.message,
        }) as any,
    ),
  ]);

  return { gui, player, world };
}

export interface JavaInfo {
  version: string;
  vendor?: string;
  home?: string;
  vmName?: string;
  vmVersion?: string;
  osName?: string;
  osArch?: string;
  osVersion?: string;
  classpath: string[];
  classpathCount: number;
  memory?: {
    totalMb?: number;
    freeMb?: number;
    maxMb?: number;
    usedMb?: number;
  };
}

/**
 * Inspect Java runtime environment, JVM properties, and classpath.
 */
export async function inspectJava(): Promise<JavaInfo> {
  const code = loadScript('inspect-java');
  const resp = await evalRemote(code, undefined, 10000);
  if (!resp.success) {
    throw new Error(resp.error || 'Failed to inspect Java runtime');
  }

  for (const log of resp.logs) {
    if (log.startsWith('RESULT:JAVA|')) {
      return JSON.parse(log.substring('RESULT:JAVA|'.length));
    }
    if (log.startsWith('RESULT:JAVA_ERROR|')) {
      throw new Error(log.substring('RESULT:JAVA_ERROR|'.length));
    }
  }

  throw new Error('No Java runtime inspection data returned from daemon');
}

export interface ExportMappingsResult {
  success: boolean;
  profile: string;
  generatedAt: string;
  source: 'live_pool' | 'static_fallback';
  stats: {
    totalClasses: number;
    matchedClasses: number;
    unmatchedClasses: number;
    totalFields: number;
    matchedFields: number;
    unmatchedFields: number;
    totalMethods: number;
    matchedMethods: number;
    unmatchedMethods: number;
  };
  savedPaths: string[];
  data: any;
  error?: string;
}

function findDatabaseTemplate(): string | null {
  const possiblePaths = [
    resolve(process.cwd(), 'packages/njava-agent/resources/database.json'),
    resolve(process.cwd(), 'packages/minecraft/src/mappings/database.json'),
    resolve(import.meta.dirname, '../../njava-agent/resources/database.json'),
    resolve(import.meta.dirname, '../../minecraft/src/mappings/database.json'),
    resolve(
      import.meta.dirname,
      '../../../packages/njava-agent/resources/database.json',
    ),
    resolve(
      import.meta.dirname,
      '../../../packages/minecraft/src/mappings/database.json',
    ),
  ];
  const envDb =
    process.env.EXOPROC_DATABASE_FILE ||
    process.env.EXOPROC_DATABASE_PATH ||
    process.env.EXOPROC_DATABASE ||
    process.env.DATABASE_FILE;
  if (envDb && existsSync(envDb)) {
    try {
      return readFileSync(envDb, 'utf8');
    } catch {}
  }
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      try {
        return readFileSync(p, 'utf8');
      } catch {}
    }
  }
  return null;
}

function findExistingMappings(profile: string): any {
  const envMap =
    process.env.EXOPROC_MAPPINGS_FILE ||
    process.env.EXOPROC_MAPPINGS_PATH ||
    process.env.EXOPROC_MAPPINGS ||
    process.env.MAPPINGS_FILE;
  if (envMap && existsSync(envMap)) {
    try {
      return JSON.parse(readFileSync(envMap, 'utf8'));
    } catch {}
  }
  const possiblePaths = [
    resolve(
      process.cwd(),
      `packages/njava-agent/resources/mappings-${profile}.json`,
    ),
    resolve(
      process.cwd(),
      `packages/minecraft/src/mappings/mappings-${profile}.json`,
    ),
    resolve(
      import.meta.dirname,
      `../../njava-agent/resources/mappings-${profile}.json`,
    ),
    resolve(
      import.meta.dirname,
      `../../minecraft/src/mappings/mappings-${profile}.json`,
    ),
    resolve(
      import.meta.dirname,
      `../../../packages/njava-agent/resources/mappings-${profile}.json`,
    ),
    resolve(
      import.meta.dirname,
      `../../../packages/minecraft/src/mappings/mappings-${profile}.json`,
    ),
  ];
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, 'utf8'));
      } catch {}
    }
  }
  return null;
}

function findOutputTargetPaths(profile: string): string[] {
  const targets: string[] = [];
  const envMap =
    process.env.EXOPROC_MAPPINGS_FILE ||
    process.env.EXOPROC_MAPPINGS_PATH ||
    process.env.EXOPROC_MAPPINGS ||
    process.env.MAPPINGS_FILE;
  if (envMap) {
    const absEnvMap = resolve(process.cwd(), envMap);
    targets.push(absEnvMap);
  }
  const candidates = [
    resolve(
      process.cwd(),
      `packages/njava-agent/resources/mappings-${profile}.json`,
    ),
    resolve(
      process.cwd(),
      `packages/minecraft/src/mappings/mappings-${profile}.json`,
    ),
    resolve(
      import.meta.dirname,
      `../../njava-agent/resources/mappings-${profile}.json`,
    ),
    resolve(
      import.meta.dirname,
      `../../minecraft/src/mappings/mappings-${profile}.json`,
    ),
    resolve(
      import.meta.dirname,
      `../../../packages/njava-agent/resources/mappings-${profile}.json`,
    ),
    resolve(
      import.meta.dirname,
      `../../../packages/minecraft/src/mappings/mappings-${profile}.json`,
    ),
  ];
  for (const cand of candidates) {
    const parentDir = dirname(cand);
    if (existsSync(parentDir) && !targets.includes(cand)) {
      targets.push(cand);
    }
  }
  return targets;
}

const BASELINE_1_8_9_CLASSES: Record<string, string> = {
  Minecraft: 'ave',
  GuiScreen: 'axu',
  GuiButton: 'avs',
  GuiMainMenu: 'aya',
  GuiMultiplayer: 'azh',
  GuiOptions: 'axn',
  GuiSelectWorld: 'axv',
  GuiCreateWorld: 'axb',
  GuiScreenServerList: 'axg',
  GuiScreenAddServer: 'axi',
  GuiIngameMenu: 'axp',
  GuiConnecting: 'awz',
  GuiDisconnected: 'axh',
  GuiChat: 'awv',
  GuiContainer: 'ayl',
  GuiInventory: 'azc',
  GuiContainerCreative: 'ayu',
  GuiScreenOptionsSounds: 'axz',
  GuiVideoSettings: 'ayb',
  GuiControls: 'aye',
  GuiLanguage: 'ayi',
  GuiScreenChatOptions: 'axq',
  GuiScreenResourcePacks: 'ayr',
  GuiScreenSnooper: 'ayd',
  GuiCustomizeSkin: 'axx',
  GuiGameOver: 'axe',
  GuiShareToLan: 'aym',
  GuiAchievements: 'ayw',
  GuiStats: 'ayx',
  EntityPlayerSP: 'bew',
  EntityPlayer: 'wn',
  EntityLivingBase: 'pr',
  Entity: 'pk',
  WorldClient: 'bdb',
  World: 'adm',
  PlayerControllerMP: 'bda',
  GameSettings: 'avh',
  KeyBinding: 'avb',
  InventoryPlayer: 'wm',
  ItemStack: 'zx',
  Item: 'zw',
  Block: 'afh',
  IBlockState: 'alz',
  BlockPos: 'cj',
  Vec3: 'aui',
  AxisAlignedBB: 'aug',
  MovingObjectPosition: 'auh',
  Timer: 'avl',
  RenderManager: 'biu',
  EntityRenderer: 'bfk',
  Session: 'avm',
  PlayerCapabilities: 'wl',
  NBTTagCompound: 'dn',
  MovementInput: 'bev',
  FoodStats: 'xm',
};

const BASELINE_1_8_9_FIELDS: Record<string, Record<string, string>> = {
  Minecraft: {
    theMinecraft: 'S',
    thePlayer: 'h',
    theWorld: 'f',
    gameSettings: 't',
    playerController: 'c',
    currentScreen: 'm',
    fontRendererObj: 'k',
    renderGlobal: 'g',
    entityRenderer: 'o',
    renderManager: 'aa',
    objectMouseOver: 's',
    timer: 'Y',
    session: 'ae',
    inGameHasFocus: 'w',
    leftClickCounter: 'ag',
  },
  GuiScreen: {
    buttonList: 'n',
    labelList: 'o',
    mc: 'j',
    itemRender: 'k',
    width: 'l',
    height: 'm',
    allowUserInput: 'p',
  },
  GuiButton: {
    id: 'k',
    xPosition: 'h',
    yPosition: 'i',
    width: 'f',
    height: 'g',
    displayString: 'j',
    enabled: 'l',
    visible: 'm',
    hovered: 'n',
  },
  GuiMainMenu: {
    buttonResetDemo: 'w',
    splashText: 'r',
  },
  GuiMultiplayer: {
    parentScreen: 'a',
    btnSelectServer: 'g',
    btnEditServer: 'h',
    btnDeleteServer: 'i',
  },
  GuiOptions: {
    parentScreen: 'a',
    gameSettings: 'g',
  },
  GuiSelectWorld: {
    parentScreen: 'a',
  },
  GuiCreateWorld: {
    parentScreen: 'a',
  },
  GuiScreenServerList: {
    parentScreen: 'a',
  },
  GuiScreenAddServer: {
    parentScreen: 'a',
  },
  GuiConnecting: {
    previousGuiScreen: 'a',
  },
  GuiDisconnected: {
    parentScreen: 'a',
  },
  GuiChat: {
    defaultInputFieldText: 'a',
  },
  GuiContainer: {
    inventorySlots: 'h',
    guiLeft: 'i',
    guiTop: 'r',
    xSize: 'f',
    ySize: 'g',
  },
  GuiInventory: {
    oldMouseX: 'u',
    oldMouseY: 'v',
  },
  EntityPlayerSP: {
    movementInput: 'b',
    sendQueue: 'a',
  },
  EntityPlayer: {
    inventory: 'bi',
    inventoryContainer: 'bk',
    openContainer: 'bj',
    capabilities: 'bA',
    foodStats: 'bL',
    experienceLevel: 'bB',
    experienceTotal: 'bC',
    experience: 'bD',
  },
  EntityLivingBase: {
    renderYawOffset: 'aI',
    rotationYawHead: 'aK',
    prevRotationYawHead: 'aL',
    jumpMovementFactor: 'aM',
    hurtTime: 'ay',
    maxHurtTime: 'az',
    attackedAtYaw: 'aA',
    deathTime: 'aC',
    moveStrafing: 'aZ',
    moveForward: 'ba',
    isJumping: 'aY',
    health: 'ba',
    maxHealth: 'aM',
  },
  Entity: {
    entityId: 'c',
    posX: 's',
    posY: 't',
    posZ: 'u',
    motionX: 'v',
    motionY: 'w',
    motionZ: 'x',
    rotationYaw: 'y',
    rotationPitch: 'z',
    prevRotationYaw: 'A',
    prevRotationPitch: 'B',
    boundingBox: 'a',
    onGround: 'C',
    isCollidedHorizontally: 'D',
    isCollidedVertically: 'E',
    isCollided: 'F',
    velocityChanged: 'G',
    fallDistance: 'O',
    isDead: 'I',
    width: 'J',
    height: 'K',
    ticksExisted: 'W',
    stepHeight: 'S',
    noClip: 'T',
    worldObj: 'o',
  },
  WorldClient: {
    sendQueue: 'a',
    loadedEntityList: 'f',
    playerEntities: 'j',
  },
  World: {
    loadedEntityList: 'f',
    playerEntities: 'j',
    loadedTileEntityList: 's',
    provider: 't',
  },
  PlayerControllerMP: {
    curBlockDamageMP: 'e',
    blockHitDelay: 'f',
    isHittingBlock: 'g',
    currentGameType: 'h',
  },
  GameSettings: {
    keyBindForward: 'ad',
    keyBindLeft: 'ae',
    keyBindBack: 'af',
    keyBindRight: 'ag',
    keyBindJump: 'ah',
    keyBindSneak: 'ai',
    keyBindSprint: 'aj',
    keyBindAttack: 'ak',
    keyBindUseItem: 'al',
    pauseOnLostFocus: 'z',
    mouseSensitivity: 'a',
    fovSetting: 'aI',
    gammaSetting: 'aJ',
  },
  KeyBinding: {
    keyDescription: 'd',
    keyCode: 'g',
    pressed: 'h',
    pressTime: 'i',
  },
};

const BASELINE_1_8_9_METHODS: Record<string, Record<string, string>> = {
  Minecraft: {
    getMinecraft: 'A',
    runTick: 's',
    clickMouse: 'aw',
    rightClickMouse: 'ax',
    displayGuiScreen: 'a',
    setIngameFocus: 'p',
    shutdown: 'd',
    addScheduledTask: 'a',
  },
  GuiScreen: {
    actionPerformed: 'a',
    drawScreen: 'a',
    mouseClicked: 'a',
    keyTyped: 'a',
    initGui: 'b',
    onGuiClosed: 'm',
    doesGuiPauseGame: 'd',
  },
  GuiButton: {
    drawButton: 'a',
    mousePressed: 'c',
    mouseReleased: 'a',
  },
  GuiMainMenu: {
    initGui: 'b',
    actionPerformed: 'a',
    drawScreen: 'a',
  },
  GuiMultiplayer: {
    initGui: 'b',
    actionPerformed: 'a',
    drawScreen: 'a',
  },
  GuiOptions: {
    initGui: 'b',
    actionPerformed: 'a',
    drawScreen: 'a',
  },
  GuiSelectWorld: {
    initGui: 'b',
    actionPerformed: 'a',
    drawScreen: 'a',
  },
  EntityPlayerSP: {
    sendChatMessage: 'e',
    swingItem: 'bw',
    respawnPlayer: 'n',
    closeScreen: 'p',
  },
  EntityLivingBase: {
    getHealth: 'bn',
    setHealth: 'i',
    getMaxHealth: 'bu',
    getHeldItem: 'bA',
    getEquipmentInSlot: 'p',
    swingItem: 'bv',
  },
  Entity: {
    getEntityId: 'F',
    getName: 'e_',
    getUniqueID: 'aK',
    isSneaking: 'av',
    setSneaking: 'c',
    isSprinting: 'aw',
    setSprinting: 'd',
    isInWater: 'V',
    setPosition: 'b',
  },
  WorldClient: {
    getWorldTime: 'K',
    isRaining: 'L',
    sendQuittingDisconnectingPacket: 'a',
  },
};

/**
 * Exports detailed mappings ({profile}.json) by merging the canonical database template
 * with the active in-game reflection pool and matcher detector.
 */
export async function exportMappings(
  profileInput?: string,
  options?: {
    outPath?: string;
    silent?: boolean;
    crawlGuis?: boolean;
    minecraft?: boolean;
    targets?: string[];
    onProgress?: (msg: string) => void;
  },
): Promise<ExportMappingsResult> {
  const profile = profileInput ? profileInput.trim() : '1.8.9';

  // 0. If Minecraft mode requested, ensure Minecraft client mappings are initialized into pool
  if (options?.minecraft) {
    options?.onProgress?.(
      '[Export Mappings] Initializing Minecraft reflection matcher...',
    );
    try {
      const { host, port } = await ensureDaemon();
      const mode = await getTargetMode(host, port);
      await ensureMinecraft(host, port, {
        force: true,
        noPreMappings: mode === 'agent',
      });
    } catch {}
  }

  const templateStr = findDatabaseTemplate();
  let exportData: any = null;
  let initialSnapshot: any = null;
  let source: 'live_pool' | 'static_fallback' = 'live_pool';

  // Helper to query live mappings export script from JVM
  const queryLiveExport = async (): Promise<any | null> => {
    try {
      const { host, port } = await ensureDaemon();
      const mode = await getTargetMode(host, port);
      const script = loadScript('export-mappings');
      // When on agent, do not preload static existing mappings so reflection matcher & crawler discover live
      const existing = mode === 'agent' ? null : findExistingMappings(profile);
      const code =
        `var TARGET_PROFILE = ${JSON.stringify(profile)};\n` +
        `var TARGET_TEMPLATE_JSON = ${JSON.stringify(templateStr || '')};\n` +
        `var TARGET_MAPPINGS_JSON = ${JSON.stringify(existing ? JSON.stringify(existing) : '')};\n` +
        script;

      const resp = await evalRemote(code, undefined, 120000, {
        minecraft: options?.minecraft ?? true,
        noPreMappings: mode === 'agent',
      });
      if (resp.success) {
        for (const line of resp.logs) {
          if (line.startsWith('RESULT:MAPPINGS_EXPORT|')) {
            return JSON.parse(line.substring('RESULT:MAPPINGS_EXPORT|'.length));
          }
        }
      } else {
        options?.onProgress?.(
          `[Export Mappings] queryLiveExport eval error: ${resp.error}`,
        );
      }
    } catch (_e: any) {
      options?.onProgress?.(
        `[Export Mappings] queryLiveExport exception: ${_e?.message || _e}`,
      );
    }
    return null;
  };

  // 1. Step 1: Query initial snapshot from JVM reflection pool
  options?.onProgress?.(
    '[Export Mappings] Step 1: Taking initial reflection pool snapshot...',
  );
  initialSnapshot = await queryLiveExport();
  if (initialSnapshot) {
    exportData = initialSnapshot;
    source = 'live_pool';
    options?.onProgress?.(
      `[Export Mappings] Initial snapshot captured: ${initialSnapshot.stats?.matchedClasses ?? 0}/${initialSnapshot.stats?.totalClasses ?? 0} classes resolved.`,
    );
  }

  // Fallback to static merging if live eval not available
  if (!exportData && templateStr) {
    source = 'static_fallback';
    const template = JSON.parse(templateStr);
    const existing = findExistingMappings(profile) || {};
    const existingClasses = existing.classes || {};
    const existingFields = existing.fields || {};
    const existingMethods = existing.methods || {};

    const classesOut: Record<string, any> = {};
    let totalClasses = 0;
    let matchedClasses = 0;
    let totalFields = 0;
    let matchedFields = 0;
    let totalMethods = 0;
    let matchedMethods = 0;

    for (const [cKey, rawSpec] of Object.entries(template.classes || {})) {
      totalClasses++;
      const spec = (rawSpec || {}) as any;
      const canonical = spec.canonical || cKey;
      const superclass = spec.superclass || 'Object';

      let obf = cKey;
      let classMatched = false;
      const exVal = existingClasses[cKey];
      const baseObf =
        profile === '1.8.9' ? BASELINE_1_8_9_CLASSES[cKey] : undefined;

      if (baseObf) {
        obf = baseObf;
        classMatched = true;
      } else if (typeof exVal === 'string') {
        obf = exVal;
        classMatched = true;
      } else if (typeof exVal === 'object' && exVal !== null) {
        const realExObf =
          exVal.obf && exVal.obf !== cKey ? exVal.obf : undefined;
        obf = realExObf || cKey;
        classMatched = Boolean(realExObf || (obf && obf !== cKey));
      }

      if (classMatched) matchedClasses++;

      // Fields
      const fieldsOut: Record<string, any> = {};
      const cFields =
        existingFields[cKey] ||
        (typeof exVal === 'object' && exVal?.fields ? exVal.fields : {});
      for (const [fName, fSpec] of Object.entries(spec.fields || {})) {
        totalFields++;
        const fType =
          typeof fSpec === 'string' ? fSpec : (fSpec as any).type || 'Object';
        let fObf = fName;
        let fMatched = false;
        const exF = cFields[fName];
        const baseF =
          profile === '1.8.9'
            ? BASELINE_1_8_9_FIELDS[cKey]?.[fName]
            : undefined;

        if (baseF) {
          fObf = baseF;
          fMatched = true;
        } else if (typeof exF === 'string') {
          fObf = exF;
          fMatched = fObf !== fName;
        } else if (typeof exF === 'object' && exF !== null) {
          const realExF = exF.obf && exF.obf !== fName ? exF.obf : undefined;
          fObf = realExF || fName;
          fMatched = Boolean(realExF || (fObf && fObf !== fName));
        }

        if (fMatched) matchedFields++;
        fieldsOut[fName] = { type: fType, obf: fObf };
      }

      // Methods
      const methodsOut: Record<string, any> = {};
      const cMethods =
        existingMethods[cKey] ||
        (typeof exVal === 'object' && exVal?.methods ? exVal.methods : {});
      for (const [mName, rawMSpec] of Object.entries(spec.methods || {})) {
        totalMethods++;
        const mSpec = (rawMSpec || {}) as any;
        const mParams = mSpec.params || [];
        const mRet = mSpec.returnType || 'void';
        const mStatic = Boolean(mSpec.isStatic);
        let mObf = mName;
        let mMatched = false;
        const exM = cMethods[mName];
        const baseM =
          profile === '1.8.9'
            ? BASELINE_1_8_9_METHODS[cKey]?.[mName]
            : undefined;

        if (baseM) {
          mObf = baseM;
          mMatched = true;
        } else if (typeof exM === 'string') {
          mObf = exM;
          mMatched = mObf !== mName;
        } else if (typeof exM === 'object' && exM !== null) {
          const realExM = exM.obf && exM.obf !== mName ? exM.obf : undefined;
          mObf = realExM || mName;
          mMatched = Boolean(realExM || (mObf && mObf !== mName));
        }

        if (mMatched) matchedMethods++;
        methodsOut[mName] = {
          params: mParams,
          returnType: mRet,
          isStatic: mStatic,
          obf: mObf,
        };
      }

      classesOut[cKey] = {
        canonical,
        superclass,
        obf,
        fields: fieldsOut,
        methods: methodsOut,
      };
    }

    exportData = {
      $schema: 'exoproc-mappings-v1',
      version: profile,
      profile,
      generatedAt: new Date().toISOString(),
      stats: {
        totalClasses,
        matchedClasses,
        unmatchedClasses: totalClasses - matchedClasses,
        totalFields,
        matchedFields,
        unmatchedFields: totalFields - matchedFields,
        totalMethods,
        matchedMethods,
        unmatchedMethods: totalMethods - matchedMethods,
      },
      classes: classesOut,
    };
    initialSnapshot = exportData;
  }

  if (!exportData) {
    return {
      success: false,
      profile,
      generatedAt: new Date().toISOString(),
      source,
      stats: {
        totalClasses: 0,
        matchedClasses: 0,
        unmatchedClasses: 0,
        totalFields: 0,
        matchedFields: 0,
        unmatchedFields: 0,
        totalMethods: 0,
        matchedMethods: 0,
        unmatchedMethods: 0,
      },
      savedPaths: [],
      data: null,
      error:
        'Failed to generate mappings: no live target available and database template not found.',
    };
  }

  // 2. Step 2: Check which GUI screens from gui-navigation.json are NOT yet caught in the pool!
  if (options?.crawlGuis !== false && source === 'live_pool') {
    try {
      const navDb = (
        await import('./gui-navigator.js')
      ).loadNavigationDatabase();
      const currentClasses = exportData.classes || {};

      const ignoredScreens = new Set([
        'InGame',
        'Exit',
        'ParentScreen',
        'GuiGameOver',
        'GuiDisconnected',
      ]);
      const unmappedScreens: string[] = [];

      for (const screenName of Object.keys(navDb.screens)) {
        if (ignoredScreens.has(screenName)) continue;

        const fullCanonical = `net.minecraft.client.gui.${screenName}`;
        const entry =
          currentClasses[fullCanonical] || currentClasses[screenName];

        const isResolved = Boolean(
          entry &&
          entry.obf &&
          entry.obf !== screenName &&
          entry.obf !== fullCanonical &&
          entry.obf.length <= 4,
        );

        if (!isResolved) {
          unmappedScreens.push(screenName);
        }
      }

      // Determine reachable screens from current state
      const currentGui = await inspectGui({ includePool: false }).catch(
        () => null,
      );
      const isIngame = Boolean(
        currentGui?.playerLoaded && !currentGui?.hasScreen,
      );
      const startScreen = isIngame
        ? 'InGame'
        : currentGui?.simpleName || currentGui?.screenName || 'GuiMainMenu';

      const { guiCrawler } = await import('./gui-crawler.js');
      const reachableScreens = guiCrawler.getReachableScreens(startScreen);

      // Crawl all reachable screens when mapping mode is requested
      const crawlTargets =
        options?.targets && options.targets.length > 0
          ? options.targets
          : reachableScreens;

      if (crawlTargets.length > 0) {
        options?.onProgress?.(
          `[Export Mappings] Step 2: Crawling ${crawlTargets.length} GUI screens (${crawlTargets.join(', ')})...`,
        );

        const { guiCrawler } = await import('./gui-crawler.js');
        try {
          const crawlRes = await guiCrawler.crawlAllScreens({
            targets: crawlTargets,
            onProgress: options?.onProgress,
          });

          // Step 3: Fetch updated mappings after crawl
          options?.onProgress?.(
            '[Export Mappings] Step 3: Fetching updated reflection pool mappings after crawl...',
          );
          const updatedMappings = await queryLiveExport();
          if (updatedMappings && updatedMappings.classes) {
            exportData = updatedMappings;
            options?.onProgress?.(
              `[Export Mappings] Final mappings captured: ${exportData.stats?.matchedClasses ?? 0}/${exportData.stats?.totalClasses ?? 0} classes resolved.`,
            );
          }

          // Merge any crawler discoveries directly
          if (
            crawlRes.discovered &&
            Object.keys(crawlRes.discovered).length > 0
          ) {
            for (const [sName, disc] of Object.entries(crawlRes.discovered)) {
              const fullCan = `net.minecraft.client.gui.${sName}`;
              const targets = [fullCan, sName];
              let updatedAny = false;
              for (const key of targets) {
                if (exportData.classes[key]) {
                  exportData.classes[key].obf = disc.realClassName;
                  if (disc.buttons && disc.buttons.length > 0) {
                    exportData.classes[key].buttons = disc.buttons;
                  }
                  updatedAny = true;
                }
              }
              if (!updatedAny) {
                exportData.classes[fullCan] = {
                  canonical: fullCan,
                  superclass: disc.superclass || 'GuiScreen',
                  obf: disc.realClassName,
                  fields: {},
                  methods: {},
                  buttons: disc.buttons || [],
                };
                exportData.stats.totalClasses++;
                exportData.stats.matchedClasses++;
              }
            }
          }
        } catch (crawlErr: any) {
          options?.onProgress?.(
            `[Export Mappings] ⚠️ Selective crawl error: ${crawlErr.message || crawlErr}. Safely falling back to initial snapshot.`,
          );
          exportData = initialSnapshot;
        }
      } else {
        options?.onProgress?.(
          '[Export Mappings] Step 2: All GUI screens are already caught in reflection pool! Skipping redundant crawl.',
        );
      }
    } catch (err: any) {
      options?.onProgress?.(
        `[Export Mappings] ⚠️ Error evaluating unmapped screens: ${err.message || err}. Falling back to initial snapshot.`,
      );
      exportData = initialSnapshot;
    }
  }

  // 2.5 Merge any live discoveries from agentMappingPool into exportData
  const localPool = getAgentMappingPool();
  const allDetected =
    typeof localPool?.getAllDetected === 'function'
      ? localPool.getAllDetected()
      : [];
  if (allDetected && allDetected.length > 0) {
    if (!exportData) {
      exportData = {
        classes: {},
        stats: { totalClasses: 0, matchedClasses: 0 },
      };
    }
    if (!exportData.classes) exportData.classes = {};

    for (const detected of allDetected) {
      const key = detected.canonicalName || detected.realClassName;
      if (!exportData.classes[key]) {
        exportData.classes[key] = {
          canonical: detected.canonicalName,
          simpleName: detected.simpleName,
          superclass: detected.superclass || 'Object',
          obf: detected.realClassName,
          fields: { ...(detected.fields || {}) },
          methods: { ...(detected.methods || {}) },
        };
        if (exportData.stats) {
          exportData.stats.totalClasses =
            (exportData.stats.totalClasses || 0) + 1;
          exportData.stats.matchedClasses =
            (exportData.stats.matchedClasses || 0) + 1;
        }
      } else {
        exportData.classes[key].obf = detected.realClassName;
        if (detected.fields && Object.keys(detected.fields).length > 0) {
          exportData.classes[key].fields = {
            ...(exportData.classes[key].fields || {}),
            ...detected.fields,
          };
        }
        if (detected.methods && Object.keys(detected.methods).length > 0) {
          exportData.classes[key].methods = {
            ...(exportData.classes[key].methods || {}),
            ...detected.methods,
          };
        }
      }
    }
  }

  // Synchronize top-level classes and data.classes
  if (exportData && exportData.classes) {
    if (!exportData.data) {
      exportData.data = {};
    }
    exportData.data.classes = exportData.classes;
    exportData.data.profile = profile;
    exportData.data.stats = exportData.stats;
  }

  // 3. Clean up: Ensure no "matched" field is kept in classes, fields, or methods
  if (exportData && exportData.classes) {
    for (const [_cKey, cVal] of Object.entries<any>(exportData.classes)) {
      if (cVal) {
        delete cVal.matched;
        if (cVal.fields) {
          for (const fVal of Object.values<any>(cVal.fields)) {
            if (fVal) delete fVal.matched;
          }
        }
        if (cVal.methods) {
          for (const mVal of Object.values<any>(cVal.methods)) {
            if (mVal) delete mVal.matched;
          }
        }
      }
    }
  }

  // 4. Save to target files
  const jsonContent = JSON.stringify(exportData, null, 2) + '\n';
  const saveTargets: string[] = [];
  if (options?.outPath) {
    saveTargets.push(resolve(process.cwd(), options.outPath));
  } else {
    saveTargets.push(...findOutputTargetPaths(profile));
  }

  const savedPaths: string[] = [];
  for (const tPath of saveTargets) {
    try {
      const parent = dirname(tPath);
      if (!existsSync(parent)) {
        mkdirSync(parent, { recursive: true });
      }
      writeFileSync(tPath, jsonContent, 'utf8');
      savedPaths.push(tPath);
    } catch (_e) {}
  }

  return {
    success: true,
    profile,
    generatedAt: exportData.generatedAt || new Date().toISOString(),
    source,
    stats: exportData.stats,
    savedPaths,
    data: exportData,
  };
}

/**
 * Crawl all reachable GUI screens and inspect their runtime classes, fields, methods, and buttons.
 */
export async function crawlGuis(options?: {
  targets?: string[];
  onProgress?: (msg: string) => void;
  sleepBetweenMs?: number;
}): Promise<import('./gui-crawler.js').GuiCrawlResult> {
  const { guiCrawler } = await import('./gui-crawler.js');
  return await guiCrawler.crawlAllScreens(options);
}

export interface TargetBlockInfo {
  name: string;
  unlocalized: string;
  coords: { x: number; y: number; z: number };
  side: string;
}

export interface TargetEntityInfo {
  id: number;
  name: string;
  type: string;
  coords: { x: number; y: number; z: number };
  health?: number;
}

export interface TargetResult {
  inGame: boolean;
  screenName?: string;
  hitType: 'BLOCK' | 'ENTITY' | 'MISS' | 'NONE';
  reach: number;
  distance?: number;
  block?: TargetBlockInfo;
  entity?: TargetEntityInfo;
  error?: string;
}

/**
 * Inspect target block or entity in player crosshairs.
 */
export async function inspectTarget(reach: number = 30): Promise<TargetResult> {
  const script = loadScript('inspect-target');
  const code = `var TARGET_REACH = ${JSON.stringify(reach)};\n` + script;
  const resp = await evalRemote(code);
  if (!resp.success) {
    return {
      inGame: false,
      hitType: 'NONE',
      reach,
      error: resp.error || 'Failed to execute target inspection',
    };
  }

  for (const log of resp.logs) {
    if (log.startsWith('RESULT:TARGET|')) {
      try {
        return JSON.parse(log.substring('RESULT:TARGET|'.length));
      } catch {}
    }
  }

  return {
    inGame: false,
    hitType: 'NONE',
    reach,
    error: 'No target data returned',
  };
}

export interface NearbyEntityItem {
  id: number;
  name: string;
  type: string;
  distance: number;
  coords: { x: number; y: number; z: number };
  health?: number;
  isPlayer: boolean;
}

export interface NearbyEntitiesResult {
  inGame: boolean;
  screenName?: string;
  totalLoaded: number;
  radius: number;
  entities: NearbyEntityItem[];
  error?: string;
}

/**
 * Inspect nearby entities (players, mobs, items) within given radius.
 */
export async function inspectEntities(
  radius: number = 64,
): Promise<NearbyEntitiesResult> {
  const script = loadScript('inspect-entities');
  const code = `var SCAN_RADIUS = ${JSON.stringify(radius)};\n` + script;
  const resp = await evalRemote(code);
  if (!resp.success) {
    return {
      inGame: false,
      totalLoaded: 0,
      radius,
      entities: [],
      error: resp.error || 'Failed to scan entities',
    };
  }

  for (const log of resp.logs) {
    if (log.startsWith('RESULT:ENTITIES|')) {
      try {
        return JSON.parse(log.substring('RESULT:ENTITIES|'.length));
      } catch {}
    }
  }

  return {
    inGame: false,
    totalLoaded: 0,
    radius,
    entities: [],
    error: 'No entity data returned',
  };
}

export interface InventorySlotItem {
  slot: number;
  name: string;
  unlocalized: string;
  count: number;
  damage: number;
}

export interface InventoryResult {
  inGame: boolean;
  screenName?: string;
  selectedSlot: number;
  hotbar: (InventorySlotItem | null)[];
  main: (InventorySlotItem | null)[];
  armor: (InventorySlotItem | null)[];
  totalItems: number;
  error?: string;
}

/**
 * Inspect player inventory, hotbar, and equipment.
 */
export async function inspectInventory(): Promise<InventoryResult> {
  const script = loadScript('inspect-inventory');
  const resp = await evalRemote(script);
  if (!resp.success) {
    return {
      inGame: false,
      selectedSlot: 0,
      hotbar: [],
      main: [],
      armor: [],
      totalItems: 0,
      error: resp.error || 'Failed to inspect inventory',
    };
  }

  for (const log of resp.logs) {
    if (log.startsWith('RESULT:INVENTORY|')) {
      try {
        return JSON.parse(log.substring('RESULT:INVENTORY|'.length));
      } catch {}
    }
  }

  return {
    inGame: false,
    selectedSlot: 0,
    hotbar: [],
    main: [],
    armor: [],
    totalItems: 0,
    error: 'No inventory data returned',
  };
}

/**
 * Send an in-game chat message or slash command.
 */
export async function sendChat(
  message: string,
): Promise<{ success: boolean; message: string; error?: string }> {
  const code = `
    (function() {
      var mc = (typeof mc !== 'undefined' && mc) ||
               (typeof Java !== 'undefined' && Java.type ? (Java.type('net.minecraft.client.Minecraft')?.theMinecraft || Java.type('ave')?.S) : null);
      var p = mc ? (mc.thePlayer || mc.h) : null;
      if (!p) throw new Error('Player is not in game world');
      if (typeof p.sendChatMessage === 'function') {
        p.sendChatMessage(${JSON.stringify(message)});
      } else if (typeof p.e === 'function') {
        p.e(${JSON.stringify(message)});
      }
      return 'Chat sent';
    })()
  `;
  const resp = await evalRemote(code);
  if (!resp.success) {
    return {
      success: false,
      message,
      error: resp.error || 'Failed to send chat',
    };
  }
  return { success: true, message };
}

/**
 * Adjust player camera orientation (yaw and pitch angles).
 */
export async function setPlayerLook(
  yaw: number,
  pitch: number,
): Promise<{ success: boolean; yaw: number; pitch: number; error?: string }> {
  const script = loadScript('player-action');
  const code =
    `var ACTION_TYPE = 'look'; var LOOK_YAW = ${Number(yaw)}; var LOOK_PITCH = ${Number(pitch)};\n` +
    script;
  const resp = await evalRemote(code);
  if (!resp.success) {
    return {
      success: false,
      yaw,
      pitch,
      error: resp.error || 'Failed to adjust camera',
    };
  }

  for (const log of resp.logs) {
    if (log.startsWith('RESULT:ACTION|')) {
      try {
        const data = JSON.parse(log.substring('RESULT:ACTION|'.length));
        return {
          success: Boolean(data.success),
          yaw,
          pitch,
          error: data.error,
        };
      } catch {}
    }
  }

  return { success: false, yaw, pitch, error: 'No response from look action' };
}

export interface PlayerActionResult {
  success: boolean;
  action: string;
  message?: string;
  error?: string;
}

/**
 * Trigger physical player actions (swing/attack, use/interact, jump).
 */
export async function triggerPlayerAction(
  action: 'swing' | 'attack' | 'use' | 'jump',
): Promise<PlayerActionResult> {
  const script = loadScript('player-action');
  const code = `var ACTION_TYPE = ${JSON.stringify(action)};\n` + script;
  const resp = await evalRemote(code);
  if (!resp.success) {
    return {
      success: false,
      action,
      error: resp.error || `Failed to trigger action ${action}`,
    };
  }

  for (const log of resp.logs) {
    if (log.startsWith('RESULT:ACTION|')) {
      try {
        const data = JSON.parse(log.substring('RESULT:ACTION|'.length));
        return {
          success: Boolean(data.success),
          action,
          message: data.message,
          error: data.error,
        };
      } catch {}
    }
  }

  return { success: false, action, error: 'No response from action executor' };
}

export interface HotbarSelectResult {
  success: boolean;
  slot: number;
  message?: string;
  error?: string;
}

/**
 * Select active hotbar slot (0 to 8).
 */
export async function selectHotbarSlot(
  slot: number,
): Promise<HotbarSelectResult> {
  const script = loadScript('player-action');
  const code =
    `var ACTION_TYPE = 'slot'; var HOTBAR_SLOT = ${Number(slot)};\n` + script;
  const resp = await evalRemote(code);
  if (!resp.success) {
    return {
      success: false,
      slot,
      error: resp.error || `Failed to select slot ${slot}`,
    };
  }

  for (const log of resp.logs) {
    if (log.startsWith('RESULT:ACTION|')) {
      try {
        const data = JSON.parse(log.substring('RESULT:ACTION|'.length));
        return {
          success: Boolean(data.success),
          slot,
          message: data.message,
          error: data.error,
        };
      } catch {}
    }
  }

  return { success: false, slot, error: 'No response from slot selector' };
}

export type RemoteScreenshotResult = ScreenshotRemoteResult;
export type { ScreenshotRemoteResult };

/**
 * Capture in-game screenshot from OpenGL framebuffer as Base64 (optionally writes to outputPath).
 */
export async function screenshot(
  outputPath?: string,
): Promise<ScreenshotRemoteResult> {
  const { screenshotRemote } = await import('./client.js');
  return await screenshotRemote(outputPath);
}

/**
 * Upgrades the active target connection to in-process Java Agent by loading and defining the agent .class.
 */
export async function upgrade(options?: {
  classPath?: string;
  bytecode?: string | Uint8Array;
  className?: string;
  port?: number;
  obfuscate?: boolean;
  targetVersion?: number;
}) {
  const { upgradeRemote } = await import('./client.js');
  return await upgradeRemote(options);
}

export const upgradeAgent = upgrade;
