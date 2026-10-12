// Script: Inspect current Minecraft GUI state
// Runs in daemon eval context (has Java proxy with mappings)

export const INSPECT_STATE_SCRIPT = `
  const mc = Java.type('Minecraft').getMinecraft();
  const scr = mc.currentScreen;

  let playerLoaded = false;
  let playerX = 0;
  let playerY = 0;
  let playerZ = 0;

  try {
    const player = mc.thePlayer;
    const world = mc.theWorld;
    if (player && (player.$ptr || player.$address) && world && (world.$ptr || world.$address)) {
      playerLoaded = true;
      try {
        playerX = Math.round(Number(player.posX ?? 0) * 10) / 10;
        playerY = Math.round(Number(player.posY ?? 0) * 10) / 10;
        playerZ = Math.round(Number(player.posZ ?? 0) * 10) / 10;
      } catch (e) {}
    }
  } catch (e) {}

  if (!scr || !scr.$ptr) {
    print('RESULT:STATE|None|null|' + playerLoaded + '|' + playerX + '|' + playerY + '|' + playerZ);
    print('RESULT:BTN_COUNT|0');
  } else {
    const d = await Java.detect(scr).catch(() => null);
    const simpleName = d ? d.simpleName : 'UnknownScreen';
    const canonical = d ? (d.canonicalClassName || d.canonicalKey) : 'unknown';
    print('RESULT:STATE|' + simpleName + '|' + canonical + '|' + playerLoaded + '|' + playerX + '|' + playerY + '|' + playerZ);

    const list = scr.buttonList;
    const count = list ? list.size() : 0;
    print('RESULT:BTN_COUNT|' + count);
    for (let i = 0; i < count; i++) {
      const b = list.get(i);
      const bid = (typeof b.id === 'number') ? b.id : (typeof b.k === 'number') ? b.k : 0;
      const bstr = (typeof b.displayString === 'string') ? b.displayString : (typeof b.j === 'string') ? b.j : '';
      const ben = (typeof b.enabled === 'boolean') ? b.enabled : (typeof b.l === 'boolean') ? b.l : true;
      print('RESULT:BTN|' + bid + '|' + bstr + '|' + ben);
    }
  }
`;
