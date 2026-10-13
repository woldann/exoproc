import { runRemote } from '../client.js';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: bun run run -- <path/to/script.js>');
    process.exit(1);
  }

  const absPath = resolve(process.cwd(), file);
  if (!existsSync(absPath)) {
    console.error(`❌ Script file not found: ${absPath}`);
    process.exit(1);
  }

  const start = performance.now();
  const resp = await runRemote(absPath);
  const dur = (performance.now() - start).toFixed(1);

  if (!resp.success) {
    console.error(`❌ Script failed (${dur}ms):`, resp.error);
    process.exit(1);
  }

  if (resp.logs && resp.logs.length > 0) {
    for (const log of resp.logs) {
      console.log(log);
    }
  }

  if (resp.result !== undefined) {
    console.log(resp.result);
  }
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
