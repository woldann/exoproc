/**
 * Inspect active world status in Minecraft canonically
 * Outputs:
 * NOT_IN_WORLD|<screenName>
 * WORLD|<entities>|<players>|<isRemote>|<time>|<raining>
 */

import { getMinecraft } from './gui-utils';

(() => {
  const mc = getMinecraft();
  const w = mc ? mc.theWorld : null;
  const scr = mc ? mc.currentScreen : null;

  if (!w || (!w.$ptr && !w.$address && typeof w.getClass !== 'function')) {
    let screenName = 'No Screen';
    if (scr) {
      if (typeof scr.getClass === 'function') {
        screenName = scr.getClass().getSimpleName();
      } else {
        const real = scr.$className || (scr.$class ? scr.$class.name : '');
        const deobf =
          typeof Java !== 'undefined' && Java.mapper
            ? Java.mapper.resolveDeobfClass(real)
            : real;
        screenName = deobf
          ? deobf.includes('.')
            ? deobf.split('.').pop()!
            : deobf
          : real || 'UnknownScreen';
      }
    }
    print('NOT_IN_WORLD|' + screenName);
  } else {
    let entities = '0';
    try {
      const list = w.loadedEntityList;
      entities = list
        ? String(typeof list.size === 'function' ? list.size() : list.length)
        : '0';
    } catch (e) {}

    let players = '0';
    try {
      const list = w.playerEntities;
      players = list
        ? String(typeof list.size === 'function' ? list.size() : list.length)
        : '0';
    } catch (e) {}

    const isRemote = w.isRemote ? 'true' : 'false';

    let time = '0';
    try {
      if (typeof w.getWorldTime === 'function') time = String(w.getWorldTime());
      else if (w.worldTime !== undefined) time = String(w.worldTime);
    } catch (e) {}

    let raining = 'false';
    try {
      if (typeof w.isRaining === 'function') raining = String(w.isRaining());
      else if (w.raining !== undefined) raining = String(w.raining);
    } catch (e) {}

    print(
      'WORLD|' +
        entities +
        '|' +
        players +
        '|' +
        isRemote +
        '|' +
        time +
        '|' +
        raining,
    );
  }
})();
