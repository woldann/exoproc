import React from 'react';
import { Box, Text } from 'ink';

export interface ViewProps<T = any> {
  data: T;
}

/**
 * 1. Status Card: Shows connection, runtime mode, attached process, and agent status.
 */
export const StatusCard: React.FC<{ status: any }> = ({ status }) => {
  const isConnected = Boolean(status && status.alive);
  const isAttached = Boolean(status && (status.attached || status.upgraded));
  const isAgent = Boolean(status && status.agentPort);
  const mode = status?.mode || (isConnected ? 'tool' : 'standby');

  const borderColor = isAttached ? 'green' : isConnected ? 'yellow' : 'red';
  const badgeColor = isAttached ? 'green' : isConnected ? 'yellow' : 'red';
  const badgeText = isAttached
    ? 'ATTACHED'
    : isConnected
      ? 'STANDBY'
      : 'DISCONNECTED';

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      width={72}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={borderColor}>
          ⚡ Exoproc Runtime Status
        </Text>
        <Text color="black" backgroundColor={badgeColor}>
          {' '}
          {badgeText}{' '}
        </Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        marginBottom={1}
      >
        <Box justifyContent="space-between">
          <Text color="gray">Runtime Mode:</Text>
          <Text bold color="white">
            {mode === 'native'
              ? 'Windows x64 Native FFI'
              : 'Tool Mode (Client / RPC)'}
          </Text>
        </Box>

        {status?.port ? (
          <Box justifyContent="space-between">
            <Text color="gray">Active Endpoint:</Text>
            <Text color="cyan">http://127.0.0.1:{status.port}</Text>
          </Box>
        ) : null}

        {status?.targetName ? (
          <Box justifyContent="space-between">
            <Text color="gray">Target Application:</Text>
            <Text bold color="yellow">
              {status.targetName} {status.pid ? `(PID: ${status.pid})` : ''}
            </Text>
          </Box>
        ) : null}

        {status?.windowTitle ? (
          <Box justifyContent="space-between">
            <Text color="gray">Window Title:</Text>
            <Text color="white">{status.windowTitle}</Text>
          </Box>
        ) : null}

        {isAgent ? (
          <Box justifyContent="space-between">
            <Text color="gray">In-Process Agent:</Text>
            <Text color="green">
              Active (Port: {status.agentPort}
              {status.buildId ? `, Build: ${status.buildId}` : ''})
            </Text>
          </Box>
        ) : null}

        {status?.uptime !== undefined ? (
          <Box justifyContent="space-between">
            <Text color="gray">Uptime:</Text>
            <Text color="white">
              {status.uptime > 60
                ? `${Math.floor(status.uptime / 60)}m ${status.uptime % 60}s`
                : `${status.uptime}s`}
            </Text>
          </Box>
        ) : null}

        {status?.message && !isConnected ? (
          <Box marginTop={1}>
            <Text color="gray">{status.message}</Text>
          </Box>
        ) : null}
      </Box>

      <Box justifyContent="space-between">
        <Text dimColor>Hint: Use --json for machine-readable JSON output</Text>
      </Box>
    </Box>
  );
};

/**
 * 2. Process List Card: Candidates for attachment.
 */
export const ProcsCard: React.FC<{ processes: any[] }> = ({ processes }) => {
  const procs = Array.isArray(processes) ? processes : [];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      width={78}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="cyan">
          📋 Candidate Windows & Java Processes
        </Text>
        <Text color="black" backgroundColor="cyan">
          {' '}
          Found: {procs.length}{' '}
        </Text>
      </Box>

      {procs.length === 0 ? (
        <Box padding={1}>
          <Text color="yellow">
            No candidate Java or Minecraft processes found.
          </Text>
        </Box>
      ) : (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          marginBottom={1}
        >
          <Box justifyContent="space-between" marginBottom={1}>
            <Text bold color="gray">
              PID
            </Text>
            <Text bold color="gray">
              PROCESS
            </Text>
            <Text bold color="gray">
              WINDOW TITLE
            </Text>
            <Text bold color="gray">
              TARGET
            </Text>
          </Box>

          {procs.slice(0, 15).map((p: any) => {
            const isMc = Boolean(p.isMinecraft);
            return (
              <Box key={p.pid} justifyContent="space-between">
                <Text bold color={isMc ? 'green' : 'white'}>
                  {String(p.pid).padEnd(6)}
                </Text>
                <Text color={isMc ? 'green' : 'white'}>
                  {(p.name || 'javaw.exe').slice(0, 16).padEnd(16)}
                </Text>
                <Text color="cyan">
                  {(p.windowTitle || '').slice(0, 26).padEnd(26)}
                </Text>
                <Text color={isMc ? 'green' : 'gray'}>
                  {isMc ? '★ Minecraft' : '  Java VM'}
                </Text>
              </Box>
            );
          })}
          {procs.length > 15 ? (
            <Text dimColor>... and {procs.length - 15} more processes</Text>
          ) : null}
        </Box>
      )}

      <Box>
        <Text dimColor>Attach via: exoproc attach &lt;PID&gt;</Text>
      </Box>
    </Box>
  );
};

/**
 * 3. Player Card: Telemetry, coordinates, orientation, health, motion.
 */
export const PlayerCard: React.FC<{ player: any }> = ({ player }) => {
  if (!player || player.success === false) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={1}
        width={68}
      >
        <Text bold color="yellow">
          ⚠️ Player Telemetry Unavailable
        </Text>
        <Text color="gray">
          {player?.error ||
            'Player is not loaded in an active world or game is not attached.'}
        </Text>
      </Box>
    );
  }

  const hp = typeof player.health === 'number' ? player.health : 20;
  const hpPercent = Math.min(100, Math.max(0, Math.round((hp / 20) * 100)));
  const hpColor = hpPercent > 50 ? 'green' : hpPercent > 25 ? 'yellow' : 'red';

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      paddingX={1}
      width={72}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="green">
          🧙 Active Player Telemetry
        </Text>
        <Text
          color="black"
          backgroundColor={player.creative ? 'magenta' : 'green'}
        >
          {' '}
          {player.creative ? 'CREATIVE' : 'SURVIVAL'}{' '}
        </Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        marginBottom={1}
      >
        <Box justifyContent="space-between">
          <Text color="gray">Position (X, Y, Z):</Text>
          <Text bold color="white">
            {typeof player.x === 'number'
              ? player.x.toFixed(2)
              : (player.x ?? '0.00')}
            ,{' '}
            {typeof player.y === 'number'
              ? player.y.toFixed(2)
              : (player.y ?? '0.00')}
            ,{' '}
            {typeof player.z === 'number'
              ? player.z.toFixed(2)
              : (player.z ?? '0.00')}
          </Text>
        </Box>

        <Box justifyContent="space-between">
          <Text color="gray">Rotation (Yaw / Pitch):</Text>
          <Text color="cyan">
            {typeof player.yaw === 'number'
              ? player.yaw.toFixed(1)
              : (player.yaw ?? '0.0')}
            °,{' '}
            {typeof player.pitch === 'number'
              ? player.pitch.toFixed(1)
              : (player.pitch ?? '0.0')}
            °
          </Text>
        </Box>

        <Box justifyContent="space-between">
          <Text color="gray">Health:</Text>
          <Text bold color={hpColor}>
            {hp} HP ({hpPercent}%)
          </Text>
        </Box>

        <Box justifyContent="space-between">
          <Text color="gray">On Ground / Flying:</Text>
          <Text color="white">
            {player.onGround ? 'Yes' : 'No'} /{' '}
            {player.flying ? 'Flying' : 'Walking'}
          </Text>
        </Box>

        {player.dimension ? (
          <Box justifyContent="space-between">
            <Text color="gray">Dimension:</Text>
            <Text color="yellow">{player.dimension}</Text>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
};

/**
 * 4. World Card: Time, Weather, Loaded Entities.
 */
export const WorldCard: React.FC<{ world: any }> = ({ world }) => {
  if (!world || world.success === false) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={1}
        width={68}
      >
        <Text bold color="yellow">
          ⚠️ World Telemetry Unavailable
        </Text>
        <Text color="gray">
          {world?.error || 'No active Minecraft world loaded.'}
        </Text>
      </Box>
    );
  }

  const isDay =
    typeof world.time === 'number' ? world.time % 24000 < 12000 : true;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="blue"
      paddingX={1}
      width={72}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="blue">
          🌍 Active Minecraft World
        </Text>
        <Text color="black" backgroundColor={isDay ? 'yellow' : 'blue'}>
          {' '}
          {isDay ? '☀️ DAY' : '🌙 NIGHT'}{' '}
        </Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        marginBottom={1}
      >
        <Box justifyContent="space-between">
          <Text color="gray">Dimension:</Text>
          <Text bold color="white">
            {world.dimension || 'Overworld'}
          </Text>
        </Box>

        <Box justifyContent="space-between">
          <Text color="gray">World Time / Day:</Text>
          <Text color="cyan">
            {world.time ?? '0'} ticks (
            {typeof world.time === 'number'
              ? Math.floor(world.time / 24000)
              : 0}{' '}
            days)
          </Text>
        </Box>

        <Box justifyContent="space-between">
          <Text color="gray">Weather:</Text>
          <Text color={world.raining ? 'blue' : 'green'}>
            {world.thundering
              ? '⛈️ Thundering'
              : world.raining
                ? '🌧️ Raining'
                : '☀️ Clear'}
          </Text>
        </Box>

        <Box justifyContent="space-between">
          <Text color="gray">Loaded Entities / Players:</Text>
          <Text color="white">
            {world.entities ?? 0} entities / {world.players ?? 1} players
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

/**
 * 5. GUI Inspect Card: Active screen and interactive buttons.
 */
export const GuiCard: React.FC<{ gui: any }> = ({ gui }) => {
  if (!gui || gui.success === false) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={1}
        width={72}
      >
        <Text bold color="yellow">
          ⚠️ GUI Inspection Unavailable
        </Text>
        <Text color="gray">{gui?.error || 'Failed to inspect GUI.'}</Text>
      </Box>
    );
  }

  const buttons = Array.isArray(gui.buttons) ? gui.buttons : [];
  const inWorld =
    !gui.screenName ||
    gui.screenName === 'None' ||
    gui.screenName.includes('In-Game');

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="magenta"
      paddingX={1}
      width={76}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="magenta">
          🖥️ Active Minecraft GUI Screen
        </Text>
        <Text color="black" backgroundColor={inWorld ? 'yellow' : 'green'}>
          {' '}
          {inWorld ? 'HUD / IN-GAME' : 'GUI ACTIVE'}{' '}
        </Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        marginBottom={1}
      >
        <Box justifyContent="space-between">
          <Text color="gray">Screen Name:</Text>
          <Text bold color="white">
            {gui.screenName || 'None (In-Game HUD)'}
          </Text>
        </Box>

        {gui.realClass ? (
          <Box justifyContent="space-between">
            <Text color="gray">Class Name:</Text>
            <Text color="cyan">{gui.realClass}</Text>
          </Box>
        ) : null}

        <Box justifyContent="space-between">
          <Text color="gray">Interactive Buttons:</Text>
          <Text color="yellow">{buttons.length} found</Text>
        </Box>
      </Box>

      {buttons.length > 0 ? (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          marginBottom={1}
        >
          <Box justifyContent="space-between" marginBottom={1}>
            <Text bold color="gray">
              ID
            </Text>
            <Text bold color="gray">
              LABEL
            </Text>
            <Text bold color="gray">
              STATE
            </Text>
          </Box>
          {buttons.slice(0, 10).map((btn: any) => (
            <Box key={btn.id} justifyContent="space-between">
              <Text bold color="magenta">
                #{String(btn.id).padEnd(4)}
              </Text>
              <Text color="white">{(btn.text || 'Untitled').slice(0, 36)}</Text>
              <Text color={btn.enabled !== false ? 'green' : 'red'}>
                {btn.enabled !== false ? 'Enabled' : 'Disabled'}
              </Text>
            </Box>
          ))}
          {buttons.length > 10 ? (
            <Text dimColor>... and {buttons.length - 10} more buttons</Text>
          ) : null}
        </Box>
      ) : null}

      <Box>
        <Text dimColor>Click button: exoproc click &lt;ID|Text&gt;</Text>
      </Box>
    </Box>
  );
};

/**
 * 6. Combined State Card: Snapshot of Player, World, and Screen.
 */
export const StateCard: React.FC<{ state: any }> = ({ state }) => {
  const status =
    state?.status ||
    (state?.attached !== undefined || state?.alive !== undefined
      ? state
      : null);
  return (
    <Box flexDirection="column" gap={1}>
      {status ? <StatusCard status={status} /> : null}
      {state?.player ? <PlayerCard player={state.player} /> : null}
      {state?.world ? <WorldCard world={state.world} /> : null}
      {state?.gui ? <GuiCard gui={state.gui} /> : null}
    </Box>
  );
};

/**
 * 7. Java Specs Card: JVM properties and memory.
 */
export const JavaCard: React.FC<{ info: any }> = ({ info }) => {
  if (!info || info.success === false) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={1}
        width={72}
      >
        <Text bold color="yellow">
          ⚠️ Java Runtime Telemetry Unavailable
        </Text>
        <Text color="gray">
          {info?.error || 'JVM reflection not reachable.'}
        </Text>
      </Box>
    );
  }

  const memTotal = info.memory?.totalMb ?? info.totalMemoryMb ?? 0;
  const memFree = info.memory?.freeMb ?? info.freeMemoryMb ?? 0;
  const memUsed = info.memory?.usedMb ?? Math.max(0, memTotal - memFree);
  const memMax = info.memory?.maxMb ?? info.maxMemoryMb ?? (memTotal || 1);
  const memPercent = Math.min(100, Math.round((memUsed / memMax) * 100));

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      width={74}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="cyan">
          ☕ Java Virtual Machine Telemetry
        </Text>
        <Text color="black" backgroundColor="cyan">
          {' '}
          v{info.version || 'unknown'}{' '}
        </Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        marginBottom={1}
      >
        <Box justifyContent="space-between">
          <Text color="gray">JVM Name:</Text>
          <Text bold color="white">
            {info.vmName || 'OpenJDK'}
          </Text>
        </Box>

        <Box justifyContent="space-between">
          <Text color="gray">Vendor:</Text>
          <Text color="white">{info.vendor || 'Unknown'}</Text>
        </Box>

        <Box justifyContent="space-between">
          <Text color="gray">OS Architecture:</Text>
          <Text color="yellow">
            {info.osName} ({info.osArch})
          </Text>
        </Box>

        <Box justifyContent="space-between">
          <Text color="gray">Memory Usage:</Text>
          <Text color="green">
            {memUsed} MB / {memMax} MB ({memPercent}%)
          </Text>
        </Box>

        {Array.isArray(info.classpath) ? (
          <Box justifyContent="space-between">
            <Text color="gray">Classpath Jars:</Text>
            <Text color="cyan">{info.classpath.length} loaded</Text>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
};

/**
 * 8. Screenshot Card: Path, dimensions, and optional image preview.
 */
export const ScreenshotCard: React.FC<{ shot: any; imageAnsi?: string }> = ({
  shot,
  imageAnsi,
}) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      paddingX={1}
      width={74}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="green">
          📸 In-Game Screenshot Captured
        </Text>
        <Text color="black" backgroundColor="green">
          {' '}
          {shot.width || 0}x{shot.height || 0}{' '}
        </Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        marginBottom={1}
      >
        <Box justifyContent="space-between">
          <Text color="gray">Saved Path:</Text>
          <Text bold color="cyan">
            {shot.filePath || shot.path}
          </Text>
        </Box>
        {shot.windowTitle ? (
          <Box justifyContent="space-between">
            <Text color="gray">Source Window:</Text>
            <Text color="white">{shot.windowTitle}</Text>
          </Box>
        ) : null}
      </Box>

      {imageAnsi ? <Box marginY={1}>{<Text>{imageAnsi}</Text>}</Box> : null}
    </Box>
  );
};

/**
 * 9. Eval / Script Result Card.
 */
export const EvalCard: React.FC<{ result: any }> = ({ result }) => {
  const isSuccess = result?.success !== false;
  const execMs = result?.executionTimeMs ?? result?.durationMs;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isSuccess ? 'green' : 'red'}
      paddingX={1}
      width={74}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={isSuccess ? 'green' : 'red'}>
          {isSuccess ? '⚡ Execution Succeeded' : '❌ Execution Failed'}
        </Text>
        {execMs !== undefined ? (
          <Text color="black" backgroundColor={isSuccess ? 'green' : 'red'}>
            {' '}
            {execMs}ms{' '}
          </Text>
        ) : null}
      </Box>

      {result?.error ? (
        <Box padding={1} flexDirection="column">
          <Text color="red">{result.error}</Text>
        </Box>
      ) : (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          marginBottom={1}
        >
          <Box justifyContent="space-between">
            <Text color="gray">Return Value:</Text>
            <Text bold color="cyan">
              {typeof result?.result === 'object' && result.result !== null
                ? JSON.stringify(result.result, null, 2)
                : String(result?.result ?? 'undefined')}
            </Text>
          </Box>
        </Box>
      )}

      {Array.isArray(result?.logs) && result.logs.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">
            Output Logs:
          </Text>
          {result.logs.slice(0, 10).map((l: string, i: number) => (
            <Box key={i}>
              <Text color="gray"> › {l}</Text>
            </Box>
          ))}
          {result.logs.length > 10 ? (
            <Text dimColor>... and {result.logs.length - 10} more lines</Text>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
};

/**
 * 10. Action Card: For click, navigate, chat, action, upgrade, etc.
 */
export const ActionCard: React.FC<{ action: string; result: any }> = ({
  action,
  result,
}) => {
  const ok = result?.success !== false;
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={ok ? 'green' : 'red'}
      paddingX={1}
      width={68}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={ok ? 'green' : 'red'}>
          {ok ? '✓ Action Completed' : '❌ Action Failed'}: {action}
        </Text>
      </Box>
      <Box flexDirection="column">
        {result?.message ? <Text color="white">{result.message}</Text> : null}
        {result?.error ? <Text color="red">{result.error}</Text> : null}
      </Box>
    </Box>
  );
};

/**
 * 11. Generic Card: Clean fallback for any other command output.
 */
export const GenericCard: React.FC<{ command: string; data: any }> = ({
  command,
  data,
}) => {
  const isErr = data && data.success === false;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isErr ? 'red' : 'cyan'}
      paddingX={1}
      width={72}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={isErr ? 'red' : 'cyan'}>
          {isErr ? '❌ Command Error' : `✓ ${command}`}
        </Text>
      </Box>
      <Box flexDirection="column">
        {typeof data === 'object' && data !== null ? (
          Object.entries(data).map(([k, v]) => (
            <Box key={k} justifyContent="space-between">
              <Text color="gray">{k}:</Text>
              <Text color="white">
                {typeof v === 'object' && v !== null
                  ? JSON.stringify(v)
                  : String(v)}
              </Text>
            </Box>
          ))
        ) : (
          <Text color="white">{String(data)}</Text>
        )}
      </Box>
    </Box>
  );
};

/**
 * 12. Standalone Inspector Card: For inspect-jar tool.
 */
export const InspectorCard: React.FC<{
  targetJar: string;
  sizeMb: string;
  classCount: number;
  port: number;
  buildId?: string;
}> = ({ targetJar, sizeMb, classCount, port, buildId }) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      paddingX={1}
      width={76}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="green">
          📦 Exoproc Standalone JAR Inspector
        </Text>
        <Text color="black" backgroundColor="green">
          {' '}
          PORT: {port}{' '}
        </Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        marginBottom={1}
      >
        <Box justifyContent="space-between">
          <Text color="gray">Target JAR:</Text>
          <Text bold color="white">
            {targetJar} ({sizeMb} MB)
          </Text>
        </Box>
        <Box justifyContent="space-between">
          <Text color="gray">Classes Discovered:</Text>
          <Text bold color="cyan">
            {classCount} classes
          </Text>
        </Box>
        {buildId ? (
          <Box justifyContent="space-between">
            <Text color="gray">Agent Build ID:</Text>
            <Text color="yellow">{buildId}</Text>
          </Box>
        ) : null}
        <Box justifyContent="space-between">
          <Text color="gray">RPC Reflection Server:</Text>
          <Text color="green">http://127.0.0.1:{port}</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">
          Reflection RPC Endpoints:
        </Text>
        <Text color="gray"> GET /status - Agent health & uptime</Text>
        <Text color="gray"> GET /buildId - Compiled build ID</Text>
        <Text color="gray">
          {' '}
          POST /reflection/class - Class & method metadata
        </Text>
        <Text color="gray">
          {' '}
          POST /reflection/invoke - Invoke static/virtual methods
        </Text>
        <Text color="gray"> POST /reflection/get - Read field values</Text>
      </Box>

      <Box flexDirection="column">
        <Text bold color="cyan">
          CLI Commands:
        </Text>
        <Text color="white"> • exoproc status</Text>
        <Text color="white"> • exoproc java</Text>
        <Text color="white">
          {' '}
          • exoproc eval &quot;Java.type(&apos;...&apos;)&quot;
        </Text>
      </Box>
    </Box>
  );
};

/**
 * 13. Filter Classes Card: For matched classes.
 */
export const FilterClassesCard: React.FC<{
  filter: string;
  total: number;
  matched: string[];
}> = ({ filter, total, matched }) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      width={76}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="cyan">
          🔍 JAR Classes Matching &quot;{filter}&quot;
        </Text>
        <Text color="black" backgroundColor="cyan">
          {' '}
          {matched.length} / {total}{' '}
        </Text>
      </Box>
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        marginBottom={1}
      >
        {matched.slice(0, 30).map((c: string, idx: number) => (
          <Box key={`${c}-${idx}`}>
            <Text color="white"> • {c}</Text>
          </Box>
        ))}
        {matched.length > 30 ? (
          <Text dimColor>... and {matched.length - 30} more classes</Text>
        ) : null}
      </Box>
    </Box>
  );
};

/**
 * 14. Select Card: Shows target selection, 3 agent slots, and saved sessions.
 */
export const SelectCard: React.FC<{ data: any }> = ({ data }) => {
  const active = data?.active;
  const sessions = data?.sessions || [];
  const agents = data?.agents || [];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      width={76}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="cyan">
          🎯 Exoproc Target Selection
        </Text>
        {active ? (
          <Text color="black" backgroundColor="green">
            {' '}
            ACTIVE:{' '}
            {active.type === 'agent'
              ? `Slot ${active.slot} (:${active.port})`
              : `PID ${active.pid}`}{' '}
          </Text>
        ) : (
          <Text color="black" backgroundColor="yellow">
            {' '}
            NO ACTIVE TARGET{' '}
          </Text>
        )}
      </Box>

      {/* Agent Slots */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        marginBottom={1}
      >
        <Text bold color="yellow">
          ⚡ Agent Slots (Max 3, Fixed Ports):
        </Text>
        {agents.map((agent: any) => {
          const isActive =
            active?.type === 'agent' && active.slot === agent.slot;
          return (
            <Box key={`slot-${agent.slot}`} justifyContent="space-between">
              <Text color={isActive ? 'green' : 'white'} bold={isActive}>
                {isActive ? '▶ ' : '  '}Slot {agent.slot} (Port {agent.port})
              </Text>
              <Text color={agent.alive ? 'green' : 'gray'}>
                {agent.alive ? '● ONLINE' : '○ OFFLINE'}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Cached Accessor Sessions */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        marginBottom={1}
      >
        <Text bold color="cyan">
          💾 Cached Accessor Sessions:
        </Text>
        {sessions.length === 0 ? (
          <Text dimColor> No saved sessions in .cache/exoproc/sessions/</Text>
        ) : (
          sessions.map((sess: any) => {
            const isActive =
              active?.type === 'accessor' && active.pid === sess.pid;
            return (
              <Box key={`sess-${sess.pid}`} justifyContent="space-between">
                <Text color={isActive ? 'green' : 'white'} bold={isActive}>
                  {isActive ? '▶ ' : '  '}PID {sess.pid} (
                  {sess.metadata?.processName || 'javaw.exe'})
                </Text>
                <Text color="gray">
                  {sess.metadata?.windowTitle || sess.accessorType || ''}
                </Text>
              </Box>
            );
          })
        )}
      </Box>

      <Text dimColor>To switch target: exoproc select &lt;1|2|3|pid&gt;</Text>
    </Box>
  );
};
