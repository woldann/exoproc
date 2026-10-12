import { ToolhelpSnapshot } from '../packages/winapi/src/index.js';
import { ToolhelpSnapshotFlag } from 'bun-xffi';
import { createAccessor } from '../packages/accessors/src/index.js';
import { getNJava } from '../packages/njava/src/index.js';
import { MinecraftMatcher } from '../packages/minecraft/src/index.js';

async function main() {
  const snap = new ToolhelpSnapshot(ToolhelpSnapshotFlag.SNAPPROCESS);
  const procs = Array.from(snap.getProcesses());
  snap.close();

  const mcProc = procs.find(
    (p) =>
      p.name.toLowerCase().includes('javaw') ||
      p.name.toLowerCase().includes('java'),
  );

  if (!mcProc) {
    console.error('No Java / Minecraft process found running!');
    console.log(
      'Running processes:',
      procs.map((p) => `${p.name} (pid: ${p.pid})`).join(', '),
    );
    process.exit(1);
  }

  console.log(`Found Java process: ${mcProc.name} (PID: ${mcProc.pid})`);

  console.log('Connecting to Minecraft via stealth accessor...');
  const host = await createAccessor(mcProc.pid, { njava: 'stealth' });
  const njava = getNJava(host);
  const bridge = await njava.getReflection();
  console.log('Successfully attached to Java VM reflection bridge!');

  const matcher = new MinecraftMatcher(bridge);
  console.log(
    '\n--- Running Dynamic Matcher with minecraftClassName: "ave" ---',
  );

  const startTime = Date.now();
  const mappings = await matcher.match({
    minecraftClassName: 'ave',
  });
  const elapsed = Date.now() - startTime;

  console.log(`\nMapping completed in ${elapsed}ms!\n`);

  for (const [key, mapping] of Object.entries(mappings)) {
    const fieldsCount = Object.keys(mapping.fields).length;
    const methodsCount = Object.keys(mapping.methods).length;
    console.log(
      `[Class] ${key.padEnd(20)} -> real: ${mapping.realClassName.padEnd(15)} (fields: ${fieldsCount}, methods: ${methodsCount})`,
    );

    if (fieldsCount > 0) {
      for (const [fName, fReal] of Object.entries(mapping.fields)) {
        console.log(`   - field:  ${fName.padEnd(20)} = ${fReal}`);
      }
    }
    if (methodsCount > 0) {
      for (const [mName, mReal] of Object.entries(mapping.methods)) {
        console.log(`   - method: ${mName.padEnd(20)} = ${mReal}`);
      }
    }
  }

  await host.close();
  console.log('\n--- Done ---');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error during test:', err);
  process.exit(1);
});
