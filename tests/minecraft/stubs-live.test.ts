import { describe, it, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAccessor } from 'exoproc-accessors';
import { getNJava, JavaMappingRegistry } from 'bun-njava';
import {
  MinecraftMatcher,
  MINECRAFT_CANONICAL_SCHEMA,
} from 'exoproc-minecraft';
import { ensureMinecraftRunning } from '../exoproc/minecraft-launcher.js';
import { getTestJavaPath } from '../njava/java-test-helpers.js';

describe('exoproc-minecraft > Live Game Stubs & Dynamic Pool Extraction', () => {
  const javaPath = getTestJavaPath(8);

  it('attaches to live Minecraft, matches classes from JVM memory, and generates stubs dynamically', async () => {
    // 1. Ensure Minecraft is running via launcher helper (connects to running instance or launches)
    const pid = await ensureMinecraftRunning('1.8.9');
    expect(pid).toBeGreaterThan(0);

    // 2. Attach accessor and obtain live reflection bridge
    const host = await createAccessor(pid, {
      njava: 'stealth',
      hostOptions: { timeoutMs: 25000, pollIntervalMs: 2 },
    });
    try {
      const njava = getNJava(host);
      const reflection = await njava.getReflection();
      expect(reflection).toBeDefined();

      // 3. Scan live JVM memory using MinecraftMatcher
      const matcher = new MinecraftMatcher(reflection);
      const coreMappings = await matcher.matchCore();

      expect(coreMappings.Minecraft?.realClassName).toBeDefined();
      expect(matcher.classPool.size).toBeGreaterThan(0);

      // 4. Feed the live classPool directly into JavaMappingRegistry (zero hardcoded mappings!)
      const registry = new JavaMappingRegistry({ javaPath, javaVersion: 8 });
      try {
        registry.registerDatabase(MINECRAFT_CANONICAL_SCHEMA);
        registry.syncPool(matcher.classPool);

        // 5. Verify stubs.jar was compiled from live game memory
        expect(registry.isClassComplete('Minecraft')).toBe(true);
        const stubProject = registry.getStubProject();
        const compRes = stubProject.compileSync();
        expect(compRes.success).toBe(true);
        expect(existsSync(stubProject.getJarPath())).toBe(true);

        const mcJava = join(
          stubProject.srcDir,
          'net',
          'minecraft',
          'client',
          'Minecraft.java',
        );
        expect(existsSync(mcJava)).toBe(true);
        const mcSource = readFileSync(mcJava, 'utf8');
        expect(mcSource).toContain('public class Minecraft');
        expect(mcSource).toContain('thePlayer');
        expect(mcSource).toContain('getMinecraft()');
        expect(mcSource.length).toBeGreaterThan(500);

        // 6. Verify user code compiles against the live stubs and remaps to the live obfuscated bytecode
        const userCode = `
          package user.script;
          import net.minecraft.client.Minecraft;

          public class LiveUserScript {
              public static void run() {
                  Minecraft mc = Minecraft.getMinecraft();
              }
          }
        `;

        const result = registry.compileAndRemapSync(userCode);
        expect(result.compileResult.success).toBe(true);
        expect(result.remapResult.success).toBe(true);
        expect(result.classes.has('user.script.LiveUserScript')).toBe(true);
      } finally {
        registry.getStubProject().cleanup();
      }
    } finally {
      host.close();
    }
  }, 120000);
});
