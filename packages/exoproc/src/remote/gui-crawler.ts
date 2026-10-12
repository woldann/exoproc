import {
  guiNavigator,
  loadNavigationDatabase,
  resolveSimpleScreenName,
  registerDiscoveredMapping,
  type GuiNavigationDatabase,
} from './gui-navigator.js';
import * as api from './api.js';

export interface DiscoveredGuiScreen {
  simpleName: string;
  realClassName: string;
  superclass?: string;
  fields: Array<{
    name: string;
    typeName: string;
    simpleTypeName: string;
    isStatic: boolean;
  }>;
  methods: Array<{
    name: string;
    returnType: string;
    simpleReturnType: string;
    paramTypes: string[];
    isStatic: boolean;
  }>;
  buttons: Array<{
    id: number;
    text: string;
  }>;
  discoveredAt: string;
}

export interface GuiCrawlResult {
  success: boolean;
  initialScreen: string;
  visitedScreens: string[];
  failedScreens: string[];
  discovered: Record<string, DiscoveredGuiScreen>;
  error?: string;
}

export class GuiCrawler {
  private db: GuiNavigationDatabase;

  constructor(db?: GuiNavigationDatabase) {
    this.db = db || loadNavigationDatabase();
  }

  /**
   * Probe the currently displayed screen safely via inspectGui (using Java.detector pool).
   */
  public async probeCurrentScreen(): Promise<any | null> {
    try {
      const g = await api.inspectGui({ includePool: true });
      if (g && g.hasScreen && g.realClassName) {
        return {
          hasScreen: true,
          realClassName: g.realClassName,
          superclass: g.superclassName || 'GuiScreen',
          fields: [],
          methods: [],
          buttons: (g.buttons || []).map((b) => ({
            id: b.id,
            text: b.text,
            x: b.x,
            y: b.y,
            width: (b as any).width ?? 200,
            height: (b as any).height ?? 20,
            enabled: b.enabled,
          })),
        };
      }
    } catch {}
    return null;
  }

  /**
   * Determine reachable menu screens from starting state.
   */
  public getReachableScreens(startScreen: string = 'InGame'): string[] {
    const screensToVisit: string[] = [];
    const isWorld = startScreen === 'InGame' || startScreen.includes('Ingame');

    // Ordered sequence to visit logically and return cleanly
    const inGameSequence = [
      'GuiIngameMenu',
      'GuiOptions',
      'GuiScreenOptionsSounds',
      'GuiVideoSettings',
      'GuiControls',
      'GuiLanguage',
      'GuiScreenChatOptions',
      'GuiScreenResourcePacks',
      'GuiScreenSnooper',
      'GuiCustomizeSkin',
      'GuiShareToLan',
      'GuiAchievements',
      'GuiStats',
      'GuiInventory',
      'GuiChat',
    ];

    const mainMenuSequence = [
      'GuiSelectWorld',
      'GuiCreateWorld',
      'GuiMultiplayer',
      'GuiOptions',
      'GuiScreenOptionsSounds',
      'GuiVideoSettings',
      'GuiControls',
      'GuiLanguage',
      'GuiScreenChatOptions',
      'GuiScreenResourcePacks',
      'GuiScreenSnooper',
      'GuiCustomizeSkin',
    ];

    const seq = isWorld ? inGameSequence : mainMenuSequence;
    for (const s of seq) {
      if (this.db.screens[s]) {
        screensToVisit.push(s);
      }
    }

    if (isWorld) {
      // Add any remaining screens in db that have transitions
      for (const s of Object.keys(this.db.screens)) {
        if (
          s === 'InGame' ||
          s === 'Exit' ||
          s === 'GuiGameOver' ||
          s === 'GuiDisconnected' ||
          s === 'ParentScreen'
        ) {
          continue;
        }
        if (!screensToVisit.includes(s)) {
          screensToVisit.push(s);
        }
      }
    }

    return screensToVisit;
  }

  /**
   * Crawl all reachable screens, extract their classes, and return cleanly to InGame.
   */
  public async crawlAllScreens(options?: {
    targets?: string[];
    onProgress?: (msg: string) => void;
    sleepBetweenMs?: number;
  }): Promise<GuiCrawlResult> {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const onProgress = options?.onProgress || (() => {});
    const delay = options?.sleepBetweenMs ?? 600;

    const visitedScreens: string[] = [];
    const failedScreens: string[] = [];
    const discovered: Record<string, DiscoveredGuiScreen> = {};

    // 1. Detect starting screen
    let initialScreen = 'InGame';
    try {
      const g = await api.inspectGui({ includePool: false });
      initialScreen = resolveSimpleScreenName(
        {
          screenName: g.screenName,
          canonicalClass: g.canonicalClass,
          realClassName: g.realClassName,
          playerLoaded: g.playerLoaded,
          buttons: g.buttons,
        },
        this.db,
      );
    } catch {}

    onProgress(
      `[GuiCrawler] Starting crawl from current screen: ${initialScreen}`,
    );

    if (initialScreen && initialScreen !== 'InGame') {
      try {
        const initProbe = await this.probeCurrentScreen();
        if (initProbe && initProbe.hasScreen && initProbe.realClassName) {
          discovered[initialScreen] = {
            simpleName: initialScreen,
            realClassName: initProbe.realClassName,
            superclass: initProbe.superclass,
            fields: initProbe.fields || [],
            methods: initProbe.methods || [],
            buttons: initProbe.buttons || [],
            discoveredAt: new Date().toISOString(),
          };
          registerDiscoveredMapping(initProbe.realClassName, initialScreen);
          onProgress(
            `[GuiCrawler] ✓ Initial screen mapped: ${initialScreen} -> obf: "${initProbe.realClassName}" (${(initProbe.buttons || []).length} buttons)`,
          );
        }
      } catch {}
    }

    const targets =
      options?.targets && options.targets.length > 0
        ? options.targets
        : this.getReachableScreens(initialScreen);

    onProgress(
      `[GuiCrawler] Total screens queued for discovery: ${targets.length} (${targets.join(', ')})`,
    );

    try {
      for (let i = 0; i < targets.length; i++) {
        const targetScreen = targets[i];
        if (!targetScreen) continue;
        onProgress(
          `\n[GuiCrawler] [${i + 1}/${targets.length}] Navigating to: ${targetScreen}...`,
        );

        const navRes = await guiNavigator.navigateTo(targetScreen, (m) =>
          onProgress(`  > ${m}`),
        );
        await sleep(delay);

        if (!navRes.success) {
          onProgress(
            `[GuiCrawler] ⚠️ Failed to reach ${targetScreen}: ${navRes.message}`,
          );
          failedScreens.push(targetScreen);
          continue;
        }

        // Screen reached, probe JVM reflection
        const probe = await this.probeCurrentScreen();
        if (probe && probe.hasScreen && probe.realClassName) {
          const disc: DiscoveredGuiScreen = {
            simpleName: targetScreen,
            realClassName: probe.realClassName,
            superclass: probe.superclass,
            fields: probe.fields || [],
            methods: probe.methods || [],
            buttons: probe.buttons || [],
            discoveredAt: new Date().toISOString(),
          };
          discovered[targetScreen] = disc;
          visitedScreens.push(targetScreen);
          if (disc.realClassName) {
            registerDiscoveredMapping(disc.realClassName, targetScreen);
          }
          onProgress(
            `[GuiCrawler] ✓ Discovered ${targetScreen} -> obf: "${disc.realClassName}" (${disc.fields.length} fields, ${disc.methods.length} methods, ${disc.buttons.length} buttons)`,
          );
        } else {
          // Fallback to inspectGui
          const guiInfo = await api.inspectGui({ includePool: true });
          const obf =
            guiInfo.realClassName || guiInfo.screenName || targetScreen;
          if (obf) {
            registerDiscoveredMapping(obf, targetScreen);
          }
          discovered[targetScreen] = {
            simpleName: targetScreen,
            realClassName: obf,
            superclass: 'GuiScreen',
            fields: [],
            methods: [],
            buttons: guiInfo.buttons || [],
            discoveredAt: new Date().toISOString(),
          };
          visitedScreens.push(targetScreen);
          onProgress(
            `[GuiCrawler] ✓ Fallback registered ${targetScreen} -> obf: "${obf}"`,
          );
        }
      }
    } finally {
      // 2. Guaranteed safe return to gameplay / starting state
      onProgress(
        `\n[GuiCrawler] Crawl completed. Returning safely to ${initialScreen === 'InGame' ? 'InGame' : initialScreen}...`,
      );
      try {
        await guiNavigator.navigateTo(initialScreen, (m) =>
          onProgress(`  > ${m}`),
        );
      } catch (err: any) {
        onProgress(
          `[GuiCrawler] Return navigation error: ${err.message || err}`,
        );
      }
    }

    return {
      success: visitedScreens.length > 0,
      initialScreen,
      visitedScreens,
      failedScreens,
      discovered,
    };
  }
}

export const guiCrawler = new GuiCrawler();
export default guiCrawler;
