#!/usr/bin/env bun
import { Command } from 'commander';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { startApiServer } from './server.js';

const program = new Command();

program
  .name('exoproc')
  .description(
    'Unified external Minecraft automation client, CLI runner, MCP server, and runtime instrumentation framework',
  )
  .version('0.1.0');

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
 * Dispatches command directly via ExoprocService or internal ephemeral API server.
 * Outputs pure structured JSON to stdout.
 */
async function dispatchApi(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: any,
) {
  const server = await startApiServer({ port: 0 });
  const port = server.port;

  try {
    const url = `http://127.0.0.1:${port}${path}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));

    if (!res.ok || (data && (data as any).success === false)) {
      process.exit(1);
    }
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(
      JSON.stringify(
        {
          success: false,
          error: msg,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  } finally {
    server.stop();
  }
}

async function dispatchStreamApi(
  path: string,
  method: 'GET' | 'POST' = 'POST',
  body?: any,
) {
  const server = await startApiServer({ port: 0 });
  const port = server.port;

  try {
    const url = `http://127.0.0.1:${port}${path}`;
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok || !res.body) {
      const text = await res.text();
      console.error(text);
      process.exit(1);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let hasFailure = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      process.stdout.write(chunk);
      if (chunk.includes('"success": false') || chunk.includes('"error":')) {
        hasFailure = true;
      }
    }

    if (hasFailure) {
      process.exit(1);
    }
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    process.exit(1);
  } finally {
    server.stop();
  }
}

// 1. Status & Daemon Control
program
  .command('status')
  .description('Get connection and instrumentation status')
  .action(() => dispatchApi('/status', 'GET'));

program
  .command('procs')
  .description('List candidate Minecraft and target processes')
  .action(() => dispatchApi('/procs', 'GET'));

program
  .command('attach [pid]')
  .description('Attach to target process (Minecraft / JVM)')
  .action((pidStr) => {
    const pid = pidStr ? parseInt(pidStr, 10) : undefined;
    return dispatchApi('/attach', 'POST', { pid });
  });

program
  .command('upgrade [classPath]')
  .description(
    'Upgrade target connection to in-process Java Agent by loading .class bytecode',
  )
  .option('-p, --port <port>', 'Agent port (default 43378)', '43378')
  .option('--obfuscate', 'Obfuscate agent bytecode with TinyRemapper')
  .action((classPath, opts) => {
    return dispatchApi('/upgrade', 'POST', {
      classPath,
      port: opts.port ? parseInt(opts.port, 10) : undefined,
      obfuscate: opts.obfuscate ?? false,
    });
  });

program
  .command('detach')
  .description('Detach from current target process')
  .action(() => dispatchApi('/detach', 'POST'));

program
  .command('shutdown')
  .description('Shut down active session / daemon')
  .action(() => dispatchApi('/shutdown', 'POST'));

// 2. Game Telemetry & World State
program
  .command('player')
  .alias('p')
  .description(
    'Get current player telemetry (coords, rotation, health, motion, etc.)',
  )
  .action(() => dispatchApi('/player', 'GET'));

program
  .command('world')
  .alias('w')
  .description('Get world state (time, weather, entity count, dimension)')
  .action(() => dispatchApi('/world', 'GET'));

program
  .command('gui')
  .alias('screen')
  .alias('g')
  .description('Get active GUI screen, buttons, and interaction targets')
  .option('--pool', 'Include resolved pool details')
  .action((opts) => {
    const path = `/gui${opts.pool ? '?pool=true' : ''}`;
    return dispatchApi(path, 'GET');
  });

program
  .command('state')
  .description('Get combined game snapshot (gui, player, and world)')
  .action(() => dispatchApi('/state', 'GET'));

program
  .command('target')
  .alias('raytrace')
  .description('Raytrace look vector to find aimed block or entity')
  .option('-r, --reach <blocks>', 'Maximum reach distance in blocks', '30')
  .action((opts) => {
    const reach = opts.reach || 30;
    return dispatchApi(`/target?reach=${reach}`, 'GET');
  });

program
  .command('entities')
  .alias('radar')
  .description('Scan loaded entities around player')
  .option('-r, --radius <blocks>', 'Search radius in blocks', '64')
  .action((opts) => {
    const radius = opts.radius || 64;
    return dispatchApi(`/entities?radius=${radius}`, 'GET');
  });

program
  .command('inventory')
  .alias('inv')
  .description('Inspect player inventory, hotbar, and equipped armor')
  .action(() => dispatchApi('/inventory', 'GET'));

program
  .command('java')
  .alias('inspect-java')
  .description(
    'Inspect Java runtime environment, JVM specifications, and classpath',
  )
  .action(() => dispatchApi('/java', 'GET'));

// 3. GUI Navigation & Automation
program
  .command('click <idOrText>')
  .description('Click a GUI button by ID number or label text')
  .action((target) => {
    const selector = /^\d+$/.test(target) ? parseInt(target, 10) : target;
    return dispatchApi('/click', 'POST', { selector });
  });

program
  .command('close-screen')
  .alias('close')
  .description('Close open GUI screen and return to game')
  .action(() => dispatchApi('/close-screen', 'POST'));

program
  .command('resume')
  .description('Resume game from pause menu')
  .action(() => dispatchApi('/resume', 'POST'));

program
  .command('navigate [target]')
  .option('-t, --target <screen>', 'Target GUI screen (default: InGame)')
  .option('--json', 'Output final result as JSON instead of streaming SSE')
  .description(
    'Automatically navigate world menus to target screen or singleplayer world',
  )
  .action((targetArg, opts) => {
    const target = targetArg || opts.target || 'InGame';
    if (opts.json) {
      return dispatchApi(
        `/navigate?target=${encodeURIComponent(target)}`,
        'POST',
      );
    }
    return dispatchStreamApi(
      `/navigate?target=${encodeURIComponent(target)}`,
      'POST',
    );
  });

// 4. Physical Actions & Player Controls
program
  .command('chat <message...>')
  .description('Send chat message or execute command in-game')
  .action((words) => {
    const msg = words.join(' ');
    return dispatchApi('/chat', 'POST', { message: msg });
  });

program
  .command('look <yaw> <pitch>')
  .description('Set player camera rotation angles (yaw, pitch)')
  .action((yawStr, pitchStr) => {
    const yaw = parseFloat(yawStr);
    const pitch = parseFloat(pitchStr);
    return dispatchApi('/look', 'POST', { yaw, pitch });
  });

program
  .command('action <action>')
  .description('Perform player action (swing | attack | use | jump)')
  .action((act) => dispatchApi('/action', 'POST', { action: act }));

program
  .command('jump')
  .description('Make player jump')
  .action(() => dispatchApi('/jump', 'POST'));

program
  .command('attack')
  .alias('swing')
  .description('Left-click / swing arm / attack')
  .action(() => dispatchApi('/attack', 'POST'));

program
  .command('use')
  .description('Right-click / use item / place block')
  .action(() => dispatchApi('/use', 'POST'));

program
  .command('slot <index>')
  .description('Select hotbar slot (0-8)')
  .action((idxStr) => {
    const idx = parseInt(idxStr, 10);
    return dispatchApi('/slot', 'POST', { slot: idx });
  });

// 5. Diagnostics, Mappings & Reflection
program
  .command('pool [target]')
  .description('Inspect classpool class mappings')
  .action((target) => {
    const path = `/pool${target ? `?target=${encodeURIComponent(target)}` : ''}`;
    return dispatchApi(path, 'GET');
  });

program
  .command('database [target]')
  .alias('db')
  .description('Inspect mapping database')
  .action((target) => {
    const path = `/database${target ? `?target=${encodeURIComponent(target)}` : ''}`;
    return dispatchApi(path, 'GET');
  });

program
  .command('crawl [screens...]')
  .option('--json', 'Output final result as JSON instead of streaming SSE')
  .description('Crawl and discover all reachable GUI screens and classes')
  .action((screens, opts) => {
    const payload = {
      targets: screens && screens.length > 0 ? screens : undefined,
    };
    if (opts.json) {
      return dispatchApi('/crawl', 'POST', payload);
    }
    return dispatchStreamApi('/crawl', 'POST', payload);
  });

program
  .command('export-mappings [profileOrOut] [out]')
  .alias('mappings')
  .description(
    'Export complete mappings JSON by crawling GUIs and merging live reflection',
  )
  .option(
    '-m, --minecraft',
    'Enable Minecraft mode and export Minecraft mappings',
  )
  .option('--no-crawl', 'Skip automated GUI crawling')
  .option('-o, --out <path>', 'Output mappings file path')
  .option('--json', 'Output final result as JSON instead of streaming SSE')
  .action((profileOrOut, outArg, opts) => {
    let profile = '1.8.9';
    let out = opts.out || outArg;

    if (profileOrOut) {
      if (
        profileOrOut.endsWith('.json') ||
        profileOrOut.includes('/') ||
        profileOrOut.includes('\\')
      ) {
        out = profileOrOut;
      } else {
        profile = profileOrOut;
      }
    }

    const payload = {
      profile,
      crawl: opts.crawl !== false,
      out,
      minecraft: Boolean(opts.minecraft),
    };
    if (opts.json) {
      return dispatchApi('/mappings/export', 'POST', payload);
    }
    return dispatchStreamApi('/mappings/export', 'POST', payload);
  });

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
  .action((words, opts) => {
    const code = words.join(' ');
    return dispatchApi('/eval', 'POST', {
      code,
      minecraft: Boolean(opts.minecraft),
      pool: opts.pool,
    });
  });

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

    return dispatchApi('/run', 'POST', {
      scriptPath,
      scriptCode,
      minecraft: Boolean(opts.minecraft),
      pool: opts.pool,
    });
  });

program
  .command('minecraft:init')
  .description(
    'Initialize Minecraft class matching and mappings registration on the active agent',
  )
  .action(() => dispatchApi('/minecraft/init', 'POST'));

program
  .command('minecraft:status')
  .description(
    'Check if active target is Minecraft and if Minecraft mappings are initialized',
  )
  .action(() => dispatchApi('/minecraft/status', 'GET'));

// 6. Screenshot (Captures in-game OpenGL framebuffer, encodes to Base64 PNG)
program
  .command('screenshot [outputPath]')
  .description('Capture in-game screenshot (OpenGL framebuffer -> Base64 PNG)')
  .option('-n, --no-save', 'Do not save to file (keep in-memory/base64 only)')
  .option('-b, --base64', 'Include base64 string in JSON output')
  .action((outputPath, opts) => {
    let target: string | undefined;
    if (opts.save !== false) {
      if (outputPath) {
        target = resolve(process.cwd(), outputPath);
      } else {
        const tmpDir = resolve(process.cwd(), 'tmp');
        if (!existsSync(tmpDir)) {
          try {
            mkdirSync(tmpDir, { recursive: true });
          } catch {}
        }
        target = join(tmpDir, `screenshot-${Date.now()}.png`);
      }
    }
    return dispatchApi('/screenshot', 'POST', {
      path: target,
      includeBase64: Boolean(opts.base64),
    });
  });

// 7. Dump / Extract Agent (JAR or .class)
program
  .command('agent:dump [outputPath]')
  .alias('agent:extract')
  .alias('agent:export')
  .description(
    'Extract compiled Exoproc Java agent as a .jar or raw .class file for inspection',
  )
  .option(
    '-c, --class',
    'Extract raw .class bytecode (Exoproc.class) instead of a JAR',
  )
  .option('-j, --jar', 'Extract as a .jar archive')
  .option(
    '-m, --mappings [path]',
    'Extract obfuscation mapping table (.txt or .tiny)',
  )
  .option(
    '--no-obf, --no-obfuscate',
    'Disable obfuscation (keep original names and debug symbols)',
  )
  .option(
    '--java-version <version>',
    'Target Java major version (8, 17, 21)',
    '8',
  )
  .option('--java-path <path>', 'Custom path to java binary')
  .action((outputPath, opts) => {
    const isMappingOnly =
      (opts.mappings === true && !outputPath) ||
      (outputPath &&
        (outputPath.toLowerCase().endsWith('.tiny') ||
          outputPath.toLowerCase().endsWith('.txt')));
    const isClass =
      Boolean(opts.class) ||
      (outputPath && outputPath.toLowerCase().endsWith('.class'));
    const isJar = Boolean(opts.jar);
    const format = isMappingOnly
      ? 'mapping'
      : isClass
        ? 'class'
        : isJar
          ? 'jar'
          : undefined;
    const javaVersion = parseInt(opts.javaVersion, 10) || 8;
    const obfuscate = opts.obfuscate !== false;
    const dumpMappings = opts.mappings;

    return dispatchApi('/agent/dump', 'POST', {
      path: outputPath,
      format,
      javaVersion,
      javaPath: opts.javaPath,
      obfuscate,
      dumpMappings,
    });
  });

// 8. Standalone HTTP API Server Mode
program
  .command('serve')
  .description('Start standalone HTTP & SSE server on specified port')
  .option('-p, --port <port>', 'HTTP port to listen on', '43370')
  .option('-h, --host <host>', 'HTTP hostname to bind to', '127.0.0.1')
  .action(async (opts) => {
    const port = parseInt(opts.port, 10) || 43370;
    const host = opts.host || '127.0.0.1';
    const server = await startApiServer({ port, host });

    console.log(
      JSON.stringify(
        {
          status: 'online',
          server: 'exoproc-api',
          url: `http://${server.hostname}:${server.port}`,
          engine: typeof Bun !== 'undefined' ? 'Bun.serve' : 'node:http',
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

// 10. Daemon Mode (Optional standalone background service)
program
  .command('daemon')
  .description('Start background instrumentation daemon service')
  .option('-p, --port <port>', 'Daemon port to listen on', '43370')
  .option('-h, --host <host>', 'Daemon host to bind to', '127.0.0.1')
  .action(async (opts) => {
    const { hasNativeXffi } = await import('./capabilities.js');
    if (!hasNativeXffi()) {
      console.error(
        JSON.stringify(
          {
            success: false,
            error:
              'Exoproc daemon requires native Windows x64 instrumentation with Bun (bun-xffi). On Node.js or non-Windows, run Exoproc in client/tool mode connected to an existing daemon or agent.',
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }
    const { runDaemon } = await import('./daemon/index.js');
    const port = parseInt(opts.port, 10) || 43370;
    const host = opts.host || '127.0.0.1';
    await runDaemon({ port, host });
  });

if (process.argv.length <= 2) {
  const port = Number(process.env.API_PORT) || 43370;
  const host = process.env.API_HOST || '127.0.0.1';
  const server = await startApiServer({ port, host });

  console.log(
    JSON.stringify(
      {
        status: 'online',
        server: 'exoproc-api',
        url: `http://${server.hostname}:${server.port}`,
        engine: typeof Bun !== 'undefined' ? 'Bun.serve' : 'node:http',
        hint: 'Direct HTTP & SSE Server running. Use curl, httpie, or chafa.',
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
} else {
  program.parse(process.argv);
}
