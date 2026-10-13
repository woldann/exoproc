import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const rootDir = join(import.meta.dirname, '..');
const daemonPkgDir = join(rootDir, 'packages', 'exoproc');
const standaloneDir = join(daemonPkgDir, 'dist', 'daemon', 'standalone');
const entryFile = join(
  rootDir,
  'packages',
  'exoproc',
  'src',
  'daemon',
  'cli.ts',
);
const bundleFile = join(standaloneDir, 'exoproc-daemon.js');
const exeFile = join(standaloneDir, 'exoproc-daemon.exe');

mkdirSync(standaloneDir, { recursive: true });

console.log('📦 Building Exoproc Daemon (exoproc-daemon)...');

// 1. Bundle JS
const bundleRes = spawnSync(
  'bun',
  ['build', entryFile, '--outfile', bundleFile, '--target', 'bun'],
  { stdio: 'inherit' },
);

if (bundleRes.status !== 0) {
  console.error('Failed to bundle exoproc-daemon.js');
  process.exit(1);
}
console.log(`✓ Exoproc Daemon JS bundle created: ${bundleFile}`);

// 2. Copy Capstone DLL
const capstoneSrc = join(
  rootDir,
  'packages',
  'capstone',
  'deps',
  'capstone.dll',
);
const capstoneDest = join(standaloneDir, 'capstone.dll');
if (existsSync(capstoneSrc)) {
  copyFileSync(capstoneSrc, capstoneDest);
  console.log('✓ Capstone DLL copied to standalone directory');
}

// 3. Compile native Windows binary with Bun
console.log('🔨 Compiling native binary (exoproc-daemon.exe)...');
const compileRes = spawnSync(
  'bun',
  [
    'build',
    entryFile,
    '--compile',
    '--target=bun-windows-x64-v1.4.0',
    '--outfile',
    exeFile,
  ],
  { stdio: 'inherit' },
);

if (compileRes.status !== 0) {
  console.error('Failed to compile exoproc-daemon.exe');
  process.exit(1);
}

console.log(
  `🚀 Native Windows Exoproc Daemon created successfully: ${exeFile}`,
);
