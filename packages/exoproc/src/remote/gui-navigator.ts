import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import * as api from './api.js';
import * as client from './client.js';

export interface GuiTransition {
  button?: string;
  buttonText?: string;
  buttonId?: number;
  action?: 'escape' | 'inventory' | 'chat' | 'closeScreen';
  target: string;
  description?: string;
}

export interface GuiScreenDef {
  description?: string;
  aliases?: string[];
  detectKeywords?: string[];
  transitions: GuiTransition[];
}

export interface GuiNavigationDatabase {
  version: string;
  screens: Record<string, GuiScreenDef>;
}

import defaultNavigationDatabase from '../../../minecraft/src/mappings/gui-navigation.json';

/**
 * Load the clean, declarative GUI navigation database.
 */
export function loadNavigationDatabase(): GuiNavigationDatabase {
  const root = client.findRepoRoot();
  const curDir =
    import.meta.dirname || (import.meta as any).dir || process.cwd();
  const possiblePaths = [
    join(root, 'packages/minecraft/src/mappings/gui-navigation.json'),
    join(root, 'packages/minecraft/dist/mappings/gui-navigation.json'),
    resolve(
      process.cwd(),
      'packages/minecraft/src/mappings/gui-navigation.json',
    ),
    resolve(curDir, '../../minecraft/src/mappings/gui-navigation.json'),
    resolve(curDir, '../../../minecraft/src/mappings/gui-navigation.json'),
    resolve(curDir, '../data/gui-navigation.json'),
    resolve(curDir, 'gui-navigation.json'),
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, 'utf8');
        return JSON.parse(raw);
      } catch {}
    }
  }

  return defaultNavigationDatabase as unknown as GuiNavigationDatabase;
}

/**
 * Common 1.8.9 obfuscation fallbacks for instant resolution
 */
const OBFUSCATION_FALLBACKS: Record<string, string> = {
  axz: 'GuiScreenOptionsSounds',
  axn: 'GuiOptions',
  aye: 'GuiControls',
  axp: 'GuiIngameMenu',
  ayb: 'GuiVideoSettings',
  axe: 'GuiGameOver',
  ayz: 'GuiSelectWorld',
  ayi: 'GuiSelectWorld',
  aya: 'GuiMainMenu',
  ayd: 'GuiMainMenu',
  ayc: 'GuiCreateWorld',
  ayh: 'GuiCreateWorld',
  ayx: 'GuiInventory',
  axx: 'GuiCustomizeSkin',
  awv: 'GuiChat',
  bcf: 'Minecraft',
  None: 'InGame',
  none: 'InGame',
};

let cachedVersionMappings: Record<string, string> | null = null;

function getVersionMappings(): Record<string, string> {
  if (cachedVersionMappings) return cachedVersionMappings;
  const map: Record<string, string> = { ...OBFUSCATION_FALLBACKS };
  const root = client.findRepoRoot();
  const curDir =
    import.meta.dirname || (import.meta as any).dir || process.cwd();
  const possiblePaths = [
    join(root, 'packages/minecraft/src/mappings/mappings-1.8.9.json'),
    join(root, 'packages/minecraft/dist/mappings/mappings-1.8.9.json'),
    resolve(
      process.cwd(),
      'packages/minecraft/src/mappings/mappings-1.8.9.json',
    ),
    resolve(curDir, '../../minecraft/src/mappings/mappings-1.8.9.json'),
    resolve(curDir, '../../../minecraft/src/mappings/mappings-1.8.9.json'),
    resolve(curDir, '../data/mappings-1.8.9.json'),
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, 'utf8'));
        if (raw.classes) {
          for (const [clsKey, def] of Object.entries<any>(raw.classes)) {
            if (def.obf) {
              const cleanSimple =
                def.simpleName || clsKey.split('.').pop() || clsKey;
              map[def.obf] = cleanSimple;
            }
          }
        }
        break;
      } catch {}
    }
  }

  cachedVersionMappings = map;
  return map;
}

export function registerDiscoveredMapping(obf: string, simple: string): void {
  const map = getVersionMappings();
  const cleanSimple = simple.split('.').pop() || simple;
  map[obf] = cleanSimple;
}

/**
 * Detect GUI screen by structural button fingerprint matching against gui-navigation.json.
 * Matches both transitions (buttonId + description text) and detectKeywords across button labels.
 * Works universally across ALL Minecraft versions, even if class names are completely unknown or obfuscated!
 */
export function detectScreenByButtons(
  buttons: Array<{ id: number; text: string }>,
  db?: GuiNavigationDatabase,
): string | null {
  if (!buttons || buttons.length === 0) return null;
  const database = db || loadNavigationDatabase();

  let bestScreen: string | null = null;
  let highestScore = 0;

  for (const [screenName, def] of Object.entries(database.screens)) {
    if (screenName === 'InGame') continue;
    let score = 0;

    // 1. Match button transitions by text label or fallback buttonId
    for (const trans of def.transitions) {
      const targetText = trans.button || trans.buttonText || trans.description;
      if (targetText && !trans.action) {
        const targetNorm = targetText.toLowerCase().replace(/[^a-z0-9]/g, '');
        const isGeneric =
          targetNorm === 'done' ||
          targetNorm === 'cancel' ||
          targetNorm === 'back';
        const foundBtn = buttons.find((b) => {
          const btnNorm = (b.text || '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
          return (
            targetNorm.length >= 2 &&
            (btnNorm.includes(targetNorm) || targetNorm.includes(btnNorm))
          );
        });
        if (foundBtn) {
          score += isGeneric ? 1 : 3;
        }
      } else if (trans.buttonId !== undefined) {
        const foundBtn = buttons.find((b) => b.id === trans.buttonId);
        if (foundBtn) {
          score += 1;
        }
      }
    }

    // 2. Match detectKeywords against button texts
    if (def.detectKeywords && def.detectKeywords.length > 0) {
      for (const kw of def.detectKeywords) {
        const kwLower = kw.toLowerCase();
        if (buttons.some((b) => b.text.toLowerCase().includes(kwLower))) {
          score += 4;
        }
      }
    }

    // Confidence threshold: at least 3 points required (non-generic button or keyword match)
    if (score > highestScore && score >= 3) {
      highestScore = score;
      bestScreen = screenName;
    }
  }

  return bestScreen;
}

/**
 * Resolves any raw screen name, canonical class, or obfuscated class to a clean simple name.
 * Prioritizes known canonical screens, then version mappings, then structural fingerprinting fallback.
 */
export function resolveSimpleScreenName(
  screenInfo: {
    screenName?: string;
    canonicalClass?: string;
    realClassName?: string;
    playerLoaded?: boolean;
    buttons?: Array<{ id: number; text: string }>;
  },
  db?: GuiNavigationDatabase,
): string {
  const name = screenInfo.screenName || '';
  if (
    !name ||
    name === 'None' ||
    name.toLowerCase() === 'none' ||
    name.includes('HUD')
  ) {
    return 'InGame';
  }

  const database = db || loadNavigationDatabase();

  // 1. Direct match if screenName is already a valid known screen in the navigation graph
  if (database.screens[name]) {
    return name;
  }

  // Extract simple class name from canonicalClass or realClassName
  const full = screenInfo.canonicalClass || screenInfo.realClassName || name;
  const simple = full.split('.').pop() || full;
  if (database.screens[simple]) {
    return simple;
  }

  // 2. Second priority: Dynamic version mapping tables
  const mappings = getVersionMappings();
  const checkMapped = (k?: string) => {
    if (!k) return null;
    const m = mappings[k];
    if (!m) return null;
    const s = m.split('.').pop() || m;
    return database.screens[s] ? s : null;
  };

  const fromName = checkMapped(name);
  if (fromName) return fromName;
  const fromSimple = checkMapped(simple);
  if (fromSimple) return fromSimple;
  const fromReal = checkMapped(screenInfo.realClassName);
  if (fromReal) return fromReal;

  // 3. Fallback: Structural button fingerprint match ONLY when class is unknown or unmapped
  if (screenInfo.buttons && screenInfo.buttons.length > 0) {
    const detected = detectScreenByButtons(screenInfo.buttons, db);
    if (detected) {
      return detected;
    }
  }

  return simple;
}

/**
 * Directed Graph Engine for Minecraft GUI Navigation.
 */
export class GuiNavigationGraph {
  private db: GuiNavigationDatabase;

  constructor(db?: GuiNavigationDatabase) {
    this.db = db || loadNavigationDatabase();
  }

  /**
   * Normalize user-supplied target query to the closest matching screen name in gui-navigation.json.
   * Matches exact names, aliases, stripped prefix names, transitions, detectKeywords, and descriptions.
   * e.g. "video" -> "GuiVideoSettings", "sounds" -> "GuiScreenOptionsSounds", "singleplayer" -> "GuiSelectWorld"
   */
  public normalizeTarget(target: string): string {
    const raw = target.trim();
    if (!raw) return 'InGame';

    const clean = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!clean) return target;

    // Direct exact match on known screen keys
    if (this.db.screens[raw]) return raw;
    for (const screen of Object.keys(this.db.screens)) {
      if (screen.toLowerCase() === raw.toLowerCase()) return screen;
    }

    // InGame special aliases
    if (['ingame', 'game', 'world', 'play', 'oyun', 'dunya'].includes(clean)) {
      return 'InGame';
    }

    let bestScreen: string | null = null;
    let highestScore = 0;

    for (const [screenName, def] of Object.entries(this.db.screens)) {
      let score = 0;
      const sLower = screenName.toLowerCase();
      const sStripped = sLower.replace(/^gui(screen)?/, ''); // e.g. "videosettings", "optionssounds", "controls"

      // 1. Exact match on stripped name
      if (sStripped === clean) {
        score += 1000;
      }
      // 2. Aliases match
      if (def.aliases && def.aliases.length > 0) {
        for (const alias of def.aliases) {
          const aNorm = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (aNorm === clean) {
            score += 900;
          } else if (aNorm.startsWith(clean) || clean.startsWith(aNorm)) {
            score += 600;
          } else if (aNorm.includes(clean) || clean.includes(aNorm)) {
            score += 400;
          }
        }
      }

      // 3. Stripped name prefix or substring
      if (sStripped.startsWith(clean)) {
        score +=
          500 +
          Math.min(100, Math.round((clean.length / sStripped.length) * 100));
      } else if (sStripped.includes(clean)) {
        score +=
          350 +
          Math.min(100, Math.round((clean.length / sStripped.length) * 100));
      } else if (sLower.includes(clean)) {
        score += 250;
      }

      // 4. Inbound transition button labels (e.g. "Video Settings..." leading to GuiVideoSettings)
      for (const [_otherName, otherDef] of Object.entries(this.db.screens)) {
        for (const t of otherDef.transitions) {
          if (t.target === screenName) {
            const btnNorm = (t.button || t.buttonText || t.description || '')
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '');
            if (btnNorm) {
              if (btnNorm === clean) {
                score += 500;
              } else if (btnNorm.startsWith(clean)) {
                score += 350;
              } else if (btnNorm.includes(clean)) {
                score += 250;
              }
            }
          }
        }
      }

      // 5. DetectKeywords match
      if (def.detectKeywords && def.detectKeywords.length > 0) {
        for (const kw of def.detectKeywords) {
          const kwNorm = kw.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (kwNorm === clean) {
            score += 300;
          } else if (kwNorm.includes(clean) || clean.includes(kwNorm)) {
            score += 150;
          }
        }
      }

      // 6. Description match
      if (def.description) {
        const descNorm = def.description
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
        if (descNorm.includes(clean)) {
          score += 100;
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestScreen = screenName;
      }
    }

    if (bestScreen && highestScore >= 150) {
      return bestScreen;
    }

    return target;
  }

  /**
   * Find shortest path of transitions from startScreen to targetScreen using BFS.
   */
  public findPath(
    startScreen: string,
    targetScreen: string,
    inGameWorld: boolean = true,
    activeButtons?: Array<{ id: number; enabled?: boolean }>,
  ): Array<{ from: string; to: string; transition: GuiTransition }> | null {
    const start = this.normalizeTarget(startScreen);
    const target = this.normalizeTarget(targetScreen);

    if (start === target) return [];

    const queue: Array<{
      current: string;
      path: Array<{ from: string; to: string; transition: GuiTransition }>;
    }> = [{ current: start, path: [] }];
    const visited = new Set<string>([start]);

    while (queue.length > 0) {
      const { current, path } = queue.shift()!;
      const screenDef = this.db.screens[current];
      if (!screenDef) continue;

      for (const t of screenDef.transitions) {
        // If we are evaluating the current screen and this transition requires a button that is disabled, skip it!
        if (current === start && activeButtons) {
          const targetText = t.button || t.buttonText || t.description;
          if (targetText && !t.action) {
            const targetNorm = targetText
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '');
            const btn = activeButtons.find((b: any) => {
              if (t.buttonId !== undefined && b.id === t.buttonId) return true;
              const bText = b.text || b.displayString || '';
              const btnNorm = bText.toLowerCase().replace(/[^a-z0-9]/g, '');
              return (
                targetNorm.length >= 2 &&
                (btnNorm.includes(targetNorm) || targetNorm.includes(btnNorm))
              );
            });
            if (btn && btn.enabled === false) {
              continue;
            }
          } else if (t.buttonId !== undefined) {
            const btn = activeButtons.find((b: any) => b.id === t.buttonId);
            if (btn && btn.enabled === false) {
              continue;
            }
          }
        }

        let nextTarget = t.target;

        // Resolve generic targets
        if (nextTarget === 'ParentScreen') {
          nextTarget = inGameWorld ? 'GuiIngameMenu' : 'GuiMainMenu';
        }

        if (nextTarget === target) {
          return [...path, { from: current, to: nextTarget, transition: t }];
        }

        if (!visited.has(nextTarget) && this.db.screens[nextTarget]) {
          visited.add(nextTarget);
          queue.push({
            current: nextTarget,
            path: [...path, { from: current, to: nextTarget, transition: t }],
          });
        }
      }
    }

    return null;
  }

  /**
   * Execute full navigation flow from current game state to target screen.
   */
  public async navigateTo(
    targetScreen: string = 'InGame',
    onProgress?: (msg: string) => void,
  ): Promise<{
    success: boolean;
    message: string;
    steps: string[];
    currentScreen?: string;
    coords?: { x: number; y: number; z: number };
  }> {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const target = this.normalizeTarget(targetScreen);
    const executedSteps: string[] = [];

    onProgress?.(`Starting navigation to target: ${target}`);

    for (let iteration = 0; iteration < 20; iteration++) {
      const gui = await api.inspectGui({ includePool: false });
      const currentSimple = resolveSimpleScreenName(
        {
          screenName: gui.screenName,
          canonicalClass: gui.canonicalClass,
          realClassName: gui.realClassName,
          playerLoaded: gui.playerLoaded,
          buttons: gui.buttons,
        },
        this.db,
      );

      // Check if goal reached
      if (currentSimple === target) {
        let coords = gui.playerCoords;
        if (target === 'InGame' && !coords && gui.playerLoaded) {
          try {
            const p = await api.inspectPlayer();
            coords = p.coords;
          } catch {}
        }
        const msg = `Successfully reached target screen: ${target}${coords ? ` at (${coords.x.toFixed(1)}, ${coords.y.toFixed(1)}, ${coords.z.toFixed(1)})` : ''}`;
        onProgress?.(msg);
        return {
          success: true,
          message: msg,
          steps: executedSteps,
          currentScreen: currentSimple,
          coords,
        };
      }

      // Special case: Player is in death screen
      if (currentSimple === 'GuiGameOver' || gui.screenName === 'axe') {
        onProgress?.('Death screen detected. Respawning...');
        await api.clickButton('Respawn');
        executedSteps.push('GuiGameOver -> Respawn');
        await sleep(1000);
        continue;
      }

      // Special case: When in Select World and target is InGame, enter via play if enabled
      if (currentSimple === 'GuiSelectWorld' && target === 'InGame') {
        const playBtn = gui.buttons.find((b) =>
          (b.text || '').toLowerCase().includes('play'),
        );
        if (playBtn && playBtn.enabled) {
          onProgress?.(
            'At Select World: "Play Selected World" is enabled. Entering world...',
          );
          const playRes = await api.clickButton(playBtn.text || playBtn.id);
          if (playRes.success) {
            executedSteps.push(
              `GuiSelectWorld -> Click button "${playBtn.text}"`,
            );
            await sleep(2500);
            continue;
          }
        }

        return {
          success: false,
          message:
            'At Select World: No world is selected to play. Please select a world or specify a menu target.',
          steps: executedSteps,
          currentScreen: currentSimple,
        };
      }

      // Special case: When in Create World and target is InGame, trigger world generation
      if (currentSimple === 'GuiCreateWorld' && target === 'InGame') {
        onProgress?.(
          'At Create World: Clicking "Create New World" to generate world...',
        );
        const createRes = await api.clickButton('Create New World');
        if (createRes.success) {
          executedSteps.push(
            'GuiCreateWorld -> Click button "Create New World"',
          );
          onProgress?.(
            'World generation initiated. Waiting for terrain generation & player spawn...',
          );
          for (let wait = 0; wait < 20; wait++) {
            await sleep(1500);
            try {
              const checkGui = await api.inspectGui({ includePool: false });
              if (
                checkGui.playerLoaded ||
                (!checkGui.hasScreen && checkGui.inGame)
              ) {
                onProgress?.(
                  'Player successfully spawned into singleplayer world!',
                );
                break;
              }
            } catch {}
          }
          continue;
        }
      }

      // Find path on graph (accounting for currently disabled buttons)
      const path = this.findPath(
        currentSimple,
        target,
        gui.playerLoaded,
        gui.buttons,
      );
      if (!path || path.length === 0) {
        // Fallback: If target is InGame and we have a screen open with player loaded, close it
        if (target === 'InGame' && gui.playerLoaded && gui.hasScreen) {
          onProgress?.(
            `No direct path from ${currentSimple} to InGame. Closing active screen...`,
          );
          await api.closeScreen();
          executedSteps.push(`Fallback: closeScreen() from ${currentSimple}`);
          await sleep(600);
          continue;
        }

        return {
          success: false,
          message: `No navigation path found from current screen "${currentSimple}" to target "${target}"`,
          steps: executedSteps,
          currentScreen: currentSimple,
        };
      }

      const nextStep = path[0];
      if (!nextStep) {
        return {
          success: false,
          message: 'Navigation step path is empty',
          steps: executedSteps,
          currentScreen: currentSimple,
        };
      }
      const buttonTarget =
        nextStep.transition.button ||
        nextStep.transition.buttonText ||
        (nextStep.transition.buttonId !== undefined
          ? nextStep.transition.buttonId
          : nextStep.transition.description);
      const desc =
        nextStep.transition.description ||
        (typeof buttonTarget === 'string'
          ? buttonTarget
          : `${nextStep.from} -> ${nextStep.to}`);
      onProgress?.(
        `Step ${iteration + 1}: ${desc} (${nextStep.from} -> ${nextStep.to})`,
      );

      if (buttonTarget !== undefined && !nextStep.transition.action) {
        const clickRes = await api.clickButton(buttonTarget);
        if (clickRes.success) {
          executedSteps.push(`Click Button "${buttonTarget}" (${desc})`);
        } else {
          onProgress?.(
            `Warning: Click failed for "${buttonTarget}": ${clickRes.error}`,
          );
          // Quick check: Did screen already reach target?
          const recheck = await api.inspectGui({ includePool: false });
          const recheckSimple = resolveSimpleScreenName(recheck, this.db);
          if (
            recheckSimple === target ||
            (target === 'InGame' && !recheck.hasScreen && recheck.inGame)
          ) {
            onProgress?.(
              `Successfully reached target screen: ${recheckSimple}`,
            );
            return {
              success: true,
              message: `Successfully reached target screen: ${recheckSimple}`,
              currentScreen: recheckSimple,
              steps: executedSteps,
            };
          }
        }
      } else if (nextStep.transition.action === 'escape') {
        if (nextStep.from === 'InGame') {
          // Open pause menu from ingame
          await client.evalRemote(`
            (function() {
              var mc = (typeof mc !== 'undefined' && mc) ||
                       (typeof Java !== 'undefined' && Java.type ? (
                         (function() {
                           try { return Java.type('net.minecraft.client.Minecraft').theMinecraft; } catch (e) {}
                           try { return Java.type('net.minecraft.client.Minecraft').getMinecraft(); } catch (e) {}
                           try { return Java.type('ave').S; } catch (e) {}
                           try { return Java.type('ave').A(); } catch (e) {}
                           return null;
                         })()
                       ) : null);
              if (!mc) return;
              var MenuCls = null;
              if (typeof Java !== 'undefined' && Java.type) {
                try { MenuCls = Java.type('net.minecraft.client.gui.GuiIngameMenu'); } catch (e) {}
                if (!MenuCls) {
                  try { MenuCls = Java.type('axp'); } catch (e) {}
                }
              }
              if (MenuCls) {
                var screen = new MenuCls();
                var doOpen = function() {
                  if (typeof mc.displayGuiScreen === 'function') {
                    try { mc.displayGuiScreen(screen); } catch (e) { if (typeof mc.a === 'function') mc.a(screen); }
                  } else if (typeof mc.a === 'function') {
                    mc.a(screen);
                  }
                };
                if (typeof Java !== 'undefined' && typeof Java.runOn === 'function') {
                  try { Java.runOn(mc, doOpen); } catch (e) { doOpen(); }
                } else {
                  doOpen();
                }
              }
            })()
          `);
          executedSteps.push('Open GuiIngameMenu');
        } else {
          await api.closeScreen();
          executedSteps.push('Close screen / Escape');
        }
      } else if (nextStep.transition.action === 'closeScreen') {
        await api.closeScreen();
        executedSteps.push('Close screen');
      }

      await sleep(800);
    }

    return {
      success: false,
      message: `Navigation timed out before reaching target "${target}"`,
      steps: executedSteps,
    };
  }
}

export const guiNavigator = new GuiNavigationGraph();
export default guiNavigator;
