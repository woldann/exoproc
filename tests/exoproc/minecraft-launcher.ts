import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ToolhelpSnapshot, Process, Thread } from '@woldann/bun-winapi';
import { ToolhelpSnapshotFlag } from '@woldann/bun-xffi';

/**
 * Finds the running Minecraft (javaw.exe) process PID.
 */
export function findMinecraftPid(): number | null {
  try {
    const snapshot = new ToolhelpSnapshot(ToolhelpSnapshotFlag.SNAPPROCESS);
    let pid: number | null = null;
    for (const p of snapshot.getProcesses()) {
      const name = p.name.toLowerCase();
      if (name.includes('javaw') && !name.includes('prism')) {
        try {
          const proc = Process.open(p.pid);
          proc.close();
          const threads = Thread.getThreads(p.pid);
          if (threads.length > 0) {
            pid = p.pid;
            break;
          }
        } catch {}
      }
    }
    snapshot.close();
    return pid;
  } catch {
    return null;
  }
}

/**
 * Resolves the path to PrismLauncher executable across Wine and Windows environments
 * dynamically using %LOCALAPPDATA%, %APPDATA%, %USERPROFILE%, and WINEPREFIX.
 */
export function resolvePrismLauncherPath(): string {
  // 1. Check LOCALAPPDATA environment variable (%LOCALAPPDATA%\Programs\PrismLauncher\prismlauncher.exe)
  if (process.env.LOCALAPPDATA) {
    const p = join(
      process.env.LOCALAPPDATA,
      'Programs',
      'PrismLauncher',
      'prismlauncher.exe',
    );
    if (existsSync(p)) return p;
  }

  // 2. Check APPDATA environment variable (%APPDATA%\..\Local\Programs\PrismLauncher\prismlauncher.exe)
  if (process.env.APPDATA) {
    const localFromAppdata = join(
      process.env.APPDATA,
      '..',
      'Local',
      'Programs',
      'PrismLauncher',
      'prismlauncher.exe',
    );
    if (existsSync(localFromAppdata)) return localFromAppdata;
    const roamingPrism = join(
      process.env.APPDATA,
      'PrismLauncher',
      'prismlauncher.exe',
    );
    if (existsSync(roamingPrism)) return roamingPrism;
  }

  // 3. Check USERPROFILE (%USERPROFILE%\AppData\Local\Programs\PrismLauncher\prismlauncher.exe)
  if (process.env.USERPROFILE) {
    const p = join(
      process.env.USERPROFILE,
      'AppData',
      'Local',
      'Programs',
      'PrismLauncher',
      'prismlauncher.exe',
    );
    if (existsSync(p)) return p;
  }

  // 4. If running on Linux, inspect default Wine prefix or $WINEPREFIX (~/.wine/drive_c/users/<user>/AppData/Local/...)
  const winePrefix =
    process.env.WINEPREFIX ||
    (process.env.HOME ? join(process.env.HOME, '.wine') : '');
  if (winePrefix) {
    const usersDir = join(winePrefix, 'drive_c', 'users');
    if (existsSync(usersDir)) {
      try {
        const users = readdirSync(usersDir);
        for (const u of users) {
          if (u === 'Public' || u === 'Default' || u === 'All Users') continue;
          const candidate = join(
            usersDir,
            u,
            'AppData',
            'Local',
            'Programs',
            'PrismLauncher',
            'prismlauncher.exe',
          );
          if (existsSync(candidate)) return candidate;
        }
      } catch {}
    }
  }

  // 5. Fallback: check PATH for prismlauncher command
  return 'prismlauncher';
}

/**
 * Spawns PrismLauncher to launch the specified instance (e.g. "1.8.9").
 */
export async function launchMinecraft(
  instanceName: string = '1.8.9',
): Promise<void> {
  const launcherPath = resolvePrismLauncherPath();
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    // Inside Wine / Windows runtime
    spawn(launcherPath, ['-l', instanceName], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } else {
    // On Linux host
    spawn('wine', [launcherPath, '-l', instanceName], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  }
}

export function resolveMinecraftLogPath(
  instanceName: string = '1.8.9',
): string | null {
  if (process.env.APPDATA) {
    const p = join(
      process.env.APPDATA,
      'PrismLauncher',
      'instances',
      instanceName,
      'minecraft',
      'logs',
      'latest.log',
    );
    if (existsSync(p)) return p;
  }
  const winePrefix =
    process.env.WINEPREFIX ||
    (process.env.HOME ? join(process.env.HOME, '.wine') : '');
  if (winePrefix) {
    const usersDir = join(winePrefix, 'drive_c', 'users');
    if (existsSync(usersDir)) {
      try {
        const users = readdirSync(usersDir);
        for (const u of users) {
          if (u === 'Public' || u === 'Default' || u === 'All Users') continue;
          const candidate = join(
            usersDir,
            u,
            'AppData',
            'Roaming',
            'PrismLauncher',
            'instances',
            instanceName,
            'minecraft',
            'logs',
            'latest.log',
          );
          if (existsSync(candidate)) return candidate;
        }
      } catch {}
    }
  }
  return null;
}

/**
 * Ensures Minecraft is running and ready. If not currently running,
 * automatically launches it via PrismLauncher and waits for the JVM process to spawn and reach the main menu.
 */
export async function ensureMinecraftRunning(
  instanceName: string = '1.8.9',
  timeoutMs: number = 45000,
): Promise<number> {
  let pid = findMinecraftPid();
  if (pid) {
    return pid;
  }

  const logPath = resolveMinecraftLogPath(instanceName);
  if (logPath && existsSync(logPath)) {
    try {
      const { unlinkSync } = await import('node:fs');
      unlinkSync(logPath);
    } catch {}
  }

  console.log(
    `[Launcher] Minecraft not running. Launching instance "${instanceName}" via PrismLauncher...`,
  );
  await launchMinecraft(instanceName);

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1000));
    pid = findMinecraftPid();
    if (pid) {
      console.log(
        `[Launcher] ✓ Minecraft process started with PID: ${pid}, waiting for main menu readiness...`,
      );
      const readyDeadline = Date.now() + 35000;
      while (Date.now() < readyDeadline) {
        if (logPath && existsSync(logPath)) {
          try {
            const { readFileSync } = await import('node:fs');
            const content = readFileSync(logPath, 'utf8');
            if (
              content.includes('textures-atlas') ||
              content.includes('Sound engine started')
            ) {
              break;
            }
          } catch {}
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      // Allow OpenGL rendering loop to stabilize on main menu
      await new Promise((r) => setTimeout(r, 4000));
      console.log(`[Launcher] ✓ Minecraft is ready and at MainMenu!`);
      return pid;
    }
  }

  throw new Error(
    `Timed out waiting for Minecraft instance "${instanceName}" to start after ${timeoutMs}ms`,
  );
}

export * from './gui-navigator.js';

/**
 * Autonomous test helper to navigate Minecraft from menus into a live singleplayer world.
 */
export async function ensureInWorld(
  reflection: any,
  Java: any,
  mappings: any,
  mc: any,
  options?: import('./gui-navigator.js').GuiNavigationOptions,
): Promise<void> {
  const { MinecraftGuiNavigator } = await import('./gui-navigator.js');
  const navigator = new MinecraftGuiNavigator(reflection, Java, mappings);
  return navigator.ensureInWorld(mc, options);
}
