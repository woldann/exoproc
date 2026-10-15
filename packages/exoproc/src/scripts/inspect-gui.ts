/**
 * Inspect the currently active GUI screen and player state
 */

try {
  // 1. Resolve Minecraft instance
  let mc: any = null;
  if (typeof (globalThis as any).mc !== 'undefined' && (globalThis as any).mc) {
    mc = (globalThis as any).mc;
  }
  if (!mc && typeof Java !== 'undefined' && Java.type) {
    try {
      const mcCls = Java.type('net.minecraft.client.Minecraft');
      mc =
        mcCls.theMinecraft ||
        (typeof mcCls.getMinecraft === 'function'
          ? mcCls.getMinecraft()
          : null);
    } catch (e) {}
    if (!mc) {
      try {
        const ave = Java.type('ave');
        mc = ave.S || (typeof ave.A === 'function' ? ave.A() : null);
      } catch (e) {}
    }
  }

  // 2. Resolve Player state
  const player = mc ? mc.thePlayer || mc.h : null;
  if (
    player &&
    (player.$ptr || player.$address || typeof player.getClass === 'function')
  ) {
    const px = player.posX !== undefined ? Number(player.posX) : 0;
    const py = player.posY !== undefined ? Number(player.posY) : 0;
    const pz = player.posZ !== undefined ? Number(player.posZ) : 0;
    print(`RESULT:PLAYER|true|${px}|${py}|${pz}`);
  } else {
    print('RESULT:PLAYER|false|0|0|0');
  }

  // 3. Resolve Current Screen
  const currentScreen = mc ? mc.currentScreen || mc.m : null;
  if (
    !currentScreen ||
    (!currentScreen.$ptr &&
      !currentScreen.$address &&
      typeof currentScreen.getClass !== 'function')
  ) {
    print('RESULT:NO_SCREEN');
    print(
      'RESULT:INSPECT_GUI|' +
        JSON.stringify({
          name: 'None',
          obfuscatedClass: '',
          canonicalClass: 'null',
          buttons: [],
        }),
    );
  } else {
    let realClass = '';
    const scrPtr = currentScreen.$ptr || currentScreen.$address;
    if (
      typeof Java !== 'undefined' &&
      Java.bridge?.getObjectClassNameSync &&
      scrPtr
    ) {
      try {
        realClass = Java.bridge.getObjectClassNameSync(BigInt(scrPtr));
      } catch (e) {}
    }
    if (!realClass) {
      realClass =
        (typeof currentScreen.getClass === 'function'
          ? currentScreen.getClass().getName()
          : '') ||
        currentScreen.$className ||
        'GuiScreen';
    }
    const deobfClass =
      typeof Java !== 'undefined' && Java.mapper
        ? Java.mapper.resolveDeobfClass(realClass)
        : realClass;
    const simpleName = deobfClass.includes('.')
      ? deobfClass.split('.').pop()!
      : deobfClass;
    const canonicalClass = deobfClass.includes('.')
      ? deobfClass
      : `net.minecraft.client.gui.${deobfClass}`;
    const superclass = 'GuiScreen';

    print(
      `RESULT:SCREEN|${simpleName}|${canonicalClass}|${realClass}|${superclass}`,
    );

    // Buttons
    const buttonList = currentScreen.buttonList || currentScreen.n || [];
    const count = buttonList
      ? typeof buttonList.size === 'function'
        ? buttonList.size()
        : buttonList.length || 0
      : 0;
    const buttons: Array<{
      id: number;
      text: string;
      enabled: boolean;
      visible: boolean;
      x: number;
      y: number;
      realClass?: string;
    }> = [];

    print(`RESULT:BUTTONS_COUNT|${count}`);

    for (let i = 0; i < count; i++) {
      const b =
        typeof buttonList.get === 'function'
          ? buttonList.get(i)
          : buttonList[i];
      if (!b) continue;

      const bid =
        typeof b.id === 'number' ? b.id : typeof b.k === 'number' ? b.k : i;
      let btext =
        typeof b.displayString === 'string'
          ? b.displayString
          : typeof b.j === 'string'
            ? b.j
            : '';
      const ben =
        typeof b.enabled === 'boolean'
          ? b.enabled
          : typeof b.l === 'boolean'
            ? b.l
            : true;
      const bvis =
        typeof b.visible === 'boolean'
          ? b.visible
          : typeof b.m === 'boolean'
            ? b.m
            : true;
      const bx =
        typeof b.xPosition === 'number'
          ? b.xPosition
          : typeof b.h === 'number'
            ? b.h
            : 0;
      const by =
        typeof b.yPosition === 'number'
          ? b.yPosition
          : typeof b.i === 'number'
            ? b.i
            : 0;
      let bcls = '';
      const bPtr = b.$ptr || b.$address;
      if (
        typeof Java !== 'undefined' &&
        Java.bridge?.getObjectClassNameSync &&
        bPtr
      ) {
        try {
          bcls = Java.bridge.getObjectClassNameSync(BigInt(bPtr));
        } catch (e) {}
      }
      if (!bcls) {
        bcls =
          b.$className ||
          (typeof b.getClass === 'function' ? b.getClass().getName() : '') ||
          '';
      }

      if (!btext && bcls) {
        if (bcls.includes('Language') || bcls === 'avz') btext = 'Language...';
        else if (bcls.includes('Lock') || bcls === 'awc') btext = 'Lock';
      }

      buttons.push({
        id: bid,
        text: btext.trim(),
        enabled: ben,
        visible: bvis,
        x: bx,
        y: by,
        realClass: bcls,
      });

      print(
        `RESULT:BTN|${bid}|${btext.trim()}|${ben}|${bvis}|${bx}|${by}|${bcls}`,
      );
    }

    print(
      'RESULT:INSPECT_GUI|' +
        JSON.stringify({
          name: simpleName,
          obfuscatedClass: realClass,
          canonicalClass,
          buttons,
        }),
    );
  }
} catch (error) {
  print('RESULT:INSPECT_GUI|ERROR:' + String(error));
}
