import { detachRemote } from '../client.js';

async function main() {
  console.log('Detaching Exoproc Daemon from target process...');
  const res = await detachRemote();
  if (res.success) {
    console.log('✓ Target process detached successfully.');
    console.log('🟡 Exoproc Daemon remains running in Standby mode.');
    console.log('   Use `bun run attach [PID]` to attach to another process,');
    console.log('   or `bun run shutdown` to stop the daemon completely.');
  } else {
    console.log(
      `Failed to detach: ${res.error || 'Daemon is not running or no process attached'}`,
    );
  }
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
