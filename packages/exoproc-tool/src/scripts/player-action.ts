/**
 * Execute player actions (swing, attack, use, jump, look, select slot) canonically
 * Inputs:
 * ACTION_TYPE: 'swing' | 'attack' | 'use' | 'jump' | 'look' | 'slot'
 * LOOK_YAW?: number
 * LOOK_PITCH?: number
 * HOTBAR_SLOT?: number
 * Outputs:
 * RESULT:ACTION|<json>
 */

import { getMinecraft } from './gui-utils';

declare var ACTION_TYPE: string | undefined;
declare var LOOK_YAW: number | undefined;
declare var LOOK_PITCH: number | undefined;
declare var HOTBAR_SLOT: number | undefined;

(function () {
  const mc = getMinecraft();
  const p = mc ? mc.thePlayer : null;

  if (!p) {
    print(
      'RESULT:ACTION|' +
        JSON.stringify({
          success: false,
          error: 'Player is not in game world',
        }),
    );
    return;
  }

  const action =
    typeof ACTION_TYPE === 'string' ? ACTION_TYPE.toLowerCase() : 'swing';

  try {
    if (action === 'swing' || action === 'attack') {
      try {
        if (typeof mc.clickMouse === 'function') mc.clickMouse();
        else if (typeof p.swingItem === 'function') p.swingItem();
      } catch (e) {}
      print(
        'RESULT:ACTION|' +
          JSON.stringify({
            success: true,
            action: action,
            message: 'Attacked / swung mainhand',
          }),
      );
      return;
    }

    if (action === 'use') {
      try {
        if (typeof mc.rightClickMouse === 'function') mc.rightClickMouse();
      } catch (e) {}
      print(
        'RESULT:ACTION|' +
          JSON.stringify({
            success: true,
            action: action,
            message: 'Triggered use / right click',
          }),
      );
      return;
    }

    if (action === 'jump') {
      // Set motionY to 0.42 (standard jump velocity)
      if (p.motionY !== undefined) p.motionY = 0.42;
      print(
        'RESULT:ACTION|' +
          JSON.stringify({
            success: true,
            action: action,
            message: 'Player jumped',
          }),
      );
      return;
    }

    if (action === 'look') {
      const yaw =
        typeof LOOK_YAW === 'number'
          ? LOOK_YAW
          : p.rotationYaw !== undefined
            ? p.rotationYaw
            : 0;
      const pitch =
        typeof LOOK_PITCH === 'number'
          ? LOOK_PITCH
          : p.rotationPitch !== undefined
            ? p.rotationPitch
            : 0;
      if (p.rotationYaw !== undefined) p.rotationYaw = yaw;
      if (p.rotationPitch !== undefined) p.rotationPitch = pitch;
      print(
        'RESULT:ACTION|' +
          JSON.stringify({
            success: true,
            action: action,
            yaw: yaw,
            pitch: pitch,
            message: 'Camera angle adjusted',
          }),
      );
      return;
    }

    if (action === 'slot') {
      const slot = typeof HOTBAR_SLOT === 'number' ? HOTBAR_SLOT : 0;
      if (slot < 0 || slot > 8) {
        print(
          'RESULT:ACTION|' +
            JSON.stringify({
              success: false,
              error: 'Slot index must be between 0 and 8',
            }),
        );
        return;
      }
      const inv = p.inventory; // InventoryPlayer
      if (inv) {
        if (inv.currentItem !== undefined) inv.currentItem = slot;
        print(
          'RESULT:ACTION|' +
            JSON.stringify({
              success: true,
              action: action,
              slot: slot,
              message: 'Hotbar slot changed to ' + (slot + 1),
            }),
        );
        return;
      }
      print(
        'RESULT:ACTION|' +
          JSON.stringify({ success: false, error: 'Inventory not available' }),
      );
      return;
    }

    print(
      'RESULT:ACTION|' +
        JSON.stringify({
          success: false,
          error: 'Unknown action type: ' + action,
        }),
    );
  } catch (err: any) {
    print(
      'RESULT:ACTION|' + JSON.stringify({ success: false, error: String(err) }),
    );
  }
})();
