/**
 * Inspect active player status in Minecraft canonically
 * Outputs:
 * NOT_IN_WORLD|<screenName>
 * PLAYER|<x>|<y>|<z>|<yaw>|<pitch>|<onGround>|<health>|<air>|<flying>|<creative>|<allowFly>
 */

import { getMinecraft } from './gui-utils';

(() => {
  const mc = getMinecraft();
  const p = mc ? mc.thePlayer : null;
  const scr = mc ? mc.currentScreen : null;

  if (!p || (!p.$ptr && !p.$address && typeof p.getClass !== 'function')) {
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
    const x = p.posX !== undefined ? Number(p.posX).toFixed(2) : '0';
    const y = p.posY !== undefined ? Number(p.posY).toFixed(2) : '0';
    const z = p.posZ !== undefined ? Number(p.posZ).toFixed(2) : '0';
    const yaw =
      p.rotationYaw !== undefined ? Number(p.rotationYaw).toFixed(1) : '0';
    const pitch =
      p.rotationPitch !== undefined ? Number(p.rotationPitch).toFixed(1) : '0';
    const onGround = Boolean(p.onGround) ? 'true' : 'false';

    let health = 'N/A';
    try {
      if (typeof p.getHealth === 'function') {
        health = String(Math.round(Number(p.getHealth())));
      } else if (p.health !== undefined && p.health !== null) {
        health = String(Math.round(Number(p.health)));
      }
    } catch (e) {}

    let air = 'N/A';
    try {
      if (typeof p.getAir === 'function') {
        air = String(Math.round(Number(p.getAir())));
      } else if (p.air !== undefined && p.air !== null) {
        air = String(Math.round(Number(p.air)));
      }
    } catch (e) {}

    let flying = 'false';
    let creative = 'false';
    let allowFly = 'false';
    try {
      const cap = p.capabilities;
      if (cap) {
        flying = String(Boolean(cap.isFlying));
        creative = String(Boolean(cap.isCreativeMode));
        allowFly = String(Boolean(cap.allowFlying));
      }
    } catch (e) {}

    print(
      'PLAYER|' +
        x +
        '|' +
        y +
        '|' +
        z +
        '|' +
        yaw +
        '|' +
        pitch +
        '|' +
        onGround +
        '|' +
        health +
        '|' +
        air +
        '|' +
        flying +
        '|' +
        creative +
        '|' +
        allowFly,
    );
  }
})();
