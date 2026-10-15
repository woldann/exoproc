/**
 * Shared GUI and Screen Utilities for Remote Scripts
 * Inlined into standalone bundles at build time
 */

export interface ButtonInfo {
  index: number;
  id: number;
  displayString: string;
  enabled: boolean;
  visible: boolean;
  x: number;
  y: number;
  realClassName?: string;
}

export interface ScreenInfo {
  hasScreen: boolean;
  simpleName: string;
  canonicalClass: string;
  realClassName: string;
  superclassName?: string;
  screenProxy: any;
  buttons: ButtonInfo[];
  buttonCount: number;
}

export interface ClickResult {
  success: boolean;
  id?: number;
  text?: string;
  error?: string;
  button?: ButtonInfo;
}

/**
 * Resolves the active Minecraft client instance canonically
 */
export function getMinecraft(): any {
  if (
    typeof (globalThis as any).rawMc !== 'undefined' &&
    (globalThis as any).rawMc
  )
    return (globalThis as any).rawMc;
  if (typeof mc !== 'undefined' && mc) {
    if (
      mc.$ptr ||
      mc.$address ||
      mc.$class ||
      mc.thePlayer !== undefined ||
      mc.h !== undefined
    )
      return mc;
  }
  if (typeof Java !== 'undefined' && (Java as any).Minecraft)
    return (Java as any).Minecraft;
  if (typeof Java !== 'undefined' && (Java as any).theMinecraft)
    return (Java as any).theMinecraft;
  if (typeof Java !== 'undefined' && Java.type) {
    try {
      const MC = Java.type('net.minecraft.client.Minecraft');
      if (MC) {
        if (typeof MC.getMinecraft === 'function') {
          const res = MC.getMinecraft();
          if (res) return res;
        }
        if (typeof MC.getInstance === 'function') {
          const res = MC.getInstance();
          if (res) return res;
        }
        if (MC.theMinecraft && typeof MC.theMinecraft !== 'function')
          return MC.theMinecraft;
      }
    } catch (e) {}
    try {
      const ave = Java.type('ave');
      if (ave) {
        const res = ave.S || (typeof ave.A === 'function' ? ave.A() : null);
        if (res) return res;
      }
    } catch (e) {}
  }
  return null;
}

/**
 * Disables pauseOnLostFocus so that returning to live gameplay
 * in headless/background mode does not auto-open GuiIngameMenu.
 */
export function disablePauseOnLostFocus(mc?: any): boolean {
  try {
    const mcInst = mc || getMinecraft();
    if (mcInst && mcInst.gameSettings) {
      mcInst.gameSettings.pauseOnLostFocus = false;
      return true;
    }
  } catch (e) {}
  return false;
}

/**
 * Inspects the currently active Minecraft GUI screen and its buttons canonically
 */
export async function getScreenInfo(mc?: any): Promise<ScreenInfo> {
  const mcInst = mc || getMinecraft();
  const scr = mcInst ? mcInst.currentScreen : null;
  if (
    !scr ||
    (!scr.$ptr && !scr.$address && typeof scr.getClass !== 'function')
  ) {
    return {
      hasScreen: false,
      simpleName: 'None',
      canonicalClass: 'null',
      realClassName: '',
      superclassName: undefined,
      screenProxy: null,
      buttons: [],
      buttonCount: 0,
    };
  }

  // 1. Determine real runtime class name
  let realClassName = '';
  const ptr = scr.$ptr || scr.$address;
  if (
    typeof Java !== 'undefined' &&
    Java.bridge?.getObjectClassNameSync &&
    ptr
  ) {
    try {
      realClassName = Java.bridge.getObjectClassNameSync(ptr);
    } catch (e) {}
  }
  if (!realClassName && scr.$realClassName) {
    realClassName = scr.$realClassName;
  }
  if (!realClassName) {
    if (scr.$class?.name && scr.$class.name !== 'GuiScreen') {
      realClassName = scr.$class.name;
    } else if (typeof scr.getClass === 'function') {
      try {
        const clsObj = scr.getClass();
        const nm = clsObj.getName
          ? clsObj.getName()
          : clsObj.name || clsObj.$className || '';
        if (nm && nm !== 'GuiScreen') realClassName = nm;
      } catch (e) {}
    }
  }
  if (!realClassName) {
    realClassName = scr.$class?.name || scr.$className || 'GuiScreen';
  }

  // 2. Resolve deobfuscation, canonical full package, and simple name
  let canonicalClass = realClassName;
  let simpleName = realClassName.includes('.')
    ? realClassName.split('.').pop()!
    : realClassName;

  if (typeof Java !== 'undefined') {
    const deobf =
      Java.mapper?.resolveDeobfClass?.(realClassName) || realClassName;
    const poolInfo =
      Java.detector?.classPool?.get?.(realClassName) ||
      (deobf ? Java.detector?.classPool?.get?.(deobf) : null);
    const db = Java.mapper?.database || Java.mapper?.getDatabase?.();
    const schema = db?.[deobf] || db?.[realClassName] || poolInfo?.schema;

    if (poolInfo?.canonicalClassName) {
      canonicalClass = poolInfo.canonicalClassName;
    } else if (schema?.canonicalClassName) {
      canonicalClass = schema.canonicalClassName;
    } else if (deobf.includes('.')) {
      canonicalClass = deobf;
    } else if (deobf && deobf !== realClassName) {
      canonicalClass = `net.minecraft.client.gui.${deobf}`;
    }

    if (poolInfo?.simpleName) {
      simpleName = poolInfo.simpleName;
    } else if (deobf && deobf !== realClassName) {
      simpleName = deobf.includes('.') ? deobf.split('.').pop()! : deobf;
    }
  }

  // 3. Resolve superclass name
  let superclassName = 'GuiScreen';
  if (typeof Java !== 'undefined') {
    const db = Java.mapper?.database || Java.mapper?.getDatabase?.();
    const dbEntry = db?.[simpleName] || db?.[canonicalClass];
    const dbSuper = dbEntry?.superclass || 'GuiScreen';
    const dbSuperObf =
      Java.detector?.canonicalToObf?.get?.(dbSuper) ||
      (Java.mapper?.resolveObfClass
        ? Java.mapper.resolveObfClass(dbSuper)
        : null);
    superclassName =
      dbSuperObf && dbSuperObf !== dbSuper
        ? `${dbSuper} (${dbSuperObf})`
        : dbSuper;
  }

  const list = scr.buttonList;
  const count = list
    ? typeof list.size === 'function'
      ? list.size()
      : list.length || 0
    : 0;
  const buttons: ButtonInfo[] = [];

  for (let i = 0; i < count; i++) {
    const b = typeof list.get === 'function' ? list.get(i) : list[i];
    if (!b) continue;

    const id =
      typeof b.id === 'number' ? b.id : typeof b.k === 'number' ? b.k : i;
    const rawText =
      (typeof b.displayString === 'string'
        ? b.displayString
        : typeof b.j === 'string'
          ? b.j
          : typeof b.displayString === 'object'
            ? ''
            : b.displayString) ?? '';
    let displayString = (
      typeof rawText === 'string' ? rawText : String(rawText || '')
    ).trim();

    const enabled =
      typeof b.enabled === 'boolean'
        ? b.enabled
        : typeof b.l === 'boolean'
          ? b.l
          : true;
    const visible =
      typeof b.visible === 'boolean'
        ? b.visible
        : typeof b.m === 'boolean'
          ? b.m
          : true;
    const x =
      typeof b.xPosition === 'number'
        ? b.xPosition
        : typeof b.h === 'number'
          ? b.h
          : typeof b.x === 'number'
            ? b.x
            : 0;
    const y =
      typeof b.yPosition === 'number'
        ? b.yPosition
        : typeof b.i === 'number'
          ? b.i
          : typeof b.y === 'number'
            ? b.y
            : 0;

    let realBtnClass = b.$className || b.$class?.name || 'GuiButton';
    if (typeof b.getClass === 'function') {
      try {
        const clsName = b.getClass().getName();
        if (clsName) realBtnClass = clsName;
      } catch (e) {}
    }

    // Resolve deobfuscation for button class if available
    let deobfBtnClass = realBtnClass;
    if (typeof Java !== 'undefined') {
      const deobf = Java.mapper?.resolveDeobfClass?.(realBtnClass);
      if (deobf) deobfBtnClass = deobf;
    }

    // Semantic label inference for icon-only / text-less buttons
    if (!displayString) {
      if (
        deobfBtnClass.includes('Language') ||
        realBtnClass.includes('Language')
      ) {
        displayString = 'Language...';
      } else if (
        deobfBtnClass.includes('Lock') ||
        realBtnClass.includes('Lock')
      ) {
        displayString = 'Lock';
      }
    }

    buttons.push({
      index: i,
      id,
      displayString,
      enabled,
      visible,
      x,
      y,
      realClassName:
        deobfBtnClass !== realBtnClass ? deobfBtnClass : realBtnClass,
    });
  }

  return {
    hasScreen: true,
    simpleName,
    canonicalClass,
    realClassName,
    superclassName,
    screenProxy: scr,
    buttons,
    buttonCount: count,
  };
}

/**
 * Finds a button by either numeric ID or substring matching on label text
 */
export function findButton(
  buttons: ButtonInfo[],
  target: string | number,
): ButtonInfo | null {
  const rawTarget = typeof target !== 'undefined' ? String(target).trim() : '';
  const numericTarget = parseInt(rawTarget, 10);
  const isNumeric =
    !isNaN(numericTarget) && String(numericTarget) === rawTarget;

  // 1. Exact numeric match
  if (isNumeric) {
    for (const b of buttons) {
      if (b.id === numericTarget) return b;
    }
  }

  // 2. Exact text match (case-insensitive)
  const targetLower = rawTarget.toLowerCase();
  for (const b of buttons) {
    const btnText = (b.displayString || '').trim();
    if (btnText.toLowerCase() === targetLower) return b;
  }

  // 3. Substring / trimmed ellipsis match (case-insensitive)
  const cleanTarget = targetLower.replace(/\.+$/, '').trim();
  for (const b of buttons) {
    const cleanBtn = (b.displayString || '')
      .toLowerCase()
      .replace(/\.+$/, '')
      .trim();
    if (
      cleanBtn &&
      cleanTarget &&
      (cleanBtn.includes(cleanTarget) || cleanTarget.includes(cleanBtn))
    ) {
      return b;
    }
  }

  // 4. Semantic class fallback for icon buttons
  if (cleanTarget === 'language') {
    for (const b of buttons) {
      const cls = (b.realClassName || '').toLowerCase();
      if (cls.includes('language')) return b;
    }
  }
  if (cleanTarget === 'lock') {
    for (const b of buttons) {
      const cls = (b.realClassName || '').toLowerCase();
      if (cls.includes('lock')) return b;
    }
  }

  return null;
}

/**
 * Dispatches a button click via NJava proxy on the Minecraft main thread using Java.runOn(mc, ...)
 */
export async function directClickButton(
  scr: any,
  targetBtn: any,
): Promise<{ success: boolean; error?: string }> {
  try {
    const mc = getMinecraft();
    const execute = async () => {
      // 1. If deobfuscation mapped 'actionPerformed' onto the screen proxy
      if (typeof scr.actionPerformed === 'function') {
        try {
          await scr.actionPerformed(targetBtn);
          return { success: true };
        } catch (e) {}
      }

      // 2. Discover actionPerformed via scr.$class reflection
      const scrCls = scr.$class?.$class || scr.$class;
      if (scrCls) {
        const methods = scrCls.getAllMethodsSync
          ? scrCls.getAllMethodsSync()
          : await scrCls.getAllMethods().catch(() => []);
        const btnClsName =
          targetBtn?.$realClassName || targetBtn?.$className || '';
        const actionMethod = methods.find((m: any) => {
          if (
            m.isStatic ||
            (m.returnType !== 'void' && m.returnType !== 'V') ||
            m.paramTypes?.length !== 1
          ) {
            return false;
          }
          if (m.name === 'actionPerformed') return true;
          const pType = m.paramTypes[0];
          return (
            pType.includes('GuiButton') ||
            pType.includes('Button') ||
            (btnClsName && pType === btnClsName)
          );
        });

        if (actionMethod) {
          if (typeof scr[actionMethod.name] === 'function') {
            await scr[actionMethod.name](targetBtn);
            return { success: true };
          }
          if (typeof actionMethod.invokeSync === 'function') {
            actionMethod.invokeSync(scr.$ptr || scr.$address, [
              targetBtn.$ptr || targetBtn.$address,
            ]);
            return { success: true };
          }
          if (typeof actionMethod.invoke === 'function') {
            await actionMethod.invoke(scr.$ptr || scr.$address, [
              targetBtn.$ptr || targetBtn.$address,
            ]);
            return { success: true };
          }
        }
      }

      return {
        success: false,
        error: 'actionPerformed method not found on Screen class',
      };
    };

    return await execute();
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Closes current screen directly via displayGuiScreen(null) on the Minecraft main thread
 */
export async function directCloseScreen(
  mc: any,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!mc) return { success: true };
    const scr = mc.currentScreen;
    if (
      !scr ||
      (!scr.$ptr && !scr.$address && typeof scr.getClass !== 'function')
    ) {
      return { success: true };
    }

    const execute = async () => {
      // 1. Try mapped displayGuiScreen
      if (typeof mc.displayGuiScreen === 'function') {
        try {
          await mc.displayGuiScreen(null);
          return { success: true };
        } catch (e) {}
      }

      // 2. Discover displayGuiScreen via mc.$class reflection
      const mcCls = mc.$class?.$class || mc.$class;
      if (mcCls) {
        const methods = mcCls.getAllMethodsSync
          ? mcCls.getAllMethodsSync()
          : await mcCls.getAllMethods().catch(() => []);
        const dispMethod = methods.find(
          (m: any) =>
            !m.isStatic &&
            (m.returnType === 'void' || m.returnType === 'V') &&
            m.paramTypes?.length === 1 &&
            (m.name === 'displayGuiScreen' ||
              m.paramTypes[0].includes('GuiScreen') ||
              m.paramTypes[0].includes('Screen')),
        );

        if (dispMethod) {
          if (typeof mc[dispMethod.name] === 'function') {
            await mc[dispMethod.name](null);
            return { success: true };
          }
          if (typeof dispMethod.invokeSync === 'function') {
            dispMethod.invokeSync(mc.$ptr || mc.$address, [0n]);
            return { success: true };
          }
          if (typeof dispMethod.invoke === 'function') {
            await dispMethod.invoke(mc.$ptr || mc.$address, [0n]);
            return { success: true };
          }
        }
      }

      return {
        success: false,
        error: 'displayGuiScreen method not found on Minecraft instance',
      };
    };

    return await execute();
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Clicks a button on the active GUI screen by ID or label
 */
export async function clickButton(target: any): Promise<ClickResult> {
  let targetIndex = -1;
  let targetId: number | null = null;
  let targetText = '';

  if (typeof target === 'object' && target !== null) {
    if (typeof target.index === 'number') targetIndex = target.index;
    if (typeof target.id === 'number') targetId = target.id;
    if (typeof target.text === 'string') targetText = target.text.trim();
  } else if (typeof target === 'number') {
    targetId = target;
  } else if (typeof target !== 'undefined') {
    const s = String(target).trim();
    const num = parseInt(s, 10);
    if (!isNaN(num) && String(num) === s) {
      targetId = num;
    } else {
      targetText = s;
    }
  }

  const mc = getMinecraft();
  disablePauseOnLostFocus(mc);

  const scr = mc ? mc.currentScreen : null;
  if (
    !scr ||
    (!scr.$ptr && !scr.$address && typeof scr.getClass !== 'function')
  ) {
    return { success: false, error: 'No active GUI screen' };
  }

  const list = scr.buttonList;
  const count = list
    ? typeof list.size === 'function'
      ? list.size()
      : list.length || 0
    : 0;
  if (count === 0) {
    return { success: false, error: 'No buttons found on this screen' };
  }

  let targetBtn: any = null;
  let clickedId = 0;
  let clickedText = '';

  // Direct index match if targetIndex is within bounds
  if (targetIndex >= 0 && targetIndex < count) {
    const b =
      typeof list.get === 'function'
        ? list.get(targetIndex)
        : list[targetIndex];
    if (b) {
      const realId =
        typeof b.id === 'number' ? b.id : typeof b.k === 'number' ? b.k : null;
      const bid = realId ?? targetIndex;
      const rawText =
        (typeof b.displayString === 'string'
          ? b.displayString
          : typeof b.j === 'string'
            ? b.j
            : typeof b.displayString === 'object'
              ? ''
              : b.displayString) ?? '';
      const bText = (
        typeof rawText === 'string' ? rawText : String(rawText || '')
      ).trim();
      const bEnabled =
        typeof b.enabled === 'boolean'
          ? b.enabled
          : typeof b.l === 'boolean'
            ? b.l
            : true;
      if (!bEnabled) {
        return {
          success: false,
          error: `Button [${bid}] "${bText}" is currently disabled`,
        };
      }
      targetBtn = b;
      clickedId = bid;
      clickedText = bText;
    }
  }

  // Search by targetId or targetText if not resolved yet
  if (!targetBtn) {
    // Pass 1: exact match on real Minecraft button ID or text
    for (let i = 0; i < count; i++) {
      const b = typeof list.get === 'function' ? list.get(i) : list[i];
      if (!b) continue;
      const realId =
        typeof b.id === 'number' ? b.id : typeof b.k === 'number' ? b.k : null;
      const bid = realId ?? i;
      const rawText =
        (typeof b.displayString === 'string'
          ? b.displayString
          : typeof b.j === 'string'
            ? b.j
            : typeof b.displayString === 'object'
              ? ''
              : b.displayString) ?? '';
      const bText = (
        typeof rawText === 'string' ? rawText : String(rawText || '')
      ).trim();
      const bEnabled =
        typeof b.enabled === 'boolean'
          ? b.enabled
          : typeof b.l === 'boolean'
            ? b.l
            : true;

      const matchesRealId =
        targetId !== null && realId !== null && realId === targetId;
      const matchesText =
        targetText && bText.toLowerCase().includes(targetText.toLowerCase());

      if (matchesRealId || matchesText) {
        if (!bEnabled) {
          return {
            success: false,
            error: `Button [${bid}] "${bText}" is currently disabled`,
          };
        }
        targetBtn = b;
        clickedId = bid;
        clickedText = bText;
        break;
      }
    }

    // Pass 2: fallback to index match if targetId did not match any real button ID
    if (!targetBtn && targetId !== null && targetId >= 0 && targetId < count) {
      const b =
        typeof list.get === 'function' ? list.get(targetId) : list[targetId];
      if (b) {
        const realId =
          typeof b.id === 'number'
            ? b.id
            : typeof b.k === 'number'
              ? b.k
              : null;
        const bid = realId ?? targetId;
        const rawText =
          (typeof b.displayString === 'string'
            ? b.displayString
            : typeof b.j === 'string'
              ? b.j
              : typeof b.displayString === 'object'
                ? ''
                : b.displayString) ?? '';
        const bText = (
          typeof rawText === 'string' ? rawText : String(rawText || '')
        ).trim();
        const bEnabled =
          typeof b.enabled === 'boolean'
            ? b.enabled
            : typeof b.l === 'boolean'
              ? b.l
              : true;
        if (!bEnabled) {
          return {
            success: false,
            error: `Button [${bid}] "${bText}" is currently disabled`,
          };
        }
        targetBtn = b;
        clickedId = bid;
        clickedText = bText;
      }
    }
  }

  if (!targetBtn) {
    return {
      success: false,
      error: `Button matching "${JSON.stringify(target)}" not found on this screen`,
    };
  }

  const dispatchRes = await directClickButton(scr, targetBtn);
  if (!dispatchRes.success) {
    return { success: false, error: dispatchRes.error };
  }

  return {
    success: true,
    id: clickedId,
    text: clickedText,
  };
}

/**
 * Closes the currently active GUI screen and returns to in-game HUD
 */
export async function closeScreen(): Promise<{
  success: boolean;
  error?: string;
}> {
  const mc = getMinecraft();
  disablePauseOnLostFocus(mc);
  return directCloseScreen(mc);
}
