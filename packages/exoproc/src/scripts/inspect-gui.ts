/**
 * Inspect the currently active GUI screen
 * Outputs button information for the active screen
 */

interface ButtonInfo {
  id: number;
  text: string;
  x: number;
  y: number;
  enabled: boolean;
}

interface ScreenInfo {
  name: string;
  obfuscatedClass: string;
  canonicalClass: string;
  buttons: ButtonInfo[];
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
      'RESULT:INSPECT_GUI|' +
        JSON.stringify({
          name: 'None',
          obfuscatedClass: '',
          canonicalClass: 'null',
          buttons: [],
        } as ScreenInfo),
    );
  } else {
    const screenClass = currentScreen.getClass();
    const screenName = screenClass.getSimpleName();
    const canonicalName = screenClass.getCanonicalName();

    // Get button list
    const buttons: ButtonInfo[] = [];
    const buttonList = currentScreen.buttonList || [];

    if (buttonList.length > 0) {
      for (let i = 0; i < buttonList.length; i++) {
        const button = buttonList[i];
        const btnClass = button.getClass();

        // Get button ID
        let id = 0;
        try {
          const idField = btnClass.getDeclaredField('id');
          idField.setAccessible(true);
          id = idField.get(button);
        } catch (e) {
          try {
            const idField = btnClass.getDeclaredField('field_146827_b');
            idField.setAccessible(true);
            id = idField.get(button);
          } catch (e2) {
            // Try finding first int field
            const fields = btnClass.getDeclaredFields();
            for (let j = 0; j < fields.length; j++) {
              if (fields[j].getType().getName() === 'int') {
                fields[j].setAccessible(true);
                const val = fields[j].get(button);
                if (typeof val === 'number' && val < 100) {
                  id = val;
                  break;
                }
              }
            }
          }
        }

        // Get display text
        let text = '';
        try {
          const displayField = btnClass.getDeclaredField('displayString');
          displayField.setAccessible(true);
          text = String(displayField.get(button) || '');
        } catch (e) {
          try {
            const displayField = btnClass.getDeclaredField('field_146826_j');
            displayField.setAccessible(true);
            text = String(displayField.get(button) || '');
          } catch (e2) {
            // Find first String field
            const fields = btnClass.getDeclaredFields();
            for (let j = 0; j < fields.length; j++) {
              if (fields[j].getType().getName() === 'java.lang.String') {
                fields[j].setAccessible(true);
                text = String(fields[j].get(button) || '');
                if (text.trim().length > 0) break;
              }
            }
          }
        }

        // Get position (x, y)
        let x = 0,
          y = 0;
        try {
          const xField = btnClass.getDeclaredField('xPosition');
          xField.setAccessible(true);
          x = xField.get(button);
        } catch (e) {
          try {
            const xField = btnClass.getDeclaredField('field_146829_i');
            xField.setAccessible(true);
            x = xField.get(button);
          } catch (e2) {}
        }

        try {
          const yField = btnClass.getDeclaredField('yPosition');
          yField.setAccessible(true);
          y = yField.get(button);
        } catch (e) {
          try {
            const yField = btnClass.getDeclaredField('field_146830_h');
            yField.setAccessible(true);
            y = yField.get(button);
          } catch (e2) {}
        }

        // Get enabled state
        let enabled = true;
        try {
          const enabledField = btnClass.getDeclaredField('enabled');
          enabledField.setAccessible(true);
          enabled = enabledField.get(button);
        } catch (e) {
          try {
            const enabledField = btnClass.getDeclaredField('field_146828_g');
            enabledField.setAccessible(true);
            enabled = enabledField.get(button);
          } catch (e2) {}
        }

        buttons.push({
          id,
          text: text.trim(),
          x,
          y,
          enabled,
        });
      }
    }

    const result: ScreenInfo = {
      name: screenName,
      obfuscatedClass:
        screenClass.getName().split('.').pop() || screenClass.getName(),
      canonicalClass: canonicalName,
      buttons,
    };

    print('RESULT:INSPECT_GUI|' + JSON.stringify(result));
  }
} catch (error) {
  print('RESULT:INSPECT_GUI|ERROR:' + String(error));
}
