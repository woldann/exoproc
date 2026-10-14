import React from 'react';
import { render, Box, Text } from 'ink';
import { getDaemonEndpoint, checkDaemonAlive } from '../client.js';

interface StatusProps {
  status: any;
  host: string;
  port: number;
  isRemote: boolean;
}

const StatusCard: React.FC<StatusProps> = ({
  status,
  host,
  port,
  isRemote,
}) => {
  if (!port || !status || !status.alive) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="red"
        padding={1}
        width={64}
      >
        <Box marginBottom={1}>
          <Text bold color="red">
            🔴 Exoproc Daemon: Inactive / Unreachable
          </Text>
        </Box>
        {port ? (
          <Text color="gray">
            Attempted endpoint: http://{host}:{port}
          </Text>
        ) : null}
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">Quick Start:</Text>
          <Text color="white">
            {' '}
            • Run{' '}
            <Text bold color="cyan">
              bun run attach
            </Text>{' '}
            to launch daemon & attach to Minecraft
          </Text>
          <Text color="white">
            {' '}
            • Or set{' '}
            <Text bold color="cyan">
              PORT=... HOST=...
            </Text>{' '}
            to connect to remote daemon
          </Text>
        </Box>
      </Box>
    );
  }

  const isAttached = Boolean(status.attached);
  const uptimeSec = status.uptime || 0;
  const uptimeStr =
    uptimeSec > 60
      ? `${Math.floor(uptimeSec / 60)}m ${uptimeSec % 60}s`
      : `${uptimeSec}s`;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isAttached ? 'green' : 'yellow'}
      padding={1}
      width={68}
    >
      {/* Title Bar */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={isAttached ? 'green' : 'yellow'}>
          {isAttached
            ? '🟢 Exoproc Daemon: Active & Attached'
            : '🟡 Exoproc Daemon: Standby Mode'}
        </Text>
        <Text color="black" backgroundColor={isAttached ? 'green' : 'yellow'}>
          {' '}
          PID: {status.daemonPid}{' '}
        </Text>
      </Box>

      {/* Target Details (if attached) */}
      {isAttached ? (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          marginBottom={1}
        >
          <Box justifyContent="space-between">
            <Text color="gray">Target Process:</Text>
            <Text bold color="white">
              {status.targetName || 'javaw.exe'} (PID: {status.pid})
            </Text>
          </Box>
          <Box justifyContent="space-between">
            <Text color="gray">Window Title:</Text>
            <Text color="cyan">{status.windowTitle || 'Minecraft'}</Text>
          </Box>
          <Box justifyContent="space-between">
            <Text color="gray">Active Profile:</Text>
            <Text color="magenta">{status.profile || 'auto'}</Text>
          </Box>
        </Box>
      ) : (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          marginBottom={1}
        >
          <Text color="yellow">No process currently attached.</Text>
          <Text color="gray">Daemon is waiting for remote attach command.</Text>
        </Box>
      )}

      {/* Connection & Runtime Stats */}
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text color="gray">Daemon Endpoint:</Text>
          <Text color="white">
            http://{host}:{port}{' '}
            {isRemote ? <Text color="blue">(Remote)</Text> : ''}
          </Text>
        </Box>
        <Box justifyContent="space-between">
          <Text color="gray">Daemon Uptime:</Text>
          <Text color="white">{uptimeStr}</Text>
        </Box>
      </Box>

      {/* Commands hint */}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Available Commands:</Text>
        <Text dimColor>
          {isAttached
            ? '  bun run inspect-gui | screenshot | eval | detach | shutdown'
            : '  bun run procs | attach <PID> | shutdown'}
        </Text>
      </Box>
    </Box>
  );
};

async function main() {
  const { host, port, isRemote } = getDaemonEndpoint();
  const status = port ? await checkDaemonAlive(host, port) : null;

  render(
    <StatusCard status={status} host={host} port={port} isRemote={isRemote} />,
  );
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
