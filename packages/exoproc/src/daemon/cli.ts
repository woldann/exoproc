#!/usr/bin/env bun
import { runDaemon } from './server.js';
import { readDaemonState, clearDaemonState, isDaemonAlive } from './state.js';
import chalk from 'chalk';

const args = process.argv.slice(2);
const command = args[0] || 'daemon';

async function main() {
  if (command === 'status') {
    const state = readDaemonState();
    if (!state) {
      console.log(chalk.yellow('Exoproc Daemon is not running.'));
      process.exit(0);
    }
    const alive = await isDaemonAlive(state);
    if (!alive) {
      console.log(
        chalk.red('Exoproc Daemon state exists but daemon is not responding.'),
      );
      clearDaemonState();
      process.exit(1);
    }
    const statusStr = state.attached
      ? chalk.green(`🟢 Active & Attached (PID: ${state.pid})`)
      : chalk.yellow('🟡 Standby (No process attached)');

    console.log('┌─────────────────────────────────────────────────────────┐');
    console.log('│ 📊 Exoproc Daemon Status                                │');
    console.log('├─────────────────────────────────────────────────────────┤');
    console.log(`│ Status:        ${statusStr}`);
    if (state.upgraded) {
      console.log(
        `│ Agent Mode:    ${chalk.bold.green(`🚀 Upgraded (In-Process Agent on :${state.agentPort})`)}`,
      );
    } else if (state.attached) {
      console.log(
        `│ Agent Mode:    ${chalk.cyan('External Memory Bridge (NThread)')}`,
      );
    }
    if (state.attached) {
      console.log(`│ Target:        ${state.targetName} (PID: ${state.pid})`);
      console.log(`│ Window:        ${state.windowTitle || 'N/A'}`);
      console.log(`│ Profile:       ${state.profile || 'auto'}`);
    }
    console.log(`│ Daemon PID:    ${state.daemonPid}`);
    console.log(`│ Port:          ${state.port}`);
    console.log(
      `│ Uptime:        ${Math.floor((Date.now() - state.startedAt) / 1000)}s`,
    );
    console.log('└─────────────────────────────────────────────────────────┘');
    process.exit(0);
  }

  if (command === 'detach') {
    const state = readDaemonState();
    if (!state) {
      console.log('No active daemon found.');
      process.exit(0);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${state.port}/detach`, {
        method: 'POST',
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        console.log(
          chalk.green(
            '✓ Daemon detached from target process (remains in Standby mode).',
          ),
        );
      }
    } catch (e: any) {
      console.error(chalk.red(`Detach failed: ${e.message}`));
    }
    process.exit(0);
  }

  if (command === 'shutdown' || command === 'stop') {
    const state = readDaemonState();
    if (!state) {
      console.log('No active daemon found.');
      process.exit(0);
    }
    try {
      await fetch(`http://127.0.0.1:${state.port}/shutdown`, {
        method: 'POST',
        signal: AbortSignal.timeout(3000),
      });
      console.log(chalk.green('✓ Exoproc daemon process stopped.'));
    } catch {}
    clearDaemonState();
    process.exit(0);
  }

  if (command === 'procs' || command === 'list') {
    const state = readDaemonState();
    if (!state) {
      console.log(
        chalk.red('Exoproc Daemon is not running. Launch daemon first.'),
      );
      process.exit(1);
    }
    const res = await fetch(`http://127.0.0.1:${state.port}/processes`);
    const data = (await res.json()) as any;
    console.log('\nAvailable Processes:');
    for (const p of data.processes || []) {
      const mark = p.isMinecraft ? chalk.green('★ Minecraft') : ' ';
      console.log(
        `  [PID: ${p.pid.toString().padStart(6)}] ${p.name.padEnd(16)} ${p.windowTitle || ''} ${mark}`,
      );
    }
    process.exit(0);
  }

  if (command === 'attach') {
    const state = readDaemonState();
    if (!state) {
      console.log(
        chalk.red('Exoproc Daemon is not running. Start daemon first.'),
      );
      process.exit(1);
    }
    const targetPid = args[1] ? parseInt(args[1], 10) : undefined;
    const res = await fetch(`http://127.0.0.1:${state.port}/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pid: targetPid }),
    });
    const data = (await res.json()) as any;
    if (data.success) {
      console.log(
        chalk.green(
          `✓ Successfully attached to ${data.targetName} (PID: ${data.pid})`,
        ),
      );
    } else {
      console.error(chalk.red(`❌ Attach failed: ${data.error}`));
      process.exit(1);
    }
    process.exit(0);
  }

  if (command === 'upgrade') {
    const state = readDaemonState();
    if (!state) {
      console.log(
        chalk.red('Exoproc Daemon is not running. Start daemon first.'),
      );
      process.exit(1);
    }
    const classPath = args[1] && !args[1].startsWith('-') ? args[1] : undefined;
    let port: number | undefined;
    let obfuscate = false;
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--port' && args[i + 1]) {
        port = parseInt(args[i + 1]!, 10);
      }
      if (args[i] === '--obfuscate') {
        obfuscate = true;
      }
    }

    const res = await fetch(`http://127.0.0.1:${state.port}/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classPath, port, obfuscate }),
    });
    const data = (await res.json()) as any;
    if (data.success) {
      console.log(
        chalk.green(
          `✓ Successfully upgraded to in-process Java Agent on port ${data.port}`,
        ),
      );
    } else {
      console.error(chalk.red(`❌ Upgrade failed: ${data.error}`));
      process.exit(1);
    }
    process.exit(0);
  }

  if (command === 'daemon' || !command.startsWith('-')) {
    let port: number | undefined;
    let host: string | undefined;
    let autoAttach = false;
    let pid: number | undefined;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--port' && args[i + 1]) {
        port = parseInt(args[i + 1]!, 10);
      }
      if (args[i] === '--host' && args[i + 1]) {
        host = args[i + 1];
      }
      if (args[i] === '--auto-attach') {
        autoAttach = true;
      }
      if (args[i] === '--pid' && args[i + 1]) {
        pid = parseInt(args[i + 1]!, 10);
      }
    }

    try {
      const { hasNativeXffi } = await import('../capabilities.js');
      if (!hasNativeXffi()) {
        console.error(
          chalk.red(
            '❌ Native FFI (bun-xffi) is not available. Exoproc daemon requires Windows x64 with Bun.',
          ),
        );
        process.exit(1);
      }
      await runDaemon({ port, host, autoAttach, pid });
    } catch (err: any) {
      console.error(
        chalk.red(`\n❌ Daemon initialization failed: ${err?.message || err}`),
      );
      process.exit(1);
    }
    return;
  }

  console.log(
    `Usage: exoproc daemon [daemon|status|attach|detach|procs|shutdown] [--port <n>] [--host <ip>] [--auto-attach]`,
  );
}

main().catch((err) => {
  console.error(chalk.red(`Fatal error: ${err.message || err}`));
  process.exit(1);
});
