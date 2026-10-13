import { evalRemote } from '../client.js';

async function main() {
  console.log('🔍 Inspecting player entity in active Minecraft world...\n');

  const code = `
    const mc = Java.type('Minecraft').getMinecraft();
    const p = mc.thePlayer;
    if (!p || (!p.$ptr && !p.$address)) {
      const scr = mc.currentScreen;
      const screenName = scr ? (Java.detect(scr)?.simpleName || scr.$className) : 'No Screen';
      print('NOT_IN_WORLD|' + screenName);
    } else {
      const x = p.posX !== undefined ? p.posX.toFixed(2) : '0';
      const y = p.posY !== undefined ? p.posY.toFixed(2) : '0';
      const z = p.posZ !== undefined ? p.posZ.toFixed(2) : '0';
      const yaw = p.rotationYaw !== undefined ? p.rotationYaw.toFixed(1) : '0';
      const pitch = p.rotationPitch !== undefined ? p.rotationPitch.toFixed(1) : '0';
      const onGround = p.onGround ? 'true' : 'false';
      const health = p.getHealth ? p.getHealth() : 'unknown';
      const air = p.getAir ? p.getAir() : 'unknown';
      const cap = p.capabilities;
      const flying = cap ? String(cap.isFlying) : 'false';
      const creative = cap ? String(cap.isCreativeMode) : 'false';
      const allowFly = cap ? String(cap.allowFlying) : 'false';
      print('PLAYER|' + x + '|' + y + '|' + z + '|' + yaw + '|' + pitch + '|' + onGround + '|' + health + '|' + air + '|' + flying + '|' + creative + '|' + allowFly);
    }
  `;

  const resp = await evalRemote(code);

  if (!resp.success) {
    console.error('❌ Failed to inspect player:', resp.error);
    process.exit(1);
  }

  for (const log of resp.logs) {
    if (log.startsWith('NOT_IN_WORLD|')) {
      const [, screenName] = log.split('|');
      console.log('⚠️ Player is not currently in a loaded world.');
      console.log(`   Active Screen: ${screenName}`);
      return;
    }
    if (log.startsWith('PLAYER|')) {
      const [
        ,
        x,
        y,
        z,
        yaw,
        pitch,
        onGround,
        health,
        air,
        flying,
        creative,
        allowFly,
      ] = log.split('|');
      console.log(
        '┌─────────────────────────────────────────────────────────┐',
      );
      console.log(
        '│ 🧙 Active Minecraft Player Status                        │',
      );
      console.log(
        '├─────────────────────────────────────────────────────────┤',
      );
      console.log(`│ Coordinates:   X: ${x}, Y: ${y}, Z: ${z}`);
      console.log(`│ Rotation:      Yaw: ${yaw}°, Pitch: ${pitch}°`);
      console.log(`│ On Ground:     ${onGround === 'true' ? 'Yes' : 'No'}`);
      console.log(`│ Health / Air:  ${health} HP / ${air}`);
      console.log(
        `│ Flying:        ${flying === 'true' ? 'Yes' : 'No'} (Allowed: ${allowFly})`,
      );
      console.log(
        `│ Game Mode:     ${creative === 'true' ? 'Creative' : 'Survival'}`,
      );
      console.log(
        '└─────────────────────────────────────────────────────────┘',
      );
      return;
    }
  }

  console.log('Logs:', resp.logs);
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
