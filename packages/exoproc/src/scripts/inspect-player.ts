/**
 * Inspect active player status in Minecraft canonically
 * Outputs:
 * NOT_IN_WORLD|<screenName>
 * PLAYER|<x>|<y>|<z>|<yaw>|<pitch>|<onGround>|<health>|<air>|<flying>|<creative>|<allowFly>
 */

import { getMinecraft } from './gui-utils';

(() => {
  const mc = getMinecraft();
  let p: any = null;
  if (mc) {
    if (typeof mc.$field === 'function') {
      p = mc.$field('thePlayer') || mc.$field('h');
    }
    if (!p) {
      const candidate = mc.thePlayer;
      if (candidate && typeof candidate !== 'function') {
        p = candidate;
      }
    }
    if (!p && typeof Java !== 'undefined' && Java.bridge?.readFieldSync) {
      try {
        const mcClsName = mc.$className || (mc.$class ? mc.$class.name : 'ave');
        const mcCls = Java.bridge.getClassSync(mcClsName);
        const pPtr = Java.bridge.readFieldSync(mcCls.classObj, 'h', mc.$ptr);
        if (pPtr && BigInt(pPtr) !== 0n) {
          const pClsName =
            Java.bridge.getObjectClassNameSync?.(BigInt(pPtr)) || 'bew';
          const pCls = Java.bridge.getClassSync(pClsName);
          p = Java.proxySync
            ? Java.proxySync(BigInt(pPtr), pCls)
            : {
                $ptr: BigInt(pPtr),
                posX: Java.bridge.readFieldSync(
                  pCls.classObj,
                  's',
                  BigInt(pPtr),
                ),
                posY: Java.bridge.readFieldSync(
                  pCls.classObj,
                  't',
                  BigInt(pPtr),
                ),
                posZ: Java.bridge.readFieldSync(
                  pCls.classObj,
                  'u',
                  BigInt(pPtr),
                ),
                rotationYaw: Java.bridge.readFieldSync(
                  pCls.classObj,
                  'y',
                  BigInt(pPtr),
                ),
                rotationPitch: Java.bridge.readFieldSync(
                  pCls.classObj,
                  'z',
                  BigInt(pPtr),
                ),
                onGround: Java.bridge.readFieldSync(
                  pCls.classObj,
                  'C',
                  BigInt(pPtr),
                ),
              };
        }
      } catch (e) {}
    }
  }

  let scr = mc
    ? typeof mc.$field === 'function'
      ? mc.$field('currentScreen') || mc.$field('m')
      : mc.currentScreen
    : null;
  if (typeof scr === 'function') scr = null;

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
    let rawX = p.posX !== undefined ? p.posX : p.s;
    let rawY = p.posY !== undefined ? p.posY : p.t;
    let rawZ = p.posZ !== undefined ? p.posZ : p.u;
    let rawYaw = p.rotationYaw !== undefined ? p.rotationYaw : p.y;
    let rawPitch = p.rotationPitch !== undefined ? p.rotationPitch : p.z;
    let rawOnGround = p.onGround !== undefined ? p.onGround : p.C;

    if (rawX === undefined && typeof p.$field === 'function') {
      rawX = p.$field('posX') ?? p.$field('s');
      rawY = p.$field('posY') ?? p.$field('t');
      rawZ = p.$field('posZ') ?? p.$field('u');
      rawYaw = p.$field('rotationYaw') ?? p.$field('y');
      rawPitch = p.$field('rotationPitch') ?? p.$field('z');
      rawOnGround = p.$field('onGround') ?? p.$field('C');
    }

    const x = rawX !== undefined ? Number(rawX).toFixed(2) : '0';
    const y = rawY !== undefined ? Number(rawY).toFixed(2) : '0';
    const z = rawZ !== undefined ? Number(rawZ).toFixed(2) : '0';
    const yaw = rawYaw !== undefined ? Number(rawYaw).toFixed(1) : '0';
    const pitch = rawPitch !== undefined ? Number(rawPitch).toFixed(1) : '0';
    const onGround = Boolean(rawOnGround) ? 'true' : 'false';

    let health = 'N/A';
    try {
      if (typeof p.getHealth === 'function') {
        health = String(Math.round(Number(p.getHealth())));
      } else if (typeof p.bn === 'function') {
        health = String(Math.round(Number(p.bn())));
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
