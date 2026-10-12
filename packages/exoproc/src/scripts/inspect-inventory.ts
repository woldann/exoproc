/**
 * Inspect player inventory and equipment canonically
 * Outputs:
 * RESULT:INVENTORY|<json>
 */

import { getMinecraft } from './gui-utils';

(function () {
  const mc = getMinecraft();
  const p = mc ? mc.thePlayer : null;

  if (!p) {
    const scr = mc ? mc.currentScreen : null;
    const sName = scr
      ? scr.getClass
        ? scr.getClass().getSimpleName()
        : scr.$className || 'Screen'
      : 'None';
    print(
      'RESULT:INVENTORY|' +
        JSON.stringify({
          inGame: false,
          screenName: sName,
          selectedSlot: 0,
          hotbar: [],
          main: [],
          armor: [],
          totalItems: 0,
        }),
    );
    return;
  }

  const inv = p.inventory; // InventoryPlayer
  if (!inv) {
    print(
      'RESULT:INVENTORY|' +
        JSON.stringify({
          inGame: true,
          selectedSlot: 0,
          hotbar: [],
          main: [],
          armor: [],
          totalItems: 0,
        }),
    );
    return;
  }

  function parseStack(stack: any, slotIdx: number) {
    if (!stack) return null;
    const name =
      typeof stack.getDisplayName === 'function'
        ? String(stack.getDisplayName())
        : stack.displayName || 'Unknown';
    const unloc =
      typeof stack.getUnlocalizedName === 'function'
        ? String(stack.getUnlocalizedName())
        : stack.unlocalizedName || '';
    const count = stack.stackSize !== undefined ? stack.stackSize : 1;
    const dmg =
      typeof stack.getItemDamage === 'function'
        ? stack.getItemDamage()
        : stack.itemDamage || 0;
    return {
      slot: slotIdx,
      name: name,
      unlocalized: unloc,
      count: count,
      damage: dmg,
    };
  }

  const selectedSlot = inv.currentItem !== undefined ? inv.currentItem : 0;
  const hotbar: any[] = [];
  const main: any[] = [];
  const armor: any[] = [];
  let totalItems = 0;

  // Main inventory has 36 slots (0-8 are hotbar, 9-35 are inventory)
  const mainInv = inv.mainInventory;
  if (mainInv) {
    for (let i = 0; i < 9; i++) {
      const item = parseStack(mainInv[i], i);
      hotbar.push(item);
      if (item) totalItems += item.count;
    }
    for (let i = 9; i < 36; i++) {
      const item = parseStack(mainInv[i], i);
      main.push(item);
      if (item) totalItems += item.count;
    }
  }

  // Armor has 4 slots (0: boots, 1: leggings, 2: chestplate, 3: helmet)
  const armorInv = inv.armorInventory;
  if (armorInv) {
    for (let i = 0; i < 4; i++) {
      const item = parseStack(armorInv[i], i);
      armor.push(item);
      if (item) totalItems += item.count;
    }
  }

  print(
    'RESULT:INVENTORY|' +
      JSON.stringify({
        inGame: true,
        selectedSlot: selectedSlot,
        hotbar: hotbar,
        main: main,
        armor: armor,
        totalItems: totalItems,
      }),
  );
})();
