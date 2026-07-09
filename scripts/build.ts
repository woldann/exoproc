import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync, readFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { log } from './logger.js';

const ROOT_DIR = join(import.meta.dirname, '..');
const PACKAGES_DIR = join(ROOT_DIR, 'packages');
const EXAMPLES_DIR = join(ROOT_DIR, 'examples');

/**
 * Bundles each example's `client.tsx` (browser-side React UI, one per
 * `examples/<name>/` folder) to a sibling `client.js` next to it.
 *
 * Done here -- with plain native Linux `bun build`, not `Bun.build()` called
 * from inside the example script itself -- because that script runs under
 * `bun-wine` (Windows bun.exe via Wine), and `Bun.build()` there cannot
 * resolve *any* symlinked `node_modules` entry (confirmed: fails identically
 * whether the dependency is nested several symlink hops deep in Bun's
 * isolated-linker store, or hoisted to a single top-level symlink -- the
 * failure is Windows-bun-under-Wine-vs-symlinks in general, not linker
 * layout). Every other native build artifact in this repo (each package's
 * own dist output) already follows this same "build natively, run/serve
 * under Wine" split; this is that same pattern applied to example client
 * bundles instead of package dist output.
 */
function buildExampleClients() {
  if (!existsSync(EXAMPLES_DIR)) return;

  const entries = readdirSync(EXAMPLES_DIR, { withFileTypes: true });

  for (const entry of entries) {
    // `kit/client.tsx` is a shared *library* of components, not a page
    // entrypoint -- it has no top-level render call, so it's imported by
    // each example's own client.tsx rather than bundled on its own.
    if (!entry.isDirectory() || entry.name === 'kit') continue;

    const entryPath = join(EXAMPLES_DIR, entry.name, 'client.tsx');
    if (!existsSync(entryPath)) continue;

    const outfile = join(EXAMPLES_DIR, entry.name, 'client.js');

    log.info(`Building example client bundle ${entry.name}/client.tsx...`);

    const result = spawnSync(
      'bun',
      [
        'build',
        entryPath,
        '--outfile',
        outfile,
        '--target',
        'browser',
        '--minify',
      ],
      { stdio: 'inherit' },
    );

    if (result.status !== 0) {
      log.fail(
        `Failed to build example client bundle ${entry.name}/client.tsx`,
      );
      process.exit(1);
    }
  }
}

/**
 * Builds `examples/kit/styles.css` (Tailwind v4, CSS-first config) to
 * `examples/kit/styles.generated.css` with the Tailwind CLI -- same
 * "native Linux Bun, not under Wine" reasoning as `buildExampleClients()`.
 */
function buildExampleStyles() {
  const entryPath = join(EXAMPLES_DIR, 'kit', 'styles.css');
  if (!existsSync(entryPath)) return;

  const outfile = join(EXAMPLES_DIR, 'kit', 'styles.generated.css');

  log.info('Building examples/kit/styles.css...');

  const result = spawnSync(
    'bun',
    ['x', '@tailwindcss/cli', '-i', entryPath, '-o', outfile, '--minify'],
    { stdio: 'inherit', cwd: EXAMPLES_DIR },
  );

  if (result.status !== 0) {
    log.fail('Failed to build examples/kit/styles.css');
    process.exit(1);
  }
}

/**
 * Builds all packages in the monorepo centrally.
 */
async function buildAll() {
  log.info('Generating TypeScript declaration files...');
  const tscResult = spawnSync('bun', ['x', 'tsc', '-b'], { stdio: 'inherit' });
  if (tscResult.status !== 0) {
    log.fail('Failed to generate declaration files');
    process.exit(1);
  }

  const packages = readdirSync(PACKAGES_DIR);

  // Dynamically collect all package names in the workspace to mark them as external
  const externals: string[] = [];
  for (const pkg of packages) {
    const pkgJsonPath = join(PACKAGES_DIR, pkg, 'package.json');
    if (existsSync(pkgJsonPath)) {
      try {
        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
        if (pkgJson.name) {
          externals.push(pkgJson.name);
        }
      } catch (err) {
        log.warn(`Failed to parse package.json for ${pkg}: ${err}`);
      }
    }
  }

  for (const pkg of packages) {
    const pkgPath = join(PACKAGES_DIR, pkg);
    const entryPath = join(pkgPath, 'src', 'index.ts');

    if (!existsSync(entryPath)) continue;

    // Get the actual package name from package.json for logging
    let pkgName = pkg;
    const pkgJsonPath = join(pkgPath, 'package.json');
    if (existsSync(pkgJsonPath)) {
      try {
        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
        pkgName = pkgJson.name || pkg;
      } catch {
        // Fallback to folder name
      }
    }

    log.info(`Building ${pkgName}...`);

    const buildArgs = [
      'build',
      entryPath,
      '--outdir',
      join(pkgPath, 'dist'),
      '--target',
      'bun',
    ];

    // Mark all other workspace packages as external
    for (const ext of externals) {
      buildArgs.push('--external', ext);
    }

    const result = spawnSync('bun', buildArgs, { stdio: 'inherit' });

    if (result.status !== 0) {
      log.fail(`Failed to build ${pkgName}`);
      process.exit(1);
    }

    // Each package's `files` array ships its own LICENSE copy -- keep that
    // promise true by copying the root LICENSE alongside its build output.
    if (existsSync(pkgJsonPath)) {
      try {
        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
        if (Array.isArray(pkgJson.files) && pkgJson.files.includes('LICENSE')) {
          copyFileSync(join(ROOT_DIR, 'LICENSE'), join(pkgPath, 'LICENSE'));
        }
      } catch {
        // Already logged/handled above when reading pkgName
      }
    }
  }

  buildExampleStyles();
  buildExampleClients();

  log.info('All packages built successfully.');
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
