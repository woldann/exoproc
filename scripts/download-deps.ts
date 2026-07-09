#!/usr/bin/env tsx

import { createWriteStream, mkdirSync, createReadStream, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import { rm } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { Parse } from 'unzipper';
import { log } from './logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Dep {
  name: string;
  version: string;
  url: string;
  dest: string;
  dll: string;
}

const DEPS: Dep[] = [
  {
    name: 'Capstone',
    version: '4.0.2',
    url: 'https://github.com/capstone-engine/capstone/releases/download/4.0.2/capstone-4.0.2-win64.zip',
    dest: 'packages/capstone/deps',
    dll: 'capstone.dll',
  },
];

async function download(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error(`Failed to download: Empty response body`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await pipeline(response.body as any, createWriteStream(dest));
}

/**
 * Surgically extract ONLY the required DLL from the zip archive
 */
function extractDll(
  zipPath: string,
  destDir: string,
  dllName: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    mkdirSync(destDir, { recursive: true });

    let found = false;
    const readStream = createReadStream(zipPath);
    const stream = readStream.pipe(Parse());

    stream.on('entry', (entry) => {
      const fileName = basename(entry.path);

      if (!found && fileName.toLowerCase() === dllName.toLowerCase()) {
        const destFile = join(destDir, dllName);
        entry
          .pipe(createWriteStream(destFile))
          .on('finish', () => {
            found = true;
          })
          .on('error', reject);
      } else {
        entry.autodrain();
      }
    });

    stream.on('finish', () => {
      readStream.destroy();
      if (found) resolve();
      else reject(new Error(`Could not find ${dllName} in the archive!`));
    });

    stream.on('error', (err) => {
      readStream.destroy();
      reject(err);
    });
  });
}

async function main() {
  log.section('Downloading Capstone dependencies');

  const tempDir = join(
    tmpdir(),
    `exoproc-deps-${randomBytes(8).toString('hex')}`,
  );
  mkdirSync(tempDir, { recursive: true });

  try {
    for (const dep of DEPS) {
      const destPath = join(__dirname, '..', dep.dest);
      const dllPath = join(destPath, dep.dll);

      // Skip if DLL already exists
      if (existsSync(dllPath)) {
        log.done(
          `${log.bold(dep.name)} DLL already exists, skipping download.`,
        );
        continue;
      }

      const zipFile = join(tempDir, `${dep.name.toLowerCase()}.zip`);

      log.wait(`Downloading ${log.bold(dep.name)} ${dep.version}...`);
      await download(dep.url, zipFile);

      log.info(`Extracting ${log.bold(dep.dll)} to ${log.dim(dep.dest)}/...`);
      await extractDll(zipFile, destPath, dep.dll);

      log.done(`${log.bold(dep.name)} DLL installed successfully.`);
      log.line();
    }

    log.line();
    log.done('All dependencies are ready!');
    log.line(`   - Capstone 4.0.2 -> ${log.dim('packages/capstone/deps/')}`);
  } catch (error) {
    log.line();
    log.fail(`Operation aborted: ${log.bold((error as Error).message)}`);
    process.exit(1);
  } finally {
    await rm(tempDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
}

main();
