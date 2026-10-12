#!/usr/bin/env tsx

import {
  createWriteStream,
  mkdirSync,
  createReadStream,
  existsSync,
  readFileSync,
} from 'fs';
import { pipeline } from 'stream/promises';
import { rm } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { randomBytes, createHash } from 'crypto';
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

interface JarDep {
  name: string;
  version: string;
  url: string;
  dest: string;
  filename: string;
  sha1: string;
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

const JAR_DEPS: JarDep[] = [
  {
    name: 'ECJ 3.26.0 (Java 8)',
    version: '3.26.0',
    url: 'https://repo1.maven.org/maven2/org/eclipse/jdt/ecj/3.26.0/ecj-3.26.0.jar',
    dest: 'packages/njava/deps',
    filename: 'ecj-3.26.0.jar',
    sha1: '4837be609a3368a0f7e7cf0dc1bdbc7fe94993de',
  },
  {
    name: 'ECJ 3.46.100 (Java 17+)',
    version: '3.46.100',
    url: 'https://repo1.maven.org/maven2/org/eclipse/jdt/ecj/3.46.100/ecj-3.46.100.jar',
    dest: 'packages/njava/deps',
    filename: 'ecj-3.46.100.jar',
    sha1: 'a06c482cdb8601a94328aae668c7236e3818fbe9',
  },
  {
    name: 'Tiny-Remapper 0.14.1 (Fat)',
    version: '0.14.1',
    url: 'https://maven.fabricmc.net/net/fabricmc/tiny-remapper/0.14.1/tiny-remapper-0.14.1-fat.jar',
    dest: 'packages/njava/deps',
    filename: 'tiny-remapper-0.14.1-fat.jar',
    sha1: '0cae38cf0446be5f17f8cb58df8fdfac56aabcbd',
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

function computeSha1(filePath: string): string {
  const fileBuffer = readFileSync(filePath);
  return createHash('sha1').update(fileBuffer).digest('hex');
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

    log.section('Downloading ECJ Compiler dependencies');
    for (const dep of JAR_DEPS) {
      const destPath = join(__dirname, '..', dep.dest);
      mkdirSync(destPath, { recursive: true });
      const targetFile = join(destPath, dep.filename);

      if (existsSync(targetFile)) {
        const actualSha1 = computeSha1(targetFile);
        if (actualSha1.toLowerCase() === dep.sha1.toLowerCase()) {
          log.done(
            `${log.bold(dep.name)} already exists with verified SHA-1, skipping download.`,
          );
          continue;
        } else {
          log.warn(
            `SHA-1 mismatch for ${dep.name} (got ${actualSha1}, expected ${dep.sha1}). Re-downloading...`,
          );
        }
      }

      log.wait(`Downloading ${log.bold(dep.name)} from Maven Central...`);
      await download(dep.url, targetFile);

      const downloadedSha1 = computeSha1(targetFile);
      if (downloadedSha1.toLowerCase() !== dep.sha1.toLowerCase()) {
        await rm(targetFile, { force: true });
        throw new Error(
          `SHA-1 verification failed for ${dep.name}: expected ${dep.sha1}, got ${downloadedSha1}`,
        );
      }

      log.done(`${log.bold(dep.name)} installed and verified successfully.`);
      log.line();
    }

    log.line();
    log.done('All dependencies are ready!');
    log.line(
      `   - Capstone 4.0.2     -> ${log.dim('packages/capstone/deps/')}`,
    );
    log.line(
      `   - ECJ 3.26.0         -> ${log.dim('packages/njava/deps/ecj-3.26.0.jar')}`,
    );
    log.line(
      `   - ECJ 3.46.100        -> ${log.dim('packages/njava/deps/ecj-3.46.100.jar')}`,
    );
    log.line(
      `   - Tiny-Remapper 0.14 -> ${log.dim('packages/njava/deps/tiny-remapper-0.14.1-fat.jar')}`,
    );
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
