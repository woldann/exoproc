import { ToolhelpSnapshot } from '../packages/winapi/src/index.js';
import { ToolhelpSnapshotFlag } from 'bun-xffi';
import { createAccessor } from '../packages/accessors/src/index.js';
import { getNJava } from '../packages/njava/src/index.js';
import { MinecraftMatcher } from '../packages/minecraft/src/index.js';

async function main() {
  console.log('=== PHASE 0 DIAGNOSTICS: Live Minecraft 1.8.9 ===\n');

  const snap = new ToolhelpSnapshot(ToolhelpSnapshotFlag.SNAPPROCESS);
  const procs = Array.from(snap.getProcesses());
  snap.close();

  const mcProc = procs.find(
    (p) =>
      p.name.toLowerCase().includes('javaw') ||
      p.name.toLowerCase().includes('java'),
  );
  if (!mcProc) {
    console.error('No Minecraft / javaw process found!');
    process.exit(1);
  }

  console.log(
    `[Diagnostic] Found Minecraft PID: ${mcProc.pid} (${mcProc.name})`,
  );
  const host = await createAccessor(mcProc.pid, { njava: 'stealth' });
  const njava = getNJava(host);
  const bridge = await njava.getReflection();

  // Test 1: Run Matcher and Inspect Candidate Collisions
  console.log('\n--- 1. Matcher & Method Candidate Collision Analysis ---');
  const matcher = new MinecraftMatcher(bridge);
  const mappings = await matcher.match({ minecraftClassName: 'ave' });

  // Analyze duplicate method mappings
  for (const [clsName, mapping] of Object.entries(mappings)) {
    const methodNames = Object.entries(mapping.methods);
    const seenMethods = new Map<string, string[]>();
    for (const [canonicalName, realName] of methodNames) {
      if (!seenMethods.has(realName)) seenMethods.set(realName, []);
      seenMethods.get(realName)!.push(canonicalName);
    }
    const duplicates = Array.from(seenMethods.entries()).filter(
      ([_, list]) => list.length > 1,
    );
    if (duplicates.length > 0) {
      console.log(
        `[Collision in ${clsName}] The following canonical methods map to identical real obfuscated methods (Candidate Consumption Bug):`,
      );
      for (const [realName, list] of duplicates) {
        console.log(
          `   * Real method '${realName}' is mapped to: [ ${list.join(', ')} ]`,
        );
      }
    }
  }

  // Test 2: Field Ordinal vs Entity Structure Analysis
  console.log('\n--- 2. Field Ordinal & Structure Analysis (Entity pk) ---');
  const entityMapping = mappings.Entity;
  if (entityMapping) {
    const entCls = await bridge.getClass(entityMapping.realClassName);
    const entFields = await entCls.getDeclaredFields();
    console.log(
      `Entity (${entityMapping.realClassName}) has ${entFields.length} declared fields.`,
    );
    console.log('Current mapped coordinates & motion:');
    console.log(`   posX:     ${entityMapping.fields.posX}`);
    console.log(`   posY:     ${entityMapping.fields.posY}`);
    console.log(`   posZ:     ${entityMapping.fields.posZ}`);
    console.log(`   motionX:  ${entityMapping.fields.motionX}`);
    console.log(`   motionY:  ${entityMapping.fields.motionY}`);
    console.log(`   motionZ:  ${entityMapping.fields.motionZ}`);
    console.log(`   onGround: ${entityMapping.fields.onGround}`);
  }

  // Test 3: JNI Local-Ref Stress Test
  console.log('\n--- 3. JNI Local-Ref Stress Test (2000 Iterations) ---');
  const mcCls = await bridge.getClass(mappings.Minecraft.realClassName);
  const t0 = Date.now();
  let survived = 0;
  for (let i = 0; i < 2000; i++) {
    try {
      const methods = await mcCls.getDeclaredMethods();
      if (methods.length > 0) survived++;
      if ((i + 1) % 500 === 0) {
        console.log(`   Progress: ${i + 1} / 2000 iterations completed...`);
      }
    } catch (err: any) {
      console.error(`   Crash/Error at iteration ${i}:`, err.message);
      break;
    }
  }
  const dt = Date.now() - t0;
  console.log(
    `JNI Stress Test Result: ${survived}/2000 iterations completed in ${dt}ms (${(dt / survived).toFixed(2)}ms/op).`,
  );

  await host.close();
  console.log('\n=== Phase 0 Diagnostics Completed Successfully ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Diagnostic error:', err);
  process.exit(1);
});
