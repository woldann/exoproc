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
  // Get Minecraft instance
  const mcClass = Java.type('net.minecraft.client.Minecraft');
  const mc = mcClass.getMinecraft
    ? mcClass.getMinecraft()
    : mcClass.getInstance();
  const currentScreen = mc.currentScreen;

  if (!currentScreen) {
    print(
      'RESULT:CLOSE_SCREEN|' +
        JSON.stringify({
          success: true,
          message: 'No screen was open',
        } as CloseResult),
    );
  } else {
    // Call mc.displayGuiScreen(null) to close the screen
    mc.displayGuiScreen(null);

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
