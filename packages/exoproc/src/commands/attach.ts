import { attachRemote } from '../client.js';

async function main() {
  const arg = process.argv[2];
  let pid: number | undefined;

  if (arg && !arg.startsWith('-')) {
    pid = parseInt(arg, 10);
    if (isNaN(pid)) {
      console.error(`Invalid PID: ${arg}`);
      process.exit(1);
    }
  }

  console.log(
    pid
      ? `Connecting to target PID ${pid}...`
      : 'Scanning and attaching to Minecraft process...',
  );

  const resp = await attachRemote({ pid });
  if (!resp.success) {
    console.error(`❌ Attach failed: ${resp.error}`);
    process.exit(1);
  }

  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│ 🎯 Exoproc Daemon Attached Successfully                 │');
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log(`│ Target:        ${resp.targetName} (PID: ${resp.pid})`);
  console.log(`│ Window:        ${resp.windowTitle || 'N/A'}`);
  console.log('└─────────────────────────────────────────────────────────┘');
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
