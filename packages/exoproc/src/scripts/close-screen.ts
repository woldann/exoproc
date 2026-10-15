/**
 * Close the current GUI screen
 * Closes by calling mc.displayGuiScreen(null)
 */

interface CloseResult {
  success: boolean;
  message?: string;
  error?: string;
}

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

  if (!currentScreen) {
    print(
      'RESULT:CLOSE_SCREEN|' +
        JSON.stringify({
          success: true,
          message: 'No screen was open',
        } as CloseResult),
    );
  } else {
    let closed = false;
    const doClose = () => {
      if (typeof mc.displayGuiScreen === 'function') {
        try {
          mc.displayGuiScreen(null);
          closed = true;
        } catch (e) {
          if (typeof mc.a === 'function') {
            mc.a(null);
            closed = true;
          }
        }
      } else if (typeof mc.a === 'function') {
        mc.a(null);
        closed = true;
      }
    };

    if (typeof Java !== 'undefined' && typeof Java.runOn === 'function' && mc) {
      try {
        Java.runOn(mc, doClose);
      } catch (e) {
        doClose();
      }
    } else {
      doClose();
    }

    if (!closed) {
      try {
        mc.currentScreen = null;
      } catch (e) {}
      try {
        mc.m = null;
      } catch (e) {}
    }

    print(
      'RESULT:CLOSE_SCREEN|' +
        JSON.stringify({
          success: true,
          message: 'Screen closed',
        } as CloseResult),
    );
  }
} catch (error) {
  print(
    'RESULT:CLOSE_SCREEN|' +
      JSON.stringify({
        success: false,
        error: String(error),
      } as CloseResult),
  );
}
