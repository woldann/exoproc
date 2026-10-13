import { evalRemote } from '../client.js';

async function main() {
  console.log('🌍 Inspecting active Minecraft World...\n');

  const code = `
    const mc = Java.type('Minecraft').getMinecraft();
    const w = mc.theWorld;
    if (!w || (!w.$ptr && !w.$address)) {
      const scr = mc.currentScreen;
      const screenName = scr ? (Java.detect(scr)?.simpleName || scr.$className) : 'No Screen';
      print('NOT_IN_WORLD|' + screenName);
    } else {
      const entities = w.loadedEntityList ? w.loadedEntityList.size() : '0';
      const players = w.playerEntities ? w.playerEntities.size() : '0';
      const isRemote = w.isRemote ? 'true' : 'false';
      const time = w.getWorldTime ? String(w.getWorldTime()) : 'unknown';
      const raining = w.isRaining ? String(w.isRaining()) : 'false';
      print('WORLD|' + entities + '|' + players + '|' + isRemote + '|' + time + '|' + raining);
    }
  `;

  const resp = await evalRemote(code);

  if (!resp.success) {
    console.error('❌ Failed to inspect world:', resp.error);
    process.exit(1);
  }

  for (const log of resp.logs) {
    if (log.startsWith('NOT_IN_WORLD|')) {
      const [, screenName] = log.split('|');
      console.log('⚠️ No world is currently loaded.');
      console.log(`   Active Screen: ${screenName}`);
      return;
    }
    if (log.startsWith('WORLD|')) {
      const [, entities, players, isRemote, time, raining] = log.split('|');
      console.log(
        '┌─────────────────────────────────────────────────────────┐',
      );
      console.log(
        '│ 🌍 Active Minecraft World Status                         │',
      );
      console.log(
        '├─────────────────────────────────────────────────────────┤',
      );
      console.log(`│ Loaded Entities: ${entities}`);
      console.log(`│ Players Online:  ${players}`);
      console.log(
        `│ Multiplayer/Net: ${isRemote === 'true' ? 'Remote Server / LAN' : 'Singleplayer Local'}`,
      );
      console.log(`│ World Time:      ${time}`);
      console.log(`│ Weather Raining: ${raining === 'true' ? 'Yes' : 'No'}`);
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
