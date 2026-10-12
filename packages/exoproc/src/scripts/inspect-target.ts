/**
 * Inspect target block or entity in player crosshairs canonically
 * Outputs:
 * RESULT:TARGET|<json>
 */

import { getMinecraft } from './gui-utils';

declare let TARGET_REACH: number | undefined;

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
      'RESULT:TARGET|' + JSON.stringify({ inGame: false, screenName: sName }),
    );
    return;
  }

  const reach =
    typeof TARGET_REACH === 'number' && TARGET_REACH > 0 ? TARGET_REACH : 30.0;
  const res: any = {
    inGame: true,
    reach: reach,
    hitType: 'MISS',
    distance: 0,
  };

  const px = typeof p.posX === 'number' ? p.posX : Number(p.posX || 0);
  const py = typeof p.posY === 'number' ? p.posY : Number(p.posY || 0);
  const pz = typeof p.posZ === 'number' ? p.posZ : Number(p.posZ || 0);

  // Check Minecraft native crosshair hit (mc.objectMouseOver)
  try {
    const hit = mc.objectMouseOver;
    if (hit) {
      // Entity hit
      const ent = hit.entityHit;
      if (ent) {
        const ex =
          typeof ent.posX === 'number' ? ent.posX : Number(ent.posX || 0);
        const ey =
          typeof ent.posY === 'number' ? ent.posY : Number(ent.posY || 0);
        const ez =
          typeof ent.posZ === 'number' ? ent.posZ : Number(ent.posZ || 0);
        const dist = Math.sqrt(
          Math.pow(ex - px, 2) + Math.pow(ey - py, 2) + Math.pow(ez - pz, 2),
        );
        res.hitType = 'ENTITY';
        res.distance = Math.round(dist * 10) / 10;
        res.entity = {
          id: typeof ent.getEntityId === 'function' ? ent.getEntityId() : 0,
          name: String(
            typeof ent.getName === 'function'
              ? ent.getName()
              : ent.getClass
                ? ent.getClass().getSimpleName()
                : 'Entity',
          ),
          type: ent.getClass ? ent.getClass().getSimpleName() : 'Entity',
          coords: {
            x: Math.round(ex * 10) / 10,
            y: Math.round(ey * 10) / 10,
            z: Math.round(ez * 10) / 10,
          },
          health:
            typeof ent.getHealth === 'function'
              ? ent.getHealth()
              : typeof ent.health === 'number'
                ? ent.health
                : null,
        };
        print('RESULT:TARGET|' + JSON.stringify(res));
        return;
      }

      // Block hit
      const bp =
        typeof hit.getBlockPos === 'function'
          ? hit.getBlockPos()
          : hit.blockPos;
      if (bp && (typeof bp.getX === 'function' || bp.x !== undefined)) {
        const bx = typeof bp.getX === 'function' ? bp.getX() : bp.x || 0;
        const by = typeof bp.getY === 'function' ? bp.getY() : bp.yCoord || 0;
        const bz = typeof bp.getZ === 'function' ? bp.getZ() : bp.zCoord || 0;
        const blockState =
          typeof w.getBlockState === 'function' ? w.getBlockState(bp) : null;
        const block =
          blockState && typeof blockState.getBlock === 'function'
            ? blockState.getBlock()
            : null;
        const dist = Math.sqrt(
          Math.pow(bx - px, 2) +
            Math.pow(by - (py + 1.62), 2) +
            Math.pow(bz - pz, 2),
        );
        const unlocalized =
          block && typeof block.getUnlocalizedName === 'function'
            ? String(block.getUnlocalizedName())
            : 'unknown';
        const cleanName =
          unlocalized.indexOf('tile.') === 0
            ? unlocalized.substring(5)
            : unlocalized;
        res.hitType = 'BLOCK';
        res.distance = Math.round(dist * 10) / 10;
        res.block = {
          name: cleanName,
          unlocalized: unlocalized,
          coords: { x: bx, y: by, z: bz },
          side: String(hit.sideHit || 'UP'),
        };
        print('RESULT:TARGET|' + JSON.stringify(res));
        return;
      }
    }
  } catch (e) {}

  print('RESULT:TARGET|' + JSON.stringify(res));
})();
