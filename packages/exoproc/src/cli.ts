#!/usr/bin/env bun
import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { service } from './service.js';
import { isToolMode, getRuntimeMode } from './capabilities.js';
import { renderCliResult } from './ui/index.js';
import { VERSION } from './version.js';

const program = new Command();

program
  .name('exoproc')
  .description(
    'Unified external Minecraft automation client, CLI runner, MCP server, and runtime instrumentation framework',
  )
  .version(VERSION)
  .option('--json', 'Output pure JSON instead of human-friendly terminal UI');

function readStdin(): Promise<string> {
  if (typeof Bun !== 'undefined' && (Bun as any).stdin) {
    try {
      return (Bun as any).stdin.text();
    } catch {}
  }
  if (process.stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (c) =>
      chunks.push(typeof c === 'string' ? Buffer.from(c) : c),
    );
    process.stdin.on('end', () =>
      resolve(Buffer.concat(chunks).toString('utf8')),
    );
    process.stdin.on('error', () => resolve(''));
  });
}

/**
 * Direct service execution for CLI commands.
 * Renders beautiful Ink views for interactive terminal use, or outputs pure JSON with --json / piped stdout.
 */
async function runService<T>(
  commandName: string,
  fn: () => Promise<T>,
  opts?: { json?: boolean },
): Promise<void> {
  const isJson = Boolean(opts?.json ?? program.opts().json);
  try {
    const data = await fn();
    await renderCliResult(commandName, data, { json: isJson });
    if (data && (data as any).success === false) {
      process.exit(1);
    }
    process.exit(0);
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    const errPayload = {
      success: false,
      mode: getRuntimeMode(),
      error: msg,
    };
    await renderCliResult(commandName, errPayload, { json: isJson });
    process.exit(1);
  }
}

// 1. Status & Process Control
program
  .command('status')
  .description('Get connection and instrumentation status')
  .option('--json', 'Output pure JSON')
  .action((opts) =>
    runService(
      'status',
      async () => {
        const status = await service.getStatus();
        if (!status) {
          return {
            alive: false,
            connected: false,
            mode: getRuntimeMode(),
            message: isToolMode()
              ? 'No active Exoproc daemon or agent connected. (Running in Tool Mode)'
              : 'No process attached. (Running in Native Mode)',
          };
        }
        return status;
      },
      opts,
    ),
  );

program
  .command('procs')
  .description('List candidate Minecraft and target processes')
  .option('--json', 'Output pure JSON')
  .action((opts) => runService('procs', () => service.listProcesses(), opts));

program
  .command('attach [pid]')
  .description('Attach to target process (Minecraft / JVM)')
  .option('--json', 'Output pure JSON')
  .action((pidStr, opts) => {
    const pid = pidStr ? parseInt(pidStr, 10) : undefined;
    return runService('attach', () => service.attach(pid), opts);
  });

program
  .command('select [target]')
  .description(
    'Select or list active Exoproc targets (cached accessor sessions or agent slots 1-3)',
  )
  .option('--json', 'Output pure JSON')
  .action((target, opts) =>
    runService('select', () => (service as any).selectTarget(target), opts),
  );

program
  .command('upgrade-agent [classPath]')
  .alias('upgrade')
  .description(
    'Upgrade target connection to in-process Java Agent by loading .class bytecode',
  )
  .option(
    '-p, --port <port>',
    'Agent port (defaults to next available agent slot)',
  )
  .option('--obfuscate', 'Obfuscate agent bytecode with TinyRemapper')
  .option('--json', 'Output pure JSON')
  .action((classPath, opts) =>
    runService(
      'upgrade-agent',
      () =>
        service.upgrade({
          classPath,
          port: opts.port ? parseInt(opts.port, 10) : undefined,
          obfuscate: opts.obfuscate ?? false,
        }),
      opts,
    ),
  );

program
  .command('detach')
  .description('Detach from current target process')
  .option('--json', 'Output pure JSON')
  .action((opts) => runService('detach', () => service.detach(), opts));

program
  .command('shutdown')
  .description('Shut down active session / daemon')
  .option('--json', 'Output pure JSON')
  .action((opts) => runService('shutdown', () => service.shutdown(), opts));

// 2. Game Telemetry & World State
program
  .command('player')
  .alias('p')
  .description(
    'Get current player telemetry (coords, rotation, health, motion, etc.)',
  )
  .option('--json', 'Output pure JSON')
  .action((opts) => runService('player', () => service.getPlayer(), opts));

program
  .command('world')
  .alias('w')
  .description('Get world state (time, weather, entity count, dimension)')
  .option('--json', 'Output pure JSON')
  .action((opts) => runService('world', () => service.getWorld(), opts));

program
  .command('gui')
  .alias('screen')
  .alias('g')
  .description('Get active GUI screen, buttons, and interaction targets')
  .option('--pool', 'Include resolved pool details')
  .option('--json', 'Output pure JSON')
  .action((opts) =>
    runService(
      'gui',
      () => service.getGui({ includePool: Boolean(opts.pool) }),
      opts,
    ),
  );

program
  .command('state')
  .description('Get combined game snapshot (gui, player, and world)')
  .option('--json', 'Output pure JSON')
  .action((opts) => runService('state', () => service.getState(), opts));

program
  .command('target')
  .alias('raytrace')
  .description('Raytrace look vector to find aimed block or entity')
  .option('-r, --reach <blocks>', 'Maximum reach distance in blocks', '30')
  .option('--json', 'Output pure JSON')
  .action((opts) =>
    runService(
      'target',
      () => service.getTarget(parseFloat(opts.reach) || 30),
      opts,
    ),
  );

program
  .command('entities')
  .alias('radar')
  .description('Scan loaded entities around player')
  .option('-r, --radius <blocks>', 'Search radius in blocks', '64')
  .option('--json', 'Output pure JSON')
  .action((opts) =>
    runService(
      'entities',
      () => service.getEntities(parseFloat(opts.radius) || 64),
      opts,
    ),
  );

program
  .command('inventory')
  .alias('inv')
  .description('Inspect player inventory, hotbar, and equipped armor')
  .option('--json', 'Output pure JSON')
  .action((opts) =>
    runService('inventory', () => service.getInventory(), opts),
  );

program
  .command('java')
  .alias('inspect-java')
  .description(
    'Inspect Java runtime environment, JVM specifications, and classpath',
  )
  .option('--json', 'Output pure JSON')
  .action((opts) => runService('java', () => service.getJava(), opts));

// 3. GUI Navigation & Automation
program
  .command('click <idOrText>')
  .description('Click a GUI button by ID number or label text')
  .option('--json', 'Output pure JSON')
  .action((target, opts) => {
    const selector = /^\d+$/.test(target) ? parseInt(target, 10) : target;
    return runService('click', () => service.click(selector), opts);
  });

program
  .command('close-screen')
  .alias('close')
  .description('Close open GUI screen and return to game')
  .option('--json', 'Output pure JSON')
  .action((opts) =>
    runService('close-screen', () => service.closeScreen(), opts),
  );

program
  .command('resume')
  .description('Resume game from pause menu')
  .option('--json', 'Output pure JSON')
  .action((opts) => runService('resume', () => service.resume(), opts));

program
  .command('navigate [target]')
  .option(
    '-t, --target <screen>',
    'Target GUI screen (e.g. options, video, sounds, controls, InGame)',
  )
  .option('-v, --verbose', 'Log step-by-step progress details')
  .option('--json', 'Output final result as JSON only')
  .description(
    'Automatically navigate world menus to target screen (options, video, sounds, controls, InGame)',
  )
  .action((targetArg, opts) => {
    const target = targetArg || opts.target;
    if (!target) {
      return runService(
        'navigate',
        async () => {
          let currentScreen = 'Unknown';
          try {
            const gui = await service.getGui();
            currentScreen = gui.screenName || 'Unknown';
          } catch {}
          const availableTargets = [
            'options',
            'video',
            'sounds',
            'controls',
            'skin',
            'chat',
            'singleplayer',
            'multiplayer',
            'InGame',
          ];
          return {
            success: true,
            isHelp: true,
            currentScreen,
            availableTargets,
            message: `Currently on: ${currentScreen}. Please specify a destination screen.`,
          };
        },
        opts,
      );
    }

    if (opts.json) {
      return runService('navigate', () => service.navigate(target), opts);
    }

    return runService(
      'navigate',
      () =>
        service.navigate(
          target,
          opts.verbose ? (msg) => console.log(`[navigate] ${msg}`) : undefined,
        ),
      opts,
    );
  });

// 4. Physical Actions & Player Controls
program
  .command('chat <message...>')
  .description('Send chat message or execute command in-game')
  .option('--json', 'Output pure JSON')
  .action((words, opts) =>
    runService('chat', () => service.chat(words.join(' ')), opts),
  );

program
  .command('look <yaw> <pitch>')
  .description('Set player camera rotation angles (yaw, pitch)')
  .option('--json', 'Output pure JSON')
  .action((yawStr, pitchStr, opts) =>
    runService(
      'look',
      () => service.look(parseFloat(yawStr), parseFloat(pitchStr)),
      opts,
    ),
  );

program
  .command('action <action>')
  .description('Perform player action (swing | attack | use | jump)')
  .option('--json', 'Output pure JSON')
  .action((act, opts) => runService('action', () => service.action(act), opts));

program
  .command('jump')
  .description('Make player jump')
  .option('--json', 'Output pure JSON')
  .action((opts) => runService('jump', () => service.jump(), opts));

program
  .command('attack')
  .alias('swing')
  .description('Left-click / swing arm / attack')
  .option('--json', 'Output pure JSON')
  .action((opts) => runService('attack', () => service.attack(), opts));

program
  .command('use')
  .description('Right-click / use item / place block')
  .option('--json', 'Output pure JSON')
  .action((opts) => runService('use', () => service.use(), opts));

program
  .command('slot <index>')
  .description('Select hotbar slot (0-8)')
  .option('--json', 'Output pure JSON')
  .action((idxStr, opts) =>
    runService('slot', () => service.slot(parseInt(idxStr, 10)), opts),
  );

// 5. Script Execution & Eval
program
  .command('eval <code...>')
  .description(
    'Evaluate JavaScript code inside Java JVM via Nashorn/Bun runtime',
  )
  .option(
    '-m, --minecraft',
    'Enable Minecraft mode and register Minecraft obfuscation mappings before execution',
  )
  .option(
    '-p, --pool <path>',
    'Preload mappings JSON file into pool (skips reflection scan if already mapped)',
  )
  .option('--json', 'Output pure JSON')
  .action((words, opts) =>
    runService(
      'eval',
      () =>
        service.evalCode(words.join(' '), {
          minecraft: Boolean(opts.minecraft),
          poolPath: opts.pool,
        }),
      opts,
    ),
  );

program
  .command('run [target...]')
  .description(
    'Directly run JavaScript or TypeScript code / script file against Java JVM',
  )
  .option('-f, --file <file>', 'Path to local script file to execute')
  .option(
    '-m, --minecraft',
    'Enable Minecraft mode and register Minecraft obfuscation mappings before execution',
  )
  .option(
    '-p, --pool <path>',
    'Preload mappings JSON file into pool (skips reflection scan if already mapped)',
  )
  .option('--json', 'Output pure JSON')
  .action(async (words, opts) => {
    let scriptPath: string | undefined = opts.file;
    let scriptCode: string | undefined;

    if (words && words.length > 0) {
      const firstArg = words[0];
      if (
        words.length === 1 &&
        (existsSync(firstArg) ||
          firstArg.endsWith('.js') ||
          firstArg.endsWith('.ts'))
      ) {
        scriptPath = firstArg;
      } else {
        scriptCode = words.join(' ');
      }
    }

    if (!scriptPath && !scriptCode) {
      try {
        const stdin = await readStdin();
        if (stdin.trim()) {
          scriptCode = stdin;
        }
      } catch {}
    }

    if (!scriptPath && !scriptCode) {
      console.error(
        JSON.stringify(
          {
            success: false,
            error:
              'No script code or file specified. Usage: exoproc run <file.js|code...>',
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }

    return runService(
      'run',
      () =>
        service.runScript(scriptPath, scriptCode, undefined, {
          minecraft: Boolean(opts.minecraft),
          poolPath: opts.pool,
        }),
      opts,
    );
  });

// 6. Screenshot (Captures in-game OpenGL framebuffer)
program
  .command('screenshot [outputPath]')
  .description('Capture in-game screenshot (OpenGL framebuffer -> Base64 PNG)')
  .option('-n, --no-save', 'Do not save to file (keep in-memory/base64 only)')
  .option('--json', 'Output pure JSON')
  .action((outputPath, opts) => {
    let target: string | undefined = outputPath;
    if (opts.save !== false && !target) {
      target = resolve(process.cwd(), `screenshot-${Date.now()}.png`);
    }
    return runService('screenshot', () => service.screenshot(target), opts);
  });

// 7. Dump / Extract Agent (JAR or .class)
program
  .command('agent:dump [outputPath]')
  .alias('dump-agent')
  .alias('agent:extract')
  .alias('agent:export')
  .description(
    'Extract compiled Exoproc Java agent as a .jar or raw .class file for inspection or manual deployment',
  )
  .option('-p, --port <port>', 'Bake port into agent (default: 43378)', '43378')
  .option('--java <version>', 'Target Java major version (default: 8)', '8')
  .option(
    '-c, --class',
    'Extract raw .class bytecode (Exoproc.class) instead of a JAR',
  )
  .option('-j, --jar', 'Extract as a .jar archive')
  .option('--obfuscate', 'Obfuscate agent bytecode with TinyRemapper')
  .option('--json', 'Output pure JSON')
  .action((outputPath, opts) => {
    const isClass =
      Boolean(opts.class) ||
      (outputPath && outputPath.toLowerCase().endsWith('.class'));
    const isJar = Boolean(opts.jar);
    const format = isClass ? 'class' : isJar ? 'jar' : undefined;

    return runService(
      'agent:dump',
      () =>
        service.dumpAgent({
          path: outputPath,
          format,
          port: opts.port ? parseInt(opts.port, 10) : 43378,
          javaVersion: opts.java ? parseInt(opts.java, 10) : 8,
          obfuscate: Boolean(opts.obfuscate),
        }),
      opts,
    );
  });

program
  .command('inspect-jar <jarPath>')
  .alias('inspect')
  .description('Inspect classes, methods, and structure of a target .jar file')
  .option('-p, --port <port>', 'Agent HTTP port (default: 43378)', '43378')
  .option('-f, --filter <regex>', 'Filter class names matching pattern')
  .option('-e, --eval <code>', 'Execute JavaScript snippet inside agent')
  .option('-m, --mappings <file>', 'External mappings JSON file')
  .option('-s, --schema <file>', 'External schema / database JSON file')
  .option('-d, --detect', 'Run class signature match & detection')
  .option('-k, --keep-alive', 'Leave agent running in background')
  .option('--libs <dir|classpath>', 'Libraries directory or classpath')
  .option('--version-json <file>', 'Version JSON metadata file')
  .option('--json', 'Output pure JSON')
  .action(async (jarPath, opts) => {
    const isJson = Boolean(opts?.json ?? program.opts().json);
    const { runInspectJar } = await import('./remote/inspect-jar.js');
    await runInspectJar({
      jarPath,
      port: opts.port ? parseInt(opts.port, 10) : 43378,
      filter: opts.filter,
      evalCode: opts.eval,
      mappings: opts.mappings,
      schema: opts.schema,
      detect: Boolean(opts.detect),
      keepAlive: Boolean(opts.keepAlive),
      libs: opts.libs,
      versionJson: opts.versionJson,
      jsonOutput: isJson,
    });
  });

// 8. Standalone HTTP API Server Mode
program
  .command('serve')
  .description('Start standalone HTTP & SSE server on specified port')
  .option('-p, --port <port>', 'HTTP port to listen on', '43370')
  .option('-h, --host <host>', 'HTTP hostname to bind to', '127.0.0.1')
  .action(async (opts) => {
    if (isToolMode()) {
      console.error(
        JSON.stringify(
          {
            success: false,
            mode: 'tool',
            error:
              'Exoproc cannot run in server mode in Tool Mode (native Windows FFI is not available in this environment). Connect to an active daemon or Minecraft Java agent instead.',
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }

    const { startApiServer } = await import('./server.js');
    const port = parseInt(opts.port, 10) || 43370;
    const host = opts.host || '127.0.0.1';
    const server = await startApiServer({ port, host });

    console.log(
      JSON.stringify(
        {
          status: 'online',
          server: 'exoproc-api',
          url: `http://${server.hostname}:${server.port}`,
          engine: 'Bun.serve',
        },
        null,
        2,
      ),
    );

    const cleanup = () => {
      server.stop();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  });

// 9. MCP Server Mode
program
  .command('mcp')
  .description('Start Model Context Protocol (MCP) server over stdio')
  .action(async () => {
    await import('./mcp.js');
  });

// 10. Daemon Mode (Deprecated)
program
  .command('daemon')
  .description(
    'Legacy daemon command (deprecated: Exoproc uses direct cache-backed sessions)',
  )
  .action(() => {
    console.log(
      '⚡ Exoproc background daemon has been deprecated.\n' +
        'Exoproc now operates directly via fast-path hibernated accessor sessions and in-process agent slots (1-3).\n' +
        'Run `exoproc attach [pid]` to attach directly, or `exoproc select` to switch targets.',
    );
  });

if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}

program.parse(process.argv);
