import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll } from 'bun:test';

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test-specific environment variables (dotenv does not override vars that
// are already set, so an explicit EXOPROC_* in the environment still wins).
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Route winston's log file into <projectRoot>/logs/ for the test run.
//
// The logger (exoproc-utils) reads EXOPROC_LOG_DIR once, at module load, to
// decide where its DailyRotateFile writes (default: ~/AppData/Roaming/Exoproc/
// logs). This file is a bun `[test].preload`, so it runs *before* any test file
// imports the logger -- so redirecting it here needs zero changes to production
// code. tests/.env sets a *relative* `EXOPROC_LOG_DIR=logs`, which winston
// resolves against the process cwd -- so it lands in the wrong place whenever
// tests are run from anywhere but the repo root. Pin it to an absolute path
// under the repo so it always ends up in the gitignored `logs/`, while still
// honoring an explicit absolute override.
const configuredLogDir = process.env.EXOPROC_LOG_DIR;
process.env.EXOPROC_LOG_DIR =
  configuredLogDir && path.isAbsolute(configuredLogDir)
    ? configuredLogDir
    : path.resolve(__dirname, '..', configuredLogDir ?? 'logs');

// Give Wine a grace period to clean up native threads before the worker exits
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 1000));
});
