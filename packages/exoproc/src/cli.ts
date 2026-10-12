import chalk from 'chalk';
import { NeptuneClient } from './client.js';
import { openDesktopCockpit } from './webview/index.js';
import { DEFAULT_NEPTUNE_WEB_URL, generateDynamicApiKey } from './constants.js';

function drawBox(lines: string[], borderColor = chalk.cyan): string {
  const stripAnsi = (str: string) =>
    str
      .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/\u001B]8;;[^\u0007]*\u0007/g, '');
  const visibleLengths = lines.map((l) => stripAnsi(l).length);
  const maxLen = Math.max(...visibleLengths, 58);

  const top = borderColor('┌' + '─'.repeat(maxLen + 2) + '┐');
  const bottom = borderColor('└' + '─'.repeat(maxLen + 2) + '┘');
  const middle = borderColor('├' + '─'.repeat(maxLen + 2) + '┤');

  const formattedLines = lines.map((line) => {
    if (line === '---') return middle;
    const len = stripAnsi(line).length;
    const padding = ' '.repeat(Math.max(0, maxLen - len));
    return borderColor('│ ') + line + padding + borderColor(' │');
  });

  return [top, ...formattedLines, bottom].join('\n');
}

const PROFILE_ALIASES: Record<string, string> = {
  auto: 'auto',
  generic: 'generic_auto',
  generic_auto: 'generic_auto',
  '1.8.9': 'vanilla_1_8_9',
  '1.8': 'vanilla_1_8_9',
  vanilla: 'vanilla_1_8_9',
  'vanilla-1.8.9': 'vanilla_1_8_9',
  vanilla_1_8_9: 'vanilla_1_8_9',
  lunar: 'lunar_client',
  'lunar-client': 'lunar_client',
  lunar_client: 'lunar_client',
  badlion: 'badlion_client',
  'badlion-client': 'badlion_client',
  badlion_client: 'badlion_client',
  feather: 'feather_client',
  'feather-client': 'feather_client',
  feather_client: 'feather_client',
  forge: 'forge_1_8_9',
  'forge-1.8.9': 'forge_1_8_9',
  forge_1_8_9: 'forge_1_8_9',
};

function normalizeProfileId(raw: string): string {
  const clean = raw.toLowerCase().trim();
  return PROFILE_ALIASES[clean] || clean;
}

function getUserArgs(): string[] {
  const argv = process.argv;
  if (argv.length <= 1) return [];
  const first = (argv[0] || '').toLowerCase().replace(/\\/g, '/');

  const isRuntime =
    first.endsWith('/bun') ||
    first.endsWith('/bun.exe') ||
    first === 'bun' ||
    first === 'bun.exe' ||
    first.endsWith('/node') ||
    first.endsWith('/node.exe') ||
    first === 'node' ||
    first === 'node.exe';

  if (isRuntime) {
    return argv.slice(2);
  }

  return argv.slice(1);
}

async function main() {
  const rawArgs = getUserArgs();

  if (rawArgs[0] === 'run') {
    const scriptTarget = rawArgs[1];
    if (!scriptTarget) {
      console.error(
        chalk.red(
          'Error: Please specify a script file to run. Usage: exoproc run <script.ts|script.js>',
        ),
      );
      process.exit(1);
    }
    const proc = Bun.spawnSync(
      ['bun', 'run', scriptTarget, ...rawArgs.slice(2)],
      {
        stdio: ['inherit', 'inherit', 'inherit'],
        env: process.env,
      },
    );
    process.exit(proc.exitCode ?? 0);
  }

  let cliPort: number | null = null;
  let cliPid: number | null = null;
  let cliProfile = 'auto';
  let isHeadless = false;
  let isHelp = false;

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i] || '';
    if (arg === '--help' || arg === '-h') {
      isHelp = true;
    } else if (arg === '--headless' || arg === '--no-gui' || arg === '--cli') {
      isHeadless = true;
    } else if (arg.startsWith('--port=')) {
      const val = parseInt(arg.split('=')[1] || '', 10);
      if (!isNaN(val)) cliPort = val;
    } else if (arg.startsWith('--cdp=')) {
      const val = parseInt(arg.split('=')[1] || '', 10);
      if (!isNaN(val)) cliPort = val;
    } else if (
      (arg === '--port' ||
        arg === '-p' ||
        arg === '--cdp' ||
        arg === '--cdp-port') &&
      rawArgs[i + 1]
    ) {
      const val = parseInt(rawArgs[++i] || '', 10);
      if (!isNaN(val)) cliPort = val;
    } else if (arg.startsWith('--pid=')) {
      const val = parseInt(arg.split('=')[1] || '', 10);
      if (!isNaN(val)) cliPid = val;
    } else if ((arg === '--pid' || arg === '-P') && rawArgs[i + 1]) {
      const val = parseInt(rawArgs[++i] || '', 10);
      if (!isNaN(val)) cliPid = val;
    } else if (arg.startsWith('--profile=')) {
      cliProfile = arg.slice('--profile='.length) || 'auto';
    } else if (arg === '--profile' && rawArgs[i + 1]) {
      cliProfile = rawArgs[++i] || 'auto';
    }
  }

  const resolvedProfile = normalizeProfileId(cliProfile);

  if (isHelp) {
    console.log(`
${chalk.bold.cyan('Neptune')} - Next-Gen Autonomous Game Instrumentation & Standalone Cockpit

${chalk.bold.white('Usage:')}
  neptune [options]

${chalk.bold.yellow('Options:')}
  --port, -p <port>       CDP / Webview IPC port
  --pid, -P <PID>         Explicit target process PID (optional; auto-detected if omitted)
  --profile <id>          Target game profile (default: auto)
                          Supported: auto, 1.8.9 (vanilla), lunar, badlion, feather, forge, generic
  --headless, --no-gui    Run in headless mode without opening desktop window
  --help, -h              Show this help message

${chalk.bold.white('Examples:')}
  neptune
  neptune --pid 1200
  neptune --profile lunar
`);
    process.exit(0);
  }

  const dashboardUrl = (
    process.env.NEPTUNE_WEB_URL || DEFAULT_NEPTUNE_WEB_URL
  ).replace(/\/+$/, '');
  const apiKey = generateDynamicApiKey();

  const client = new NeptuneClient();

  const sessionNonce =
    Math.random().toString(36).substring(2) + Date.now().toString(36);
  const approvalUrl = `${dashboardUrl}/console?native=1&session=${sessionNonce}`;

  const bannerLines = [
    chalk.bold.cyan(
      '  ███╗   ██╗███████╗██████╗ ████████╗██╗   ██╗███╗   ██╗███████╗',
    ),
    chalk.bold.cyan(
      '  ████╗  ██║██╔════╝██╔══██╗╚══██╔══╝██║   ██║████╗  ██║██╔════╝',
    ),
    chalk.bold.cyan(
      '  ██╔██╗ ██║█████╗  ██████╔╝   ██║   ██║   ██║██╔██╗ ██║█████╗  ',
    ),
    chalk.bold.cyan(
      '  ██║╚██╗██║██╔══╝  ██╔═══╝    ██║   ██║   ██║██║╚██╗██║██╔══╝  ',
    ),
    chalk.bold.cyan(
      '  ██║ ╚████║███████╗██║        ██║   ╚██████╔╝██║ ╚████║███████╗',
    ),
    chalk.bold.cyan(
      '  ╚═╝  ╚═══╝╚══════╝╚═╝        ╚═╝    ╚═════╝ ╚═╝  ╚═══╝╚══════╝',
    ),
    chalk.dim(
      '     Next-Gen Autonomous Game Instrumentation & Standalone Cockpit',
    ),
    '---',
    `${chalk.bold.white('🌐 Webview IPC:')}       ${chalk.green.bold(cliPort ? `Direct Connect (Port ${cliPort})` : 'Active (DevTools In-Process Bridge)')}`,
    `${chalk.bold.white('⚡ Ports Opened:')}     ${chalk.green.bold('Zero (No Listening Sockets)')}`,
    `${chalk.bold.white('🔑 Session Token:')}    ${chalk.yellow.bold(apiKey.substring(0, 18) + '...')}`,
    `${chalk.bold.white('🪟 Desktop Window:')}   ${chalk.bold.cyan(isHeadless ? 'Headless Mode' : 'Standalone Hybrid Window')}`,
    `${chalk.bold.white('☁️  Web Cockpit Host:')} ${chalk.magenta.bold(dashboardUrl)}`,
    `${chalk.bold.white('🍪 Client Storage:')}   ${chalk.magenta('Zero-Database / Client State')}`,
    '---',
    `${chalk.bold.white('🎮 Game Profile:')}    ${chalk.cyan(resolvedProfile === 'auto' ? 'Auto (Automatic Detection)' : resolvedProfile)}`,
    `${chalk.bold.white('🎯 Target Process:')}   ${chalk.yellow(cliPid ? `Explicit Target PID (${cliPid})` : 'Scanning for Minecraft (javaw.exe)...')}`,
    '---',
    chalk.dim(
      'Press [Ctrl + C] in terminal to gracefully disconnect & shutdown.',
    ),
  ];

  // Print banner IMMEDIATELY on startup
  console.log('\n' + drawBox(bannerLines) + '\n');

  const handleShutdown = async (reason: string = 'User request') => {
    console.log(
      `\n${chalk.yellow(`⚡ ${reason} - Shutting down Neptune gracefully...`)}`,
    );
    clearInterval(keepAliveTimer);
    try {
      webview?.close();
      await client.disconnect();
    } catch {}
    console.log(chalk.green('✓ Neptune shut down successfully.\n'));
    process.exit(0);
  };

  // Open standalone desktop window with CDP IPC bridge
  let webview: any = null;
  if (!isHeadless) {
    console.log(
      `${chalk.green('⚡ Launching OAuth Permission & Cockpit:')} ${chalk.bold.cyan(approvalUrl)}`,
    );
    try {
      webview = await openDesktopCockpit({
        title: 'Neptune Cockpit',
        url: approvalUrl,
        sessionNonce,
        port: cliPort ?? undefined,
        width: 1280,
        height: 840,
        apiKey,
        client,
        onClose: () => {
          handleShutdown('Webview / port connection closed');
        },
      });
    } catch {}
  } else {
    console.log(
      `${chalk.green('⚡ Web Cockpit Connection URL:')} ${chalk.bold.cyan(approvalUrl)}`,
    );
  }

  // Background auto-attach to Minecraft
  try {
    const procs = await client.listProcesses();
    let mcProc: any = null;

    if (cliPid) {
      mcProc = procs.find((p) => p.pid === cliPid) || {
        pid: cliPid,
        name: 'Target JVM Process',
        windowTitle: 'Minecraft (PID)',
        suggestedProfile: {
          id: 'vanilla_1_8_9',
          name: 'Vanilla Minecraft 1.8.9',
        },
      };
    } else {
      mcProc = procs.find((p) => p.isMinecraft || p.isJava);
    }

    if (mcProc) {
      console.log(
        `${chalk.green('✓ Found target process:')} ${chalk.bold(mcProc.name)} (PID: ${chalk.green.bold(mcProc.pid)}) - ${chalk.cyan(mcProc.windowTitle || 'Minecraft')}`,
      );
      try {
        const targetProfileId =
          resolvedProfile && resolvedProfile !== 'auto'
            ? resolvedProfile
            : (mcProc.suggestedProfile?.id ?? 'vanilla_1_8_9');
        await client.connect(mcProc.pid, targetProfileId);
        console.log(
          `${chalk.green.bold('⚡ Successfully attached!')} Profile: [${chalk.magenta(client.activeProfile?.name ?? targetProfileId)}]`,
        );
      } catch (attachErr: any) {
        console.log(
          `${chalk.yellow('ℹ Standby:')} Target process found, ready for attachment via Web UI (${attachErr.message})`,
        );
      }
    } else {
      console.log(
        `${chalk.dim('ℹ No active Minecraft process found yet. Launch Minecraft or attach via Web UI.')}`,
      );
    }
  } catch {}

  // Keep process alive while running
  const keepAliveTimer = setInterval(() => {}, 10000);

  // Handle graceful exit
  process.on('SIGINT', () => handleShutdown('SIGINT received'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM received'));
}

main().catch((err) => {
  console.error(chalk.red('Fatal error starting Neptune:'), err);
  process.exit(1);
});
