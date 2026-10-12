import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import {
  compileJava,
  compileJavaSync,
  detectJavaVersion,
  detectJavaVersionSync,
  resolveDefaultJavaPath,
} from 'exoproc-jjit';
import { buildJarBuffer, writeJarSync, type JarEntry } from './jar.js';
import { EMBEDDED_AGENT_SOURCES } from './agent-sources.js';

export interface AgentBuildOptions {
  /**
   * Target Java major version (e.g. 8, 11, 17, 21).
   * If omitted, automatically probed using `javaPath` or defaults to 8.
   */
  javaVersion?: number;

  /**
   * Path to the `java` or `java.exe` binary.
   * Defaults to environment JAVA_HOME or 'java'.
   */
  javaPath?: string;

  /**
   * Custom output path for the generated jar file.
   * If omitted, a persistent cached file under cacheDir is used.
   */
  outputPath?: string;

  /**
   * Custom cache directory for precompiled agent jars.
   * Defaults to ~/.cache/exoproc/agent or temp directory.
   */
  cacheDir?: string;

  /**
   * Whether to force re-compilation even if a cached jar already exists.
   */
  force?: boolean;

  /**
   * Whether to obfuscate and shrink bytecode using tiny-remapper and strip debug symbols.
   */
  obfuscate?: boolean;
}

export interface AgentBuildResult {
  /** Absolute path to the compiled jar file */
  jarPath: string;
  /** Complete binary Buffer of the compiled jar */
  jarBuffer: Buffer;
  /** Java major version targeted (e.g. 8, 17, 21) */
  javaVersion: number;
  /** Number of .class files packaged into the jar */
  classesCount: number;
  /** Whether this result was retrieved from cache */
  cached: boolean;
  /** Tiny v1 obfuscation mappings if obfuscation was performed */
  mappings?: string;
  /** Helper to load this build's exact mappings directly into a MappingPool or JavaMappingRegistry */
  loadMappings?: (poolOrRegistry: any) => string;
}

export interface AgentBytecodeResult {
  /** Fully qualified class name of the single consolidated agent (Exoproc) */
  className: string;
  /** Binary bytecode of the compiled .class file */
  bytecode: Uint8Array;
  /** Java major version targeted */
  javaVersion: number;
  /** Tiny v1 obfuscation mappings if obfuscation was performed */
  mappings?: string;
  /** Helper to load this build's exact mappings directly into a MappingPool or JavaMappingRegistry */
  loadMappings?: (poolOrRegistry: any) => string;
}

/**
 * Resolves the agent Java source files, preferring live filesystem files in agent-src/
 * if available, falling back to EMBEDDED_AGENT_SOURCES.
 */
export function getAgentSources(): Record<string, string> {
  const candidateDirs = [
    join(import.meta.dir, '..', 'agent-src'),
    join(import.meta.dir, 'agent-src'),
    join(process.cwd(), 'packages', 'njava-agent', 'agent-src'),
    join(process.cwd(), 'agent-src'),
  ];

  for (const dir of candidateDirs) {
    if (existsSync(dir)) {
      try {
        const sources: Record<string, string> = {};
        const collect = (curr: string) => {
          for (const ent of readdirSync(curr, { withFileTypes: true })) {
            const full = join(curr, ent.name);
            if (ent.isDirectory()) {
              collect(full);
            } else if (ent.isFile() && ent.name.endsWith('.java')) {
              const rel = relative(dir, full).replace(/\\/g, '/');
              sources[rel] = readFileSync(full, 'utf8');
            }
          }
        };
        collect(dir);
        if (Object.keys(sources).length > 0) {
          return sources;
        }
      } catch {}
    }
  }

  return { ...EMBEDDED_AGENT_SOURCES };
}

/**
 * Returns default cache directory for agent jars.
 */
export function getDefaultAgentCacheDir(): string {
  const home = process.env.USERPROFILE || process.env.HOME || tmpdir();
  const dir = join(home, '.cache', 'exoproc', 'agents');
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      return tmpdir();
    }
  }
  return dir;
}

const MANIFEST_CONTENT =
  'Manifest-Version: 1.0\r\n' +
  'Premain-Class: org.exoproc.njava.agent.utils.Exoproc\r\n' +
  'Agent-Class: org.exoproc.njava.agent.utils.Exoproc\r\n' +
  'Main-Class: org.exoproc.njava.agent.utils.Exoproc\r\n' +
  'Can-Redefine-Classes: true\r\n' +
  'Can-Retransform-Classes: true\r\n\r\n';

/**
 * Synchronously compiles the consolidated single-class Java agent (Exoproc.java)
 * directly into raw bytecode for in-memory JVM injection (ClassLoader.defineClass).
 * Zero jar files are created or written to disk.
 */
export function getAgentBytecodeSync(
  options: {
    javaVersion?: number;
    javaPath?: string;
    obfuscate?: boolean;
  } = {},
): AgentBytecodeResult {
  const javaPath = options.javaPath ?? resolveDefaultJavaPath();
  const javaVersion =
    options.javaVersion ?? detectJavaVersionSync(javaPath) ?? 8;
  const sources = getAgentSources();
  const exoprocSrc = sources['org/exoproc/njava/agent/utils/Exoproc.java'];
  if (!exoprocSrc) {
    throw new Error('Exoproc.java source not found');
  }

  const targetVersion = javaVersion < 17 ? '-1.8' : `-${javaVersion}`;
  const sourceVersion = javaVersion < 17 ? '-1.8' : `-${javaVersion}`;

  const compileRes = compileJavaSync({
    source: exoprocSrc,
    className: 'Exoproc',
    packageName: 'org.exoproc.njava.agent.utils',
    javaPath,
    javaVersion,
    targetVersion,
    sourceVersion,
    obfuscate: options.obfuscate,
  });

  if (!compileRes.success) {
    throw new Error(
      `Failed to dynamically compile Exoproc for Java ${javaVersion}:\n${compileRes.output}`,
    );
  }

  const bytecode = compileRes.classes.get(
    'org.exoproc.njava.agent.utils.Exoproc',
  );
  if (!bytecode) {
    throw new Error(
      'Compiled bytecode for org.exoproc.njava.agent.utils.Exoproc not found',
    );
  }

  const result: AgentBytecodeResult = {
    className: 'org.exoproc.njava.agent.utils.Exoproc',
    bytecode,
    javaVersion,
    mappings: compileRes.mappings,
  };
  result.loadMappings = (target: any) => loadAgentMappings(target, result);
  return result;
}

/**
 * Asynchronously compiles the consolidated single-class Java agent (Exoproc.java)
 * directly into raw bytecode for in-memory JVM injection (ClassLoader.defineClass).
 * Zero jar files are created or written to disk.
 */
export async function getAgentBytecode(
  options: {
    javaVersion?: number;
    javaPath?: string;
    obfuscate?: boolean;
  } = {},
): Promise<AgentBytecodeResult> {
  const javaPath = options.javaPath ?? resolveDefaultJavaPath();
  const javaVersion =
    options.javaVersion ?? (await detectJavaVersion(javaPath)) ?? 8;
  const sources = getAgentSources();
  const exoprocSrc = sources['org/exoproc/njava/agent/utils/Exoproc.java'];
  if (!exoprocSrc) {
    throw new Error('Exoproc.java source not found');
  }

  const targetVersion = javaVersion < 17 ? '-1.8' : `-${javaVersion}`;
  const sourceVersion = javaVersion < 17 ? '-1.8' : `-${javaVersion}`;

  const compileRes = await compileJava({
    source: exoprocSrc,
    className: 'Exoproc',
    packageName: 'org.exoproc.njava.agent.utils',
    javaPath,
    javaVersion,
    targetVersion,
    sourceVersion,
    obfuscate: options.obfuscate,
  });

  if (!compileRes.success) {
    throw new Error(
      `Failed to dynamically compile Exoproc for Java ${javaVersion}:\n${compileRes.output}`,
    );
  }

  const bytecode = await compileRes.readBytecode(
    'org.exoproc.njava.agent.utils.Exoproc',
  );
  if (!bytecode) {
    throw new Error(
      'Compiled bytecode for org.exoproc.njava.agent.utils.Exoproc not found',
    );
  }

  const result: AgentBytecodeResult = {
    className: 'org.exoproc.njava.agent.utils.Exoproc',
    bytecode,
    javaVersion,
    mappings: compileRes.mappings,
  };
  result.loadMappings = (target: any) => loadAgentMappings(target, result);
  return result;
}

/**
 * Synchronously compiles the Java agent specifically for the target Java version
 * and returns the jar result. Caches by Java version unless `force: true`.
 */
export function getAgentJarSync(
  options: AgentBuildOptions = {},
): AgentBuildResult {
  const javaPath = options.javaPath ?? resolveDefaultJavaPath();
  const javaVersion =
    options.javaVersion ?? detectJavaVersionSync(javaPath) ?? 8;
  const cacheDir = options.cacheDir ?? getDefaultAgentCacheDir();
  const targetJarPath =
    options.outputPath ??
    resolve(
      join(
        cacheDir,
        options.obfuscate
          ? `njava-agent-java${javaVersion}-obf.jar`
          : `njava-agent-java${javaVersion}.jar`,
      ),
    );
  const targetTinyPath = targetJarPath.replace(/\.jar$/, '.tiny');

  if (!options.force && existsSync(targetJarPath)) {
    try {
      const jarBuffer = readFileSync(targetJarPath);
      if (jarBuffer.length > 500) {
        let mappings: string | undefined;
        if (existsSync(targetTinyPath)) {
          try {
            mappings = readFileSync(targetTinyPath, 'utf8');
          } catch {}
        }
        const cachedRes: AgentBuildResult = {
          jarPath: targetJarPath,
          jarBuffer,
          javaVersion,
          classesCount: 0,
          cached: true,
          mappings,
        };
        cachedRes.loadMappings = (target: any) =>
          loadAgentMappings(target, cachedRes);
        return cachedRes;
      }
    } catch {}
  }

  // Compile on-the-fly dynamically
  const sources = getAgentSources();
  const targetVersion = javaVersion < 17 ? '-1.8' : `-${javaVersion}`;
  const sourceVersion = javaVersion < 17 ? '-1.8' : `-${javaVersion}`;

  const compileRes = compileJavaSync({
    source: sources,
    javaPath,
    javaVersion,
    targetVersion,
    sourceVersion,
    obfuscate: options.obfuscate,
  });

  if (!compileRes.success) {
    throw new Error(
      `Failed to dynamically compile Java agent for Java ${javaVersion}:\n${compileRes.output}`,
    );
  }

  // Package .class files and Manifest into JAR
  const jarEntries: JarEntry[] = [
    {
      path: 'META-INF/MANIFEST.MF',
      data: Buffer.from(MANIFEST_CONTENT, 'utf8'),
    },
  ];

  for (const [fqcn, bytecode] of compileRes.classes.entries()) {
    const classPath = `${fqcn.replace(/\./g, '/')}.class`;
    jarEntries.push({
      path: classPath,
      data: bytecode,
    });
  }

  writeJarSync(targetJarPath, jarEntries);
  const jarBuffer = buildJarBuffer(jarEntries);

  if (compileRes.mappings) {
    try {
      writeFileSync(targetTinyPath, compileRes.mappings, 'utf8');
    } catch {}
  }

  const buildRes: AgentBuildResult = {
    jarPath: targetJarPath,
    jarBuffer,
    javaVersion,
    classesCount: compileRes.classes.size,
    cached: false,
    mappings: compileRes.mappings,
  };
  buildRes.loadMappings = (target: any) => loadAgentMappings(target, buildRes);
  return buildRes;
}

/**
 * Asynchronously compiles the Java agent specifically for the target Java version
 * and returns the jar result. Caches by Java version unless `force: true`.
 */
export async function getAgentJar(
  options: AgentBuildOptions = {},
): Promise<AgentBuildResult> {
  const javaPath = options.javaPath ?? resolveDefaultJavaPath();
  const javaVersion =
    options.javaVersion ?? (await detectJavaVersion(javaPath)) ?? 8;
  const cacheDir = options.cacheDir ?? getDefaultAgentCacheDir();
  const targetJarPath =
    options.outputPath ??
    resolve(
      join(
        cacheDir,
        options.obfuscate
          ? `njava-agent-java${javaVersion}-obf.jar`
          : `njava-agent-java${javaVersion}.jar`,
      ),
    );
  const targetTinyPath = targetJarPath.replace(/\.jar$/, '.tiny');

  if (!options.force && existsSync(targetJarPath)) {
    try {
      const jarBuffer = readFileSync(targetJarPath);
      if (jarBuffer.length > 500) {
        let mappings: string | undefined;
        if (existsSync(targetTinyPath)) {
          try {
            mappings = readFileSync(targetTinyPath, 'utf8');
          } catch {}
        }
        const cachedRes: AgentBuildResult = {
          jarPath: targetJarPath,
          jarBuffer,
          javaVersion,
          classesCount: 0,
          cached: true,
          mappings,
        };
        cachedRes.loadMappings = (target: any) =>
          loadAgentMappings(target, cachedRes);
        return cachedRes;
      }
    } catch {}
  }

  // Compile on-the-fly dynamically
  const sources = getAgentSources();
  const targetVersion = javaVersion < 17 ? '-1.8' : `-${javaVersion}`;
  const sourceVersion = javaVersion < 17 ? '-1.8' : `-${javaVersion}`;

  const compileRes = await compileJava({
    source: sources,
    javaPath,
    javaVersion,
    targetVersion,
    sourceVersion,
    obfuscate: options.obfuscate,
  });

  if (!compileRes.success) {
    throw new Error(
      `Failed to dynamically compile Java agent for Java ${javaVersion}:\n${compileRes.output}`,
    );
  }

  const classes = await compileRes.readClasses();

  // Package .class files and Manifest into JAR
  const jarEntries: JarEntry[] = [
    {
      path: 'META-INF/MANIFEST.MF',
      data: Buffer.from(MANIFEST_CONTENT, 'utf8'),
    },
  ];

  for (const [fqcn, bytecode] of classes.entries()) {
    const classPath = `${fqcn.replace(/\./g, '/')}.class`;
    jarEntries.push({
      path: classPath,
      data: bytecode,
    });
  }

  writeJarSync(targetJarPath, jarEntries);
  const jarBuffer = buildJarBuffer(jarEntries);

  if (compileRes.mappings) {
    try {
      writeFileSync(targetTinyPath, compileRes.mappings, 'utf8');
    } catch {}
  }

  const buildRes: AgentBuildResult = {
    jarPath: targetJarPath,
    jarBuffer,
    javaVersion,
    classesCount: classes.size,
    cached: false,
    mappings: compileRes.mappings,
  };
  buildRes.loadMappings = (target: any) => loadAgentMappings(target, buildRes);
  return buildRes;
}

/**
 * Resolves the Tiny v1 obfuscation mappings for the agent synchronously.
 */
export function getAgentMappingsSync(
  options: { javaVersion?: number; javaPath?: string } = {},
): string {
  const res = getAgentBytecodeSync({ ...options, obfuscate: true });
  return res.mappings ?? '';
}

/**
 * Resolves the Tiny v1 obfuscation mappings for the agent asynchronously.
 */
export async function getAgentMappings(
  options: { javaVersion?: number; javaPath?: string } = {},
): Promise<string> {
  const res = await getAgentBytecode({ ...options, obfuscate: true });
  return res.mappings ?? '';
}

/**
 * Dynamically loads the agent's obfuscation mappings into a MappingPool or JavaMappingRegistry.
 * Allows transparent deobfuscation and access to internal fields and methods.
 *
 * If a build result (AgentBytecodeResult, AgentBuildResult, JavaCompileResult) or Tiny string is passed,
 * it extracts and merges the EXACT mappings produced by that specific build without recompiling.
 * Only if options are passed without an existing build does it perform a fresh compile.
 */
export function loadAgentMappings(
  poolOrRegistry: any,
  sourceOrOptions: any = {},
): string {
  let mappings = '';

  if (typeof sourceOrOptions === 'string') {
    if (existsSync(sourceOrOptions)) {
      try {
        mappings = readFileSync(sourceOrOptions, 'utf8');
      } catch {
        mappings = sourceOrOptions;
      }
    } else {
      mappings = sourceOrOptions;
    }
  } else if (sourceOrOptions && typeof sourceOrOptions === 'object') {
    if (typeof sourceOrOptions.mappings === 'string') {
      mappings = sourceOrOptions.mappings;
    } else if (typeof sourceOrOptions.tiny === 'string') {
      mappings = sourceOrOptions.tiny;
    } else if (sourceOrOptions.buildResult?.mappings) {
      mappings = sourceOrOptions.buildResult.mappings;
    } else if (sourceOrOptions.build?.mappings) {
      mappings = sourceOrOptions.build.mappings;
    } else if (typeof sourceOrOptions.jarPath === 'string') {
      const tinyPath = sourceOrOptions.jarPath.replace(/\.jar$/, '.tiny');
      if (existsSync(tinyPath)) {
        try {
          mappings = readFileSync(tinyPath, 'utf8');
        } catch {}
      }
    }

    if (!mappings) {
      mappings = getAgentMappingsSync(sourceOrOptions);
    }
  } else {
    mappings = getAgentMappingsSync();
  }

  if (poolOrRegistry && mappings) {
    if (typeof poolOrRegistry.loadTiny === 'function') {
      poolOrRegistry.loadTiny(mappings);
    } else if (typeof poolOrRegistry.load === 'function') {
      poolOrRegistry.load(mappings);
    }
  }

  return mappings;
}
