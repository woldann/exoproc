/**
 * Click a button in the current GUI screen
 * TARGET_BUTTON or __buttonId__ is passed as parameter
 */

try {
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

  const currentScreen = mc ? mc.currentScreen || mc.m : null;
  const buttonList = currentScreen
    ? currentScreen.buttonList || currentScreen.n || []
    : [];
  const count = buttonList
    ? typeof buttonList.size === 'function'
      ? buttonList.size()
      : buttonList.length || 0
    : 0;

  if (!currentScreen || count === 0) {
    const errRes = JSON.stringify({
      success: false,
      error: 'No active screen open or no buttons present',
      message: 'No active screen open or no buttons present',
    });
    print('RESULT:CLICK|' + errRes);
    print('RESULT:CLICK_BUTTON|' + errRes);
  } else {
    // Resolve target parameter
    let target: any = undefined;
    try {
      if (typeof TARGET_BUTTON !== 'undefined') target = TARGET_BUTTON;
    } catch (e) {}
    if (typeof target === 'undefined') {
      try {
        if (typeof __buttonId__ !== 'undefined') target = __buttonId__;
      } catch (e) {}
    }

    let targetBtn: any = null;
    let targetIndex = -1;
    let targetId = -1;
    let targetText = '';

    const targetNum =
      typeof target === 'number' ? target : parseInt(String(target), 10);
    const hasTargetNum = !isNaN(targetNum);
    const targetStr =
      typeof target === 'string'
        ? target.trim().toLowerCase()
        : typeof target === 'object' && target?.text
          ? String(target.text).trim().toLowerCase()
          : '';

    // Search for button in buttonList
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
      const bcls =
        b.$className ||
        (typeof b.getClass === 'function' ? b.getClass().getName() : '') ||
        '';

      if (!btext && bcls) {
        if (bcls.includes('Language') || bcls === 'avz') btext = 'Language...';
        else if (bcls.includes('Lock') || bcls === 'awc') btext = 'Lock';
      }

      // Check numeric match (ID or Index)
      if (
        hasTargetNum &&
        (bid === targetNum ||
          i === targetNum ||
          (typeof target === 'object' &&
            (target.id === bid || target.index === i)))
      ) {
        targetBtn = b;
        targetIndex = i;
        targetId = bid;
        targetText = btext;
        break;
      }

      // Check text match (case-insensitive substring)
      if (
        targetStr &&
        (btext.toLowerCase().includes(targetStr) ||
          targetStr.includes(btext.toLowerCase()))
      ) {
        targetBtn = b;
        targetIndex = i;
        targetId = bid;
        targetText = btext;
        break;
      }
    }

    if (!targetBtn) {
      const notFoundRes = JSON.stringify({
        success: false,
        error: `Button matching "${JSON.stringify(target)}" not found among ${count} buttons`,
        message: `Button matching "${JSON.stringify(target)}" not found among ${count} buttons`,
      });
      print('RESULT:CLICK|' + notFoundRes);
      print('RESULT:CLICK_BUTTON|' + notFoundRes);
    } else {
      // Invoke actionPerformed
      let invoked = false;
      let actionErr: any = null;

      const doAction = () => {
        try {
          if (typeof currentScreen.actionPerformed === 'function') {
            currentScreen.actionPerformed(targetBtn);
            invoked = true;
          }
        } catch (e) {
          actionErr = e;
        }

        if (!invoked) {
          try {
            if (typeof currentScreen.a === 'function') {
              currentScreen.a(targetBtn);
              invoked = true;
            }
          } catch (e) {
            actionErr = e;
          }
        }

        if (!invoked && typeof currentScreen.getClass === 'function') {
          try {
            const methods = currentScreen.getClass().getDeclaredMethods();
            for (let m = 0; m < methods.length; m++) {
              const method = methods[m];
              const params = method.getParameterTypes();
              if (
                params.length === 1 &&
                (method.getName() === 'actionPerformed' ||
                  method.getName() === 'a')
              ) {
                method.setAccessible(true);
                method.invoke(currentScreen, [targetBtn]);
                invoked = true;
                break;
              }
            }
          } catch (e) {
            actionErr = e;
          }
        }
      };

      if (
        typeof Java !== 'undefined' &&
        typeof Java.runOn === 'function' &&
        mc
      ) {
        try {
          Java.runOn(mc, doAction);
        } catch (e) {
          doAction();
        }
      } else {
        doAction();
      }

      const successRes = JSON.stringify({
        success: true,
        id: targetId,
        text: targetText,
        index: targetIndex,
        message: `Button ${targetId} ("${targetText}") clicked`,
        clickedButton: { id: targetId, text: targetText, index: targetIndex },
      });
      print('RESULT:CLICK|' + successRes);
      print('RESULT:CLICK_BUTTON|' + successRes);
    }
  }
} catch (error) {
  const failRes = JSON.stringify({
    success: false,
    error: String(error),
    message: String(error),
  });
  print('RESULT:CLICK|' + failRes);
  print('RESULT:CLICK_BUTTON|' + failRes);
}
