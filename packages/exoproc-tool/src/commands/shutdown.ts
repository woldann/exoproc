import { shutdownRemote } from '../client.js';

async function main() {
  console.log('Shutting down Neptune daemon process...');
  const res = await shutdownRemote();
  if (res.success) {
    console.log('✓ Neptune daemon stopped successfully.');
  } else {
    console.log('Neptune daemon was not running or failed to stop.');
  }
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
