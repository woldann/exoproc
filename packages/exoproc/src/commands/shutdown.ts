import { shutdownRemote } from '../client.js';

async function main() {
  console.log('Shutting down Exoproc daemon process...');
  const res = await shutdownRemote();
  if (res.success) {
    console.log('✓ Exoproc daemon stopped successfully.');
  } else {
    console.log('Exoproc daemon was not running or failed to stop.');
  }
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
