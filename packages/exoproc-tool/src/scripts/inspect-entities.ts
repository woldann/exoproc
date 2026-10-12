/**
 * Inspect nearby entities in loaded world canonically
 * Outputs:
 * RESULT:ENTITIES|<json>
 */

import { getMinecraft } from './gui-utils';

declare var SCAN_RADIUS: number | undefined;

(function () {
  const mc = getMinecraft();
  const p = mc ? mc.thePlayer : null;
  const w = mc ? mc.theWorld : null;

  if (
    !p ||
    (!p.$ptr && !p.$address && typeof p.getClass !== 'function') ||
    !w
  ) {
    const scr = mc ? mc.currentScreen : null;
    const sName = scr
      ? scr.getClass
        ? scr.getClass().getSimpleName()
        : scr.$className || 'Screen'
      : 'None';
    print(
      'RESULT:ENTITIES|' +
        JSON.stringify({
          inGame: false,
          screenName: sName,
          totalLoaded: 0,
          radius: 0,
          entities: [],
        }),
    );
    return;
  }

  const radius =
    typeof SCAN_RADIUS === 'number' && SCAN_RADIUS > 0 ? SCAN_RADIUS : 64.0;
  const list = w.loadedEntityList;
  const totalLoaded = list
    ? typeof list.size === 'function'
      ? list.size()
      : list.length
    : 0;
  const entities: any[] = [];

  const px = typeof p.posX === 'number' ? p.posX : Number(p.posX || 0);
  const py = typeof p.posY === 'number' ? p.posY : Number(p.posY || 0);
  const pz = typeof p.posZ === 'number' ? p.posZ : Number(p.posZ || 0);

  const maxScan = Math.min(totalLoaded, 40);
  for (let i = 0; i < maxScan; i++) {
    const e = typeof list.get === 'function' ? list.get(i) : list[i];
    if (!e) continue;
    const ex = typeof e.posX === 'number' ? e.posX : Number(e.posX || 0);
    const ey = typeof e.posY === 'number' ? e.posY : Number(e.posY || 0);
    const ez = typeof e.posZ === 'number' ? e.posZ : Number(e.posZ || 0);
    const dist = Math.sqrt(
      Math.pow(ex - px, 2) + Math.pow(ey - py, 2) + Math.pow(ez - pz, 2),
    );
    if (dist <= radius) {
      const isMe = e === p;
      const typeName = e.getClass
        ? e.getClass().getSimpleName()
        : e.$className || 'Entity';
      const dispName =
        typeof e.getName === 'function' ? String(e.getName()) : typeName;
      const hp =
        typeof e.getHealth === 'function'
          ? e.getHealth()
          : typeof e.health === 'number'
            ? e.health
            : null;
      entities.push({
        id: typeof e.getEntityId === 'function' ? e.getEntityId() : i,
        name: dispName,
        type: typeName,
        coords: {
          x: Math.round(ex * 10) / 10,
          y: Math.round(ey * 10) / 10,
          z: Math.round(ez * 10) / 10,
        },
        distance: Math.round(dist * 10) / 10,
        health: typeof hp === 'number' ? Math.round(hp * 10) / 10 : undefined,
        isPlayer: isMe || typeName.indexOf('Player') !== -1,
      });
    }
  }

  // Sort by distance ascending
  entities.sort(function (a: any, b: any) {
    return a.distance - b.distance;
  });

  print(
    'RESULT:ENTITIES|' +
      JSON.stringify({
        inGame: true,
        totalLoaded: totalLoaded,
        radius: radius,
        entities: entities,
      }),
  );
})();
