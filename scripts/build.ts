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
 * A package's `exports` field can declare subpaths (`./cdefine`,
 * `./bun-ffi`, ...) pointing at their own `dist/*.js` file, distinct from
 * the main `dist/index.js` bundle. `bun build entryPath` alone never
 * produces those -- each needs to be its own entry point -- even though
 * another package's bundle can reference one via a plain external
 * `import ... from '<pkg>/<subpath>'` left in place by `--external` below.
 * Resolves each declared subpath's `dist/....js` back to the `src/....ts`
 * it's built from, skipping the main `"."` entry (already `entryPath`)
 * and anything unresolvable (non-string `import` condition, missing
 * source file).
 */
function additionalExportEntries(
  pkgJson: Record<string, unknown>,
  pkgPath: string,
): string[] {
  const exportsField = pkgJson.exports;
  if (!exportsField || typeof exportsField !== 'object') return [];

  const entries: string[] = [];
  for (const [subpath, target] of Object.entries(
    exportsField as Record<string, unknown>,
  )) {
    if (subpath === '.') continue;
    const importPath =
      target && typeof target === 'object'
        ? (target as Record<string, unknown>).import
        : target;
    if (typeof importPath !== 'string') continue;

    const relativeSrc = importPath
      .replace(/^\.\/dist\//, '')
      .replace(/\.js$/, '.ts');
    const srcPath = join(pkgPath, 'src', relativeSrc);
    if (existsSync(srcPath)) entries.push(srcPath);
  }
  return entries;
}

/**
 * Builds all packages in the monorepo centrally.
 */
async function buildAll() {
  log.info('Generating TypeScript declaration files...');
  // `--force`, not a plain `tsc -b`: the incremental build cache
  // (`*.tsbuildinfo`, gitignored) only tracks source mtimes vs. its own
  // last-known state -- it never checks whether the `.d.ts` outputs it
  // recorded are actually still on disk. Delete `dist/` (a clean checkout,
  // a CI cache miss on `dist/` but not on a leftover `.tsbuildinfo`, ...)
  // while the buildinfo survives, and a plain `tsc -b` reports every
  // project "up to date" and silently emits nothing, even though every
  // declaration file is gone -- confirmed reproducing exactly that against
  // Cloudflare's own build-output caching. `--force` ignores the cache
  // and always re-emits, trading a bit of rebuild time for actually being
  // correct.
  const tscResult = spawnSync('bun', ['x', 'tsc', '-b', '--force'], {
    stdio: 'inherit',
  });
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

    // Parsed once and reused below for the package name, its additional
    // export entries, and the LICENSE-copy check.
    let pkgJson: Record<string, unknown> = {};
    const pkgJsonPath = join(pkgPath, 'package.json');
    if (existsSync(pkgJsonPath)) {
      try {
        pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
      } catch (err) {
        log.warn(`Failed to parse package.json for ${pkg}: ${err}`);
      }
    }
    const pkgName = (pkgJson.name as string | undefined) ?? pkg;

    log.info(`Building ${pkgName}...`);

    // Standalone worker entry points (e.g. `waiter-worker.ts`) get their own
    // bundle, built alongside the main entry in the same invocation, so each
    // is fully self-contained and independently loadable via `new Worker(...)`
    // -- the main bundle only ever references them by relative URL at
    // runtime, never imports them, so `bun build` wouldn't otherwise know
    // they're reachable.
    const srcDir = join(pkgPath, 'src');
    const workerEntries = readdirSync(srcDir).filter((f) =>
      f.endsWith('-worker.ts'),
    );

    const buildArgs = [
      'build',
      entryPath,
      ...workerEntries.map((f) => join(srcDir, f)),
      ...additionalExportEntries(pkgJson, pkgPath),
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
    if (Array.isArray(pkgJson.files) && pkgJson.files.includes('LICENSE')) {
      copyFileSync(join(ROOT_DIR, 'LICENSE'), join(pkgPath, 'LICENSE'));
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
