import { evalRemote } from '../client.js';

async function main() {
  let code = process.argv.slice(2).join(' ').trim();
  if (!code) {
    console.error('Usage: bun run eval -- "<code>"');
    process.exit(1);
  }

  if (
    !code.includes(';') &&
    !code.includes('\n') &&
    !code.startsWith('return ') &&
    !code.startsWith('const ') &&
    !code.startsWith('let ') &&
    !code.startsWith('var ')
  ) {
    code = `return (${code});`;
  }

  const start = performance.now();
  const resp = await evalRemote(code);
  const dur = (performance.now() - start).toFixed(1);

  if (!resp.success) {
    console.error(`❌ Eval failed (${dur}ms):`, resp.error);
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
