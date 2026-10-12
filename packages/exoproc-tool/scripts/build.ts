import { build } from 'bun';
import * as fs from 'fs';
import * as path from 'path';

const rootDistDir = path.join(import.meta.dir, '../dist');
const srcDir = path.join(import.meta.dir, '../src/scripts');
const distDir = path.join(import.meta.dir, '../dist/scripts');

// Ensure dist directories exist
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 1. Build CLI and server entrypoints
await build({
  entrypoints: [
    path.join(import.meta.dir, '../src/cli.ts'),
    path.join(import.meta.dir, '../src/server.ts'),
    path.join(import.meta.dir, '../src/service.ts'),
    path.join(import.meta.dir, '../src/client.ts'),
    path.join(import.meta.dir, '../src/mcp.ts'),
    path.join(import.meta.dir, '../src/api.ts'),
    path.join(import.meta.dir, '../src/gui-navigator.ts'),
    path.join(import.meta.dir, '../src/gui-crawler.ts'),
  ],
  outdir: rootDistDir,
  target: 'bun',
  format: 'esm',
  packages: 'external',
});

// Find all .ts files in src/scripts
const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.ts'));

console.log(`Building ${files.length} script files...`);

for (const file of files) {
  const srcPath = path.join(srcDir, file);
  const distPath = path.join(distDir, file.replace('.ts', '.js'));

  const result = await build({
    entrypoints: [srcPath],
    outdir: distDir,
    target: 'browser',
    format: 'esm',
  });

  if (result.success) {
    console.log(`✓ ${file} → ${path.basename(distPath)}`);
  } else {
    console.error(`✗ Failed to build ${file}`);
    process.exit(1);
  }
}

console.log('Build complete!');
