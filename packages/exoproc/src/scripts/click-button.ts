/**
 * Click a button in the current GUI screen by ID
 * __buttonId__ is passed as a parameter by the daemon eval handler
 */

try {
  // Get Minecraft instance
  const mcClass = Java.type('net.minecraft.client.Minecraft');
  const mc = mcClass.getMinecraft
    ? mcClass.getMinecraft()
    : mcClass.getInstance();
  const currentScreen = mc.currentScreen;
  const buttonList = currentScreen ? currentScreen.buttonList || [] : [];

  if (!currentScreen || !buttonList || buttonList.length === 0) {
    print(
      'RESULT:CLICK_BUTTON|' +
        JSON.stringify({
          success: false,
          message: 'No screen open or no buttons',
        }),
    );
  } else {
    // __buttonId__ is available as a function parameter from the daemon
    // Find the button with matching ID
    let targetBtn = null;
    for (let i = 0; i < buttonList.length; i++) {
      const b = buttonList[i];
      let bid = 0;
      try {
        bid = b.id;
      } catch (e) {
        // Try obfuscated name
        try {
          bid = b.k;
        } catch (e2) {}
      }
      if (bid === __buttonId__) {
        targetBtn = b;
        break;
      }
    }

    if (!targetBtn) {
      print(
        'RESULT:CLICK_BUTTON|' +
          JSON.stringify({
            success: false,
            message: `Button ${__buttonId__} not found`,
            buttonId: __buttonId__,
          }),
      );
    } else {
      // Find and call actionPerformed method
      const methods = currentScreen.getClass().getDeclaredMethods();
      let actionMethod = null;

      for (let i = 0; i < methods.length; i++) {
        const m = methods[i];
        const params = m.getParameterTypes();
        if (m.getName() === 'actionPerformed' && params.length === 1) {
          if (params[0].isAssignableFrom(targetBtn.getClass())) {
            actionMethod = m;
            m.setAccessible(true);
            break;
          }
        }
      }

      if (!actionMethod) {
        print(
          'RESULT:CLICK_BUTTON|' +
            JSON.stringify({
              success: false,
              message: 'actionPerformed method not found',
              buttonId: __buttonId__,
            }),
        );
      } else {
        // Invoke the method
        actionMethod.invoke(currentScreen, [targetBtn]);
        print(
          'RESULT:CLICK_BUTTON|' +
            JSON.stringify({
              success: true,
              message: `Button ${__buttonId__} clicked`,
              buttonId: __buttonId__,
            }),
        );
      }
    }
  }
} catch (error) {
  print(
    'RESULT:CLICK_BUTTON|' +
      JSON.stringify({
        success: false,
        message: String(error),
        error: String(error),
      }),
  );
}
