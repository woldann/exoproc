import React from 'react';
import { render, Box, Text } from 'ink';
import { listProcessesRemote } from '../client.js';

interface Props {
  processes: Array<{
    pid: number;
    name: string;
    windowTitle?: string;
    isMinecraft: boolean;
  }>;
}

const ProcsList: React.FC<Props> = ({ processes }) => {
  if (!processes || processes.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        padding={1}
        width={68}
      >
        <Text color="yellow">No candidate processes found.</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      padding={1}
      width={76}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="cyan">
          📋 Candidate Windows & Processes
        </Text>
        <Text color="black" backgroundColor="cyan">
          {' '}
          Total: {processes.length}{' '}
        </Text>
      </Box>

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
            TYPE
          </Text>
        </Box>

        {processes.map((p) => {
          const isMc = p.isMinecraft;
          return (
            <Box key={p.pid} justifyContent="space-between">
              <Text bold color={isMc ? 'green' : 'white'}>
                {p.pid.toString().padEnd(6)}
              </Text>
              <Text color={isMc ? 'green' : 'white'}>
                {p.name.slice(0, 16).padEnd(16)}
              </Text>
              <Text color="cyan">
                {(p.windowTitle || '').slice(0, 24).padEnd(24)}
              </Text>
              <Text color={isMc ? 'green' : 'gray'}>
                {isMc ? '★ Minecraft' : '  Other'}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Box flexDirection="column">
        <Text dimColor>To attach to a specific target:</Text>
        <Text color="white">
          {' '}
          bun run attach <Text color="green">&lt;PID&gt;</Text>
        </Text>
      </Box>
    </Box>
  );
};

async function main() {
  const processes = await listProcessesRemote();
  render(<ProcsList processes={processes} />);
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
