import type { ReflectionBridge } from 'bun-njava';
import type { MinecraftMappings } from 'exoproc-minecraft';

export type MinecraftGuiType =
  | 'MainMenu'
  | 'SelectWorld'
  | 'CreateWorld'
  | 'IngameMenu'
  | 'Options'
  | 'None'
  | 'Unknown';

export interface GuiNavigationOptions {
  timeoutMs?: number;
  log?: (msg: string) => void;
}

/**
 * Autonomous, dynamic GUI navigator for Minecraft client menus.
 * Designed exclusively for automated testing workflows to guide a freshly launched
 * Minecraft client through menus and into a live singleplayer world.
 *
 * Uses structural inspection to detect GUI screens (MainMenu, SelectWorld, CreateWorld)
 * and dispatches in-memory Java reflection/scheduled tasks without OS-level input simulation.
 */
export class MinecraftGuiNavigator {
  constructor(
    private readonly bridge: ReflectionBridge,
    private readonly Java: any,
    private readonly mappings: MinecraftMappings,
  ) {}

  private async getButtonId(btn: any): Promise<number | undefined> {
    if (!btn) return undefined;
    if (typeof btn.id === 'number') return btn.id;
    const idField = this.mappings.GuiButton?.fields?.id;
    if (idField && typeof btn[idField] === 'number') return btn[idField];
    if (btn.$ptr && this.mappings.GuiButton?.realClassName && idField) {
      try {
        const cls = await this.bridge.getClass(
          this.mappings.GuiButton.realClassName,
        );
        const val = await this.bridge.readField(
          cls.classObj,
          idField,
          btn.$ptr,
        );
        return Number(val);
      } catch {}
    }
    return undefined;
  }

  /**
   * Identifies the type of the given GuiScreen object dynamically.
   */
  public async detectScreenType(screen: any): Promise<MinecraftGuiType> {
    if (!screen || screen === 0n || typeof screen !== 'object') {
      return 'None';
    }

    const rawHandle = screen.$ptr ?? screen;

    // 1. Direct class name check (fastest and 100% reliable)
    try {
      const className = await this.bridge.getObjectClassName(rawHandle);
      if (className === 'aya' || className.endsWith('GuiMainMenu')) {
        return 'MainMenu';
      }
      if (className === 'axv' || className.endsWith('GuiSelectWorld')) {
        return 'SelectWorld';
      }
      if (className === 'axb' || className.endsWith('GuiCreateWorld')) {
        return 'CreateWorld';
      }
      if (className === 'axp' || className.endsWith('GuiIngameMenu')) {
        return 'IngameMenu';
      }
      if (className === 'axn' || className.endsWith('GuiOptions')) {
        return 'Options';
      }
    } catch {}

    // 2. Inspect buttonList on the screen
    const buttonListField =
      this.mappings.GuiScreen?.fields?.buttonList ?? 'buttonList';
    const buttonListObj = screen.buttonList ?? screen[buttonListField];
    const buttons: any[] = buttonListObj ? this.Java.from(buttonListObj) : [];

    const buttonIds = new Set<number>();
    for (const btn of buttons) {
      const idVal = await this.getButtonId(btn);
      if (typeof idVal === 'number') {
        buttonIds.add(idVal);
      }
    }

    // 3. Classify by structural button fingerprints fallback
    // GuiOptions buttons: 100 (Controls), 101 (Video), 106 (Sound), 200 (Done)
    if (
      buttonIds.has(200) &&
      (buttonIds.has(100) || buttonIds.has(101) || buttonIds.has(106))
    ) {
      return 'Options';
    }

    // GuiSelectWorld buttons: 3 (Create New World), 1 (Play), 2 (Delete), 6 (Rename), 7 (Recreate), 0 (Cancel)
    if (
      buttonIds.has(3) &&
      (buttonIds.has(6) || buttonIds.has(7) || buttonIds.has(0))
    ) {
      return 'SelectWorld';
    }

    // GuiMainMenu buttons: 1 (Singleplayer), 2 (Multiplayer), 4 (Quit), 0 (Options), 14 (Realms)
    if (
      buttonIds.has(1) &&
      buttonIds.has(2) &&
      !buttonIds.has(3) &&
      !buttonIds.has(6) &&
      !buttonIds.has(7)
    ) {
      return 'MainMenu';
    }

    // GuiCreateWorld buttons: 0 (Create), 1 (Cancel), 2 (Game Mode)
    if (
      buttonIds.has(0) &&
      buttonIds.has(1) &&
      buttonIds.has(2) &&
      !buttonIds.has(6) &&
      !buttonIds.has(7)
    ) {
      return 'CreateWorld';
    }

    // GuiIngameMenu (pause menu): 4 (Back to game), 1 (Save and quit)
    if (
      buttonIds.has(4) &&
      buttonIds.has(1) &&
      !buttonIds.has(2) &&
      !buttonIds.has(3)
    ) {
      return 'IngameMenu';
    }

    return 'Unknown';
  }

  /**
   * Clicks a button on the current screen with the specified button ID.
   */
  public async clickButton(screen: any, targetId: number): Promise<boolean> {
    if (!screen) return false;

    const buttonListField =
      this.mappings.GuiScreen?.fields?.buttonList ?? 'buttonList';
    const buttonListObj = screen.buttonList ?? screen[buttonListField];
    const buttons: any[] = buttonListObj ? this.Java.from(buttonListObj) : [];

    const actionMethodName =
      this.mappings.GuiScreen?.methods?.actionPerformed ?? 'actionPerformed';
    const btnClsName = this.mappings.GuiButton?.realClassName;

    for (const btn of buttons) {
      if (!btn) continue;
      const idVal = await this.getButtonId(btn);
      if (idVal === targetId) {
        const screenPtr = screen.$ptr ?? screen;
        const btnPtr = btn.$ptr ?? btn;

        // 1. Precise reflection on screen runtime class
        try {
          const screenClsName = await this.bridge.getObjectClassName(screenPtr);
          const screenCls = await this.bridge.getClass(screenClsName);
          const allMethods = [
            ...(await screenCls.getDeclaredMethods().catch(() => [])),
            ...(await screenCls.getAllMethods().catch(() => [])),
          ];
          const targetMethod = allMethods.find((m) => {
            if (m.name !== actionMethodName) return false;
            if (m.paramTypes.length !== 1) return false;
            if (btnClsName && m.paramTypes[0] !== btnClsName) return false;
            return true;
          });
          if (targetMethod) {
            await this.bridge.invokeUnboxed(targetMethod.methodObj, screenPtr, [
              btnPtr,
            ]);
            return true;
          }
        } catch {}

        // 2. Precise reflection on GuiScreen class
        if (this.mappings.GuiScreen?.realClassName) {
          try {
            const gsCls = await this.bridge.getClass(
              this.mappings.GuiScreen.realClassName,
            );
            const methods = [
              ...(await gsCls.getDeclaredMethods().catch(() => [])),
              ...(await gsCls.getAllMethods().catch(() => [])),
            ];
            const method = methods.find((m) => {
              if (m.name !== actionMethodName) return false;
              if (m.paramTypes.length !== 1) return false;
              if (btnClsName && m.paramTypes[0] !== btnClsName) return false;
              return true;
            });
            if (method) {
              await this.bridge.invokeUnboxed(method.methodObj, screenPtr, [
                btnPtr,
              ]);
              return true;
            }
          } catch {}
        }

        // 3. Proxy method invocation fallback
        if (typeof screen[actionMethodName] === 'function') {
          try {
            await screen[actionMethodName](btn);
            return true;
          } catch {}
        }
      }
    }

    return false;
  }

  /**
   * Dispatches a button click onto Minecraft's main OpenGL thread (mcThread) via Minecraft.addScheduledTask.
   * This is critical for actions that trigger OpenGL / LWJGL rendering (like GuiCreateWorld button 0).
   */
  public async clickButtonOnMainThread(targetId: number): Promise<boolean> {
    try {
      const ScriptEngineManager = this.Java.type(
        'javax.script.ScriptEngineManager',
      );
      const sem = new ScriptEngineManager();
      const engine = sem.getEngineByName('nashorn');
      if (!engine) return false;

      const mcCls = this.mappings.Minecraft.realClassName;
      const getMc = this.mappings.Minecraft.methods.getMinecraft;
      const curScr = this.mappings.Minecraft.fields.currentScreen;
      const btnList =
        this.mappings.GuiScreen?.fields?.buttonList ?? 'buttonList';
      const actMth =
        this.mappings.GuiScreen?.methods?.actionPerformed ?? 'actionPerformed';
      const btnCls = this.mappings.GuiButton?.realClassName;
      const schedMth =
        this.mappings.Minecraft?.methods?.addScheduledTask ?? 'a';
      const btnIdField = this.mappings.GuiButton?.fields?.id ?? 'k';

      const script = `
        var mc = Java.type('${mcCls}').${getMc}();
        var r = new java.lang.Runnable({
          run: function() {
            var s = mc.${curScr};
            if (!s) return;
            var field = null;
            var c = s.getClass();
            while (c != null) {
              try {
                field = c.getDeclaredField('${btnList}');
                break;
              } catch (e) {}
              c = c.getSuperclass();
            }
            if (!field) return;
            field.setAccessible(true);
            var list = field.get(s);
            var btn = null;
            for (var i = 0; i < list.size(); i++) {
              var b = list.get(i);
              var bid = -99999;
              try { bid = b.${btnIdField}; } catch (e) {}
              if (bid == ${targetId}) { btn = b; break; }
              try { if (b.k == ${targetId}) { btn = b; break; } } catch (e) {}
              try { if (b.id == ${targetId}) { btn = b; break; } } catch (e) {}
            }
            if (!btn) return;

            var act = null;
            c = s.getClass();
            while (c != null) {
              var mths = c.getDeclaredMethods();
              for (var i = 0; i < mths.length; i++) {
                if (mths[i].getName() == '${actMth}' && 
                    mths[i].getParameterTypes().length == 1 &&
                    (!'${btnCls}' || mths[i].getParameterTypes()[0].getName() == '${btnCls}')) {
                  act = mths[i];
                  break;
                }
              }
              if (act) break;
              c = c.getSuperclass();
            }
            if (act) {
              act.setAccessible(true);
              act.invoke(s, btn);
            }
          }
        });
        mc.${schedMth}(r);
      `;

      engine.eval(script);
      return true;
    } catch {
      return false;
    }
  }

  private async isPlayerAndWorldActive(mc: any): Promise<boolean> {
    if (!mc) return false;
    // 1. Check via Java proxy
    try {
      const player = mc.thePlayer;
      const world = mc.theWorld;
      if (
        player?.$ptr &&
        player.$ptr !== 0n &&
        world?.$ptr &&
        world.$ptr !== 0n
      ) {
        return true;
      }
    } catch {}

    // 2. Check via direct raw reflection pointers
    try {
      const mcClsName = this.mappings.Minecraft?.realClassName ?? 'ave';
      const pField = this.mappings.Minecraft?.fields?.thePlayer ?? 'h';
      const wField = this.mappings.Minecraft?.fields?.theWorld ?? 'f';
      const mcRaw = mc.$ptr ?? mc;
      const cls = await this.bridge.getClass(mcClsName);
      const pPtr = await this.bridge.readField(cls.classObj, pField, mcRaw);
      const wPtr = await this.bridge.readField(cls.classObj, wField, mcRaw);
      if (pPtr && pPtr !== 0n && wPtr && wPtr !== 0n) {
        return true;
      }
    } catch {}

    return false;
  }

  /**
   * Automatically guides the client into a singleplayer world.
   * If the player is already inside a world, returns immediately.
   * Otherwise, navigates from MainMenu -> SelectWorld -> CreateWorld -> World Gen.
   */
  public async ensureInWorld(
    mc: any,
    options: GuiNavigationOptions = {},
  ): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 120000;
    const log = options.log ?? console.log;
    const start = Date.now();

    log(
      '[GuiNavigator] Checking if Minecraft player is already in a loaded world...',
    );

    let worldGenTriggered = false;
    let nullScreenCount = 0;

    while (Date.now() - start < timeoutMs) {
      // 1. Check if player and world are already active with valid non-zero native pointers
      if (await this.isPlayerAndWorldActive(mc)) {
        log('[GuiNavigator] ✓ Live player and world confirmed active!');
        return;
      }

      // 2. Inspect currentScreen
      let screen: any;
      try {
        screen = mc.currentScreen;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      if (!screen || !screen.$ptr || screen.$ptr === 0n) {
        // Screen is closed or terrain is generating, check if player & world are ready
        if (await this.isPlayerAndWorldActive(mc)) {
          log('[GuiNavigator] ✓ Singleplayer world loaded and player spawned!');
          return;
        }

        nullScreenCount++;
        if (worldGenTriggered) {
          log(
            `[GuiNavigator] Waiting for terrain generation & player spawn (${nullScreenCount}s)...`,
          );
        }
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      nullScreenCount = 0;

      let guiType: MinecraftGuiType = 'Unknown';
      try {
        guiType = await this.detectScreenType(screen);
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      log(`[GuiNavigator] Current screen detected: ${guiType}`);

      // If we are on Options or any sub-menu with button 200 (Done), click it to back out
      if (guiType === 'Options') {
        log(
          '[GuiNavigator] At Options: Clicking Done (Button 200) to return to MainMenu...',
        );
        const ok = await this.clickButtonOnMainThread(200);
        if (!ok) {
          await this.clickButton(screen, 200);
        }
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      if (guiType === 'MainMenu') {
        log('[GuiNavigator] At MainMenu: Clicking Singleplayer (Button 1)...');
        const ok = await this.clickButtonOnMainThread(1);
        if (!ok) {
          await this.clickButton(screen, 1);
        }
        await new Promise((r) => setTimeout(r, 2500));
        continue;
      }

      if (guiType === 'SelectWorld') {
        log(
          '[GuiNavigator] At SelectWorld: Clicking Create New World (Button 3)...',
        );
        const ok = await this.clickButtonOnMainThread(3);
        if (!ok) {
          await this.clickButton(screen, 3);
        }
        await new Promise((r) => setTimeout(r, 2500));
        continue;
      }

      if (guiType === 'CreateWorld') {
        log(
          '[GuiNavigator] At CreateWorld: Triggering Create (Button 0) on mcThread via in-memory Java scheduled task...',
        );
        worldGenTriggered = true;
        const ok = await this.clickButtonOnMainThread(0);
        if (!ok) {
          await this.clickButton(screen, 0).catch(() => {});
        }
        log(
          '[GuiNavigator] World generation initiated, waiting for terrain load and player spawn...',
        );
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      if (guiType === 'IngameMenu') {
        log('[GuiNavigator] At IngameMenu: Resuming game (Button 4)...');
        const ok = await this.clickButtonOnMainThread(4);
        if (!ok) {
          await this.clickButton(screen, 4);
        }
        await new Promise((r) => setTimeout(r, 1500));
        log('[GuiNavigator] ✓ IngameMenu resumed, live world active!');
        return;
      }

      // Check if this unknown/sub-menu screen has a Done button (id 200) to return
      try {
        const hasDone = await this.clickButtonOnMainThread(200);
        if (hasDone) {
          log('[GuiNavigator] Backed out of submenu via Button 200 (Done)...');
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
      } catch {}

      // Unknown or transitional screen, wait briefly
      await new Promise((r) => setTimeout(r, 1000));
    }

    throw new Error(
      `[GuiNavigator] Timed out waiting for player to load into world after ${timeoutMs}ms`,
    );
  }
}
