#!/usr/bin/env bun
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join, dirname, basename, delimiter } from 'node:path';
import { spawn } from 'node:child_process';
import { findRepoRoot } from './client.js';
import { getAgentJarSync } from 'njava-agent';

function loadLibrariesFromJson(
  jsonPath: string,
  libsDir: string,
  cpSet: Set<string>,
) {
  try {
    const content = readFileSync(jsonPath, 'utf8');
    const json = JSON.parse(content);
    if (Array.isArray(json.libraries)) {
      for (const lib of json.libraries) {
        if (lib.name) {
          const parts = lib.name.split(':');
          if (parts.length >= 3) {
            const group = parts[0].replace(/\./g, '/');
            const artifact = parts[1];
            const version = parts[2];
            const classifier = parts[3] ? '-' + parts[3] : '';
            const fileName = `${artifact}-${version}${classifier}.jar`;
            const rel = join(group, artifact, version, fileName);
            const full = join(libsDir, rel);
            if (existsSync(full)) {
              cpSet.add(full);
            }
          }
        }
      }
    }

    const metaDir = join(dirname(libsDir), 'meta');
    if (existsSync(metaDir)) {
      if (Array.isArray(json.requires)) {
        for (const req of json.requires) {
          if (req.uid) {
            const compVer = req.suggests || req.equals;
            if (compVer) {
              const compJson = join(metaDir, req.uid, `${compVer}.json`);
              if (existsSync(compJson) && compJson !== jsonPath) {
                loadLibrariesFromJson(compJson, libsDir, cpSet);
              }
            }
          }
        }
      }
    }
  } catch {}
}

function collectJarsRecursively(dir: string, cpSet: Set<string>) {
  if (!existsSync(dir)) return;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        collectJarsRecursively(full, cpSet);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.jar')) {
        cpSet.add(full);
      }
    }
  } catch {}
}

function resolveFullClasspath(
  targetJar: string,
  agentJar: string,
  libsArg?: string,
  versionJsonArg?: string,
): string[] {
  const cpSet = new Set<string>();
  cpSet.add(agentJar);
  cpSet.add(targetJar);

  let libsDir: string | null = null;
  let versionJsonFile: string | null = versionJsonArg
    ? resolve(versionJsonArg)
    : null;

  if (libsArg) {
    if (libsArg.endsWith('.json') && existsSync(libsArg)) {
      versionJsonFile = resolve(libsArg);
    } else if (libsArg.includes(':') || libsArg.includes(';')) {
      const parts = libsArg.split(/[:;]/);
      for (const p of parts) {
        const full = resolve(p.trim());
        if (existsSync(full) && full.endsWith('.jar')) {
          cpSet.add(full);
        }
      }
    } else {
      libsDir = resolve(libsArg);
    }
  }

  // Auto-detect libraries directory
  if (!libsDir) {
    let cur = dirname(targetJar);
    for (let i = 0; i < 6; i++) {
      if (basename(cur).toLowerCase() === 'libraries') {
        libsDir = cur;
        break;
      }
      const sibling = join(cur, 'libraries');
      if (existsSync(sibling)) {
        libsDir = sibling;
        break;
      }
      const parent = dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
  }

  // Auto-detect version JSON
  if (libsDir && existsSync(libsDir) && !versionJsonFile) {
    const vMatch = targetJar.match(/(\d+\.\d+(?:\.\d+)?)/);
    const ver = vMatch ? vMatch[1] : null;
    if (ver) {
      const candidates = [
        join(dirname(libsDir), 'meta', 'net.minecraft', `${ver}.json`),
        join(dirname(libsDir), 'versions', ver, `${ver}.json`),
        join(dirname(targetJar), `${ver}.json`),
      ];
      for (const c of candidates) {
        if (existsSync(c)) {
          versionJsonFile = c;
          break;
        }
      }
    }
  }

  if (
    libsDir &&
    existsSync(libsDir) &&
    versionJsonFile &&
    existsSync(versionJsonFile)
  ) {
    loadLibrariesFromJson(versionJsonFile, libsDir, cpSet);
  } else if (libsDir && existsSync(libsDir)) {
    collectJarsRecursively(libsDir, cpSet);
  }

  return Array.from(cpSet);
}

interface Options {
  jarPath?: string;
  port: number;
  libs?: string;
  versionJson?: string;
  mappings?: string;
  schema?: string;
  filter?: string;
  evalCode?: string;
  detect?: boolean;
  keepAlive?: boolean;
  jsonOutput?: boolean;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const opts: Options = {
    port: 43378,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    if ((arg === '-p' || arg === '--port') && i + 1 < args.length) {
      const next = args[++i];
      if (next) opts.port = parseInt(next, 10);
    } else if (arg === '--libs' && i + 1 < args.length) {
      opts.libs = args[++i];
    } else if (
      (arg === '--version-json' || arg === '--meta') &&
      i + 1 < args.length
    ) {
      opts.versionJson = args[++i];
    } else if ((arg === '-m' || arg === '--mappings') && i + 1 < args.length) {
      opts.mappings = args[++i];
    } else if (
      (arg === '-s' || arg === '--schema' || arg === '--database') &&
      i + 1 < args.length
    ) {
      opts.schema = args[++i];
    } else if ((arg === '-f' || arg === '--filter') && i + 1 < args.length) {
      opts.filter = args[++i];
    } else if ((arg === '-e' || arg === '--eval') && i + 1 < args.length) {
      opts.evalCode = args[++i];
    } else if (arg === '-d' || arg === '--detect') {
      opts.detect = true;
    } else if (arg === '-k' || arg === '--keep-alive') {
      opts.keepAlive = true;
    } else if (arg === '--json') {
      opts.jsonOutput = true;
    } else if (!arg.startsWith('-') && !opts.jarPath) {
      opts.jarPath = arg;
    }
  }

  return opts;
}

async function checkStatus(port: number): Promise<any | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/status`, {
      signal: AbortSignal.timeout(1000),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {}
  return null;
}

async function shutdown(port: number): Promise<void> {
  try {
    await fetch(`http://127.0.0.1:${port}/shutdown`, {
      method: 'POST',
      signal: AbortSignal.timeout(1500),
    });
  } catch {}
}

async function main() {
  const opts = parseArgs();
  const repoRoot = findRepoRoot();
  const agentJar = getAgentJarSync({ javaVersion: 8 }).jarPath;

  if (!opts.jarPath) {
    console.error(
      'Usage: bun run tool:inspect-jar <path-to-target.jar> [options]',
    );
    console.error('\nOptions:');
    console.error(
      '  -p, --port <port>          Agent HTTP port (default: 43378)',
    );
    console.error(
      '  -f, --filter <regex>       Filter class names matching pattern',
    );
    console.error(
      '  -e, --eval <code>          Execute JavaScript snippet inside agent',
    );
    console.error('  -m, --mappings <file>      External mappings JSON file');
    console.error(
      '  -s, --schema <file>        External schema / database JSON file',
    );
    console.error(
      '  -d, --detect               Run class signature match & detection',
    );
    console.error(
      '  -k, --keep-alive           Leave agent running in background',
    );
    console.error(
      '  --libs <dir|classpath>     Libraries directory or classpath',
    );
    console.error('  --version-json <file>      Version JSON metadata file');
    console.error('  --json                     Output pure JSON');
    process.exit(1);
  }

  const resolvedJar = resolve(opts.jarPath);
  if (!existsSync(resolvedJar)) {
    console.error(`❌ Target JAR not found: ${resolvedJar}`);
    process.exit(1);
  }

  let spawnedProcess: any = null;
  let status = await checkStatus(opts.port);

  // If agent is not running on this port, spawn it
  if (!status || !status.alive) {
    const cpList = resolveFullClasspath(
      resolvedJar,
      agentJar,
      opts.libs,
      opts.versionJson,
    );
    const cpStr = cpList.join(delimiter);

    if (!opts.jsonOutput) {
      console.log(`🚀 Launching NJavaAgent Inspector on port ${opts.port}...`);
      console.log(`   Target:    ${resolvedJar}`);
      console.log(`   Classpath: ${cpList.length} jars loaded`);
    }

    const javaArgs = [
      '-cp',
      cpStr,
      'org.exoproc.njava.agent.utils.Exoproc',
      '--standalone',
      '--port',
      String(opts.port),
      '--jar',
      resolvedJar,
    ];

    if (opts.mappings) {
      javaArgs.push('--mappings', opts.mappings);
    }
    if (opts.schema) {
      javaArgs.push('--schema', opts.schema);
    }

    spawnedProcess = spawn('java', javaArgs, {
      cwd: repoRoot,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    spawnedProcess.stderr?.on('data', (d: Buffer) => {
      if (!opts.jsonOutput && process.env.DEBUG) {
        process.stderr.write(d.toString());
      }
    });

    // Wait for agent to start
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await Bun.sleep(200);
      status = await checkStatus(opts.port);
      if (status && status.alive) {
        ready = true;
        break;
      }
    }

    if (!ready) {
      console.error('❌ Timeout waiting for Exoproc Agent Inspector to start.');
      if (spawnedProcess) spawnedProcess.kill();
      process.exit(1);
    }
  }

  const cleanup = async () => {
    if (spawnedProcess && !opts.keepAlive) {
      await shutdown(opts.port);
      try {
        spawnedProcess.kill('SIGTERM');
      } catch {}
    }
  };

  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(0);
  });

  try {
    // 1. If filter requested
    if (opts.filter) {
      const res = await fetch(`http://127.0.0.1:${opts.port}/classes`);
      const data = (await res.json()) as { count: number; classes: string[] };
      const regex = new RegExp(opts.filter, 'i');
      const matched = data.classes.filter((c) => regex.test(c));

      if (opts.jsonOutput) {
        console.log(
          JSON.stringify(
            {
              total: data.count,
              matchedCount: matched.length,
              classes: matched,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(
          `\n🔍 Found ${matched.length} / ${data.count} classes matching "${opts.filter}":`,
        );
        const preview = matched.slice(0, 50);
        preview.forEach((c) => console.log(`   - ${c}`));
        if (matched.length > 50) {
          console.log(`   ... and ${matched.length - 50} more`);
        }
      }
    }

    // 2. If eval requested
    if (opts.evalCode) {
      const res = await fetch(`http://127.0.0.1:${opts.port}/eval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: opts.evalCode }),
      });
      const evalRes = (await res.json()) as any;
      if (opts.jsonOutput) {
        console.log(JSON.stringify(evalRes, null, 2));
      } else {
        console.log('\n⚡ Eval Result:');
        if (evalRes.success) {
          console.log(`   Success: ${evalRes.result}`);
        } else {
          console.log(`   ❌ Error: ${evalRes.error}`);
        }
        if (evalRes.logs && evalRes.logs.length > 0) {
          console.log('   Logs:');
          evalRes.logs.forEach((l: string) => console.log(`     > ${l}`));
        }
        console.log(`   Elapsed: ${evalRes.executionTimeMs}ms`);
      }
    }

    // 3. If detect requested
    if (opts.detect) {
      const detectCode = `
        (function() {
          var results = {};
          var cl = classLoader != null ? classLoader : java.lang.Thread.currentThread().getContextClassLoader();
          var CR = Java.type('org.objectweb.asm.ClassReader');
          var CN = Java.type('org.objectweb.asm.tree.ClassNode');

          // Check Minecraft main / run
          try {
            var c = java.lang.Class.forName('net.minecraft.client.main.Main', false, cl);
            results['main'] = { found: true, name: c.getName() };
          } catch(e) {
            results['main'] = { found: false };
          }

          return JSON.stringify(results);
        })()
      `;
      const res = await fetch(`http://127.0.0.1:${opts.port}/eval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: detectCode }),
      });
      const detectRes = (await res.json()) as any;
      if (opts.jsonOutput) {
        console.log(JSON.stringify(detectRes, null, 2));
      } else {
        console.log('\n🔬 Detection Results:');
        console.log(detectRes.result);
      }
    }

    // 4. Default status summary
    if (!opts.filter && !opts.evalCode && !opts.detect) {
      if (opts.jsonOutput) {
        console.log(JSON.stringify(status, null, 2));
      } else {
        console.log('\n✅ Standalone Inspector Active');
        console.log(`   Target JAR:    ${status.targetJar}`);
        console.log(`   Class Count:   ${status.classCount}`);
        console.log(`   Agent Port:    ${status.port}`);
        console.log(`   Java Runtime:  ${process.version}`);
        console.log('\nEndpoints:');
        console.log(`   GET  http://127.0.0.1:${opts.port}/status`);
        console.log(`   GET  http://127.0.0.1:${opts.port}/classes`);
        console.log(
          `   POST http://127.0.0.1:${opts.port}/eval {"code": "..."}`,
        );
      }
    }

    if (opts.keepAlive) {
      if (!opts.jsonOutput)
        console.log(
          `\n⏳ Agent inspector kept alive on port ${opts.port}. Press Ctrl+C to exit.`,
        );
      await new Promise(() => {});
    }
  } finally {
    await cleanup();
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
