import { describe, it, expect } from 'bun:test';
import { createAccessor } from '@woldann/exoproc-accessors';
import { getNJava, getJavaSync } from '@woldann/bun-njava';
import { MinecraftMatcher } from '@woldann/exoproc-minecraft';
import { ensureMinecraftRunning, ensureInWorld } from './minecraft-launcher.js';

describe('exoproc > Phased Dynamic Matcher & Autonomous GUI World Navigation', () => {
  it('executes Phase 1 (Core), navigates via test launcher helper, and executes Phase 2 (World)', async () => {
    // 1. Ensure Minecraft is running via PrismLauncher helper
    console.log('[Test] Ensuring Minecraft 1.8.9 is running...');
    const pid = await ensureMinecraftRunning('1.8.9');
    expect(pid).toBeGreaterThan(0);
    console.log(`[Test] Attached target PID: ${pid}`);

    // 2. Attach stealth host and reflection bridge
    const host = await createAccessor(pid, { njava: 'stealth' });
    const reflection = await getNJava(host).getReflection();
    const Java = getJavaSync(host);
    expect(reflection).toBeDefined();

    // 3. Phase 1 (Core Match): Ultra-fast scan of Minecraft singleton, GuiScreen, and GuiButton
    console.log('[Test] Running Phase 1 (matchCore)...');
    const tCore = Date.now();
    const matcher = new MinecraftMatcher(reflection);
    const coreMappings = await matcher.matchCore();
    const coreElapsed = Date.now() - tCore;
    console.log(`[Test] ✓ Phase 1 (Core) finished in ${coreElapsed}ms`);

    expect(coreMappings.Minecraft?.realClassName).toBeDefined();
    expect(coreMappings.Minecraft.fields.theMinecraft).toBeDefined();
    expect(coreMappings.Minecraft.methods.getMinecraft).toBeDefined();
    expect(coreMappings.GuiScreen?.realClassName).toBeDefined();
    expect(coreMappings.GuiScreen.fields.buttonList).toBeDefined();
    expect(coreMappings.GuiScreen.methods.actionPerformed).toBeDefined();
    expect(coreMappings.GuiButton?.realClassName).toBeDefined();
    expect(coreMappings.GuiButton.fields.id).toBeDefined();

    // Register Phase 1 core mappings into Java
    matcher.registerTo(Java, coreMappings);

    const Minecraft = Java.type('net.minecraft.client.Minecraft');
    const mc =
      typeof Minecraft.getMinecraft === 'function'
        ? Minecraft.getMinecraft()
        : Minecraft.theMinecraft;
    expect(mc).toBeDefined();

    // 4. Test Helper GUI Navigation into live singleplayer world using Phase 1 core mappings
    console.log(
      '[Test] Navigating into world using test helper (ensureInWorld)...',
    );
    await ensureInWorld(reflection, Java, coreMappings, mc, {
      timeoutMs: 120000,
      log: (msg: string) => console.log(`[Test] ${msg}`),
    });

    // 5. Phase 2 (World Match): Deep scan of live player, capabilities, world, inventory
    console.log('[Test] Running Phase 2 (matchWorld)...');
    const tWorld = Date.now();
    const worldMappings = await matcher.matchWorld();
    const worldElapsed = Date.now() - tWorld;
    console.log(`[Test] ✓ Phase 2 (World) finished in ${worldElapsed}ms`);

    expect(worldMappings.EntityPlayerSP?.realClassName).toBeDefined();
    expect(worldMappings.EntityPlayer?.realClassName).toBeDefined();
    expect(worldMappings.PlayerCapabilities?.realClassName).toBeDefined();

    const caps = worldMappings.PlayerCapabilities.fields;
    expect(caps.allowFlying).toBeDefined();
    expect(caps.isFlying).toBeDefined();
    expect(caps.disableDamage).toBeDefined();
    expect(caps.flySpeed).toBeDefined();
    expect(caps.walkSpeed).toBeDefined();

    // Register Phase 2 world mappings into Java
    matcher.registerTo(Java, worldMappings);

    // 6. Live in-memory capability injection & verification
    const player = mc.thePlayer;
    expect(player).toBeDefined();
    const playerCaps = player.capabilities;
    expect(playerCaps).toBeDefined();

    console.log(
      `[Test] Live caps before injection: allowFlying=${playerCaps.allowFlying}, isFlying=${playerCaps.isFlying}`,
    );

    // Inject flight modification (including creative mode to prevent vanilla survival ground reset)
    playerCaps.isCreativeMode = true;
    playerCaps.allowFlying = true;
    playerCaps.isFlying = true;
    playerCaps.disableDamage = true;
    playerCaps.flySpeed = 0.1;

    // Verify modification in live memory
    expect(playerCaps.allowFlying).toBe(true);
    expect(playerCaps.disableDamage).toBe(true);
    expect(playerCaps.flySpeed).toBeCloseTo(0.1, 2);
    console.log(
      '[Test] ✓ Live flight capabilities modified and verified successfully in memory!',
    );

    host.close();
  }, 180000);
});
