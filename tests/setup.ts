import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { afterAll } from 'bun:test';
import {
  closeGlobalDummyProcess,
  setSpawnStrategy,
  type SpawnStrategy,
} from 'exoproc-dummy';
import { Kernel32Impl, ProcessAccess } from 'bun-xffi';

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

// exoproc-dummy's DummyProcess spawns via a de-elevated CreateProcessAsUserA
// by default (see packages/dummy/src/dummy.ts) -- the real, intended
// behavior, verified working both under Wine and on real Windows hardware,
// locally. That exact call reliably crashes Bun specifically on GitHub
// Actions' *hosted* runners (confirmed via a standalone diagnostic script:
// identical code completes cleanly on two independent real environments and
// faults on the same CreateProcessAsUserA call on both a GitHub-hosted
// Linux+Wine runner and a GitHub-hosted windows-latest runner) -- a hosted-
// runner virtualization incompatibility, not a bug in the call itself. Swap
// in a child_process.spawn-based strategy only in that specific environment,
// without touching the real implementation.
if (process.env.GITHUB_ACTIONS === 'true') {
  const spawnViaChildProcess: SpawnStrategy = (executable, args) => {
    const child = spawn(executable, args, { stdio: 'ignore' });
    if (!child.pid) {
      throw new Error(`Failed to spawn dummy process (${executable})`);
    }
    child.unref();

    // DummyProcess's constructor already sleeps 2s *after* this returns (to
    // let the process reach a running state before hijacking); this just
    // needs a valid handle, which OpenProcess almost always gets on the
    // first try since spawn() only returns once the OS process exists --
    // retry briefly instead of stacking another flat multi-second sleep.
    let handle = 0;
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      handle = Number(
        Kernel32Impl.OpenProcess(ProcessAccess.ALL_ACCESS, 0, child.pid),
      );
      if (handle !== 0) break;
      Bun.sleepSync(50);
    }
    if (handle === 0) {
      throw new Error(`OpenProcess failed for spawned pid ${child.pid}`);
    }
    return { pid: child.pid, handle };
  };
  setSpawnStrategy(spawnViaChildProcess);
}

// Every test file that needs a cross-process target shares one dummy
// process (see exoproc-dummy) instead of spawning its own -- close it once,
// for the whole run, here.
afterAll(async () => {
  await closeGlobalDummyProcess();
});

// Give Wine a grace period to clean up native threads before the worker exits
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 1000));
});
