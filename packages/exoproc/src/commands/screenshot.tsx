import React, { useState, useEffect } from 'react';
import { render, Box, Text } from 'ink';
import terminalImage from 'terminal-image';
import { screenshotRemote } from '../client.js';

interface Props {
  customPath?: string;
  onDone: () => void;
}

const ScreenshotView: React.FC<Props> = ({ customPath, onDone }) => {
  const [loading, setLoading] = useState(true);
  const [statusText, setStatusText] = useState(
    'Requesting screenshot from Exoproc Daemon...',
  );
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    filePath: string;
    width: number;
    height: number;
    windowTitle: string;
    imageStr: string;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const resp = await screenshotRemote(customPath);
        if (!resp.success || !resp.filePath) {
          setError(resp.error || 'Failed to capture screenshot');
          setLoading(false);
          onDone();
          return;
        }

        setStatusText('Rendering image for terminal display...');
        const termWidth = process.stdout.columns || 80;
        const renderWidth = Math.min(68, Math.max(32, termWidth - 6));

        const imageStr = await terminalImage.file(resp.filePath, {
          width: renderWidth,
        });

        setData({
          filePath: resp.filePath,
          width: resp.width || 854,
          height: resp.height || 480,
          windowTitle: resp.windowTitle || 'Minecraft',
          imageStr,
        });
        setLoading(false);
        onDone();
      } catch (err: any) {
        setError(err?.message || String(err));
        setLoading(false);
        onDone();
      }
    })();
  }, []);

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">📸 Exoproc Screenshot</Text>
        <Text color="yellow">⏳ {statusText}</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="red"
        padding={1}
      >
        <Text bold color="red">
          ❌ Screenshot Failed
        </Text>
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  if (!data) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      padding={1}
      width={74}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="green">
          📸 {data.windowTitle}
        </Text>
        <Text color="black" backgroundColor="cyan">
          {' '}
          {data.width}x{data.height}{' '}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>{data.imageStr}</Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
      >
        <Box>
          <Text color="gray">Saved Path: </Text>
          <Text bold color="white">
            {data.filePath}
          </Text>
        </Box>
        <Box>
          <Text color="gray">Status: </Text>
          <Text color="green">✓ Captured via In-Process Framebuffer</Text>
        </Box>
      </Box>
    </Box>
  );
};

async function main() {
  const customPath =
    process.argv[2] && !process.argv[2].startsWith('-')
      ? process.argv[2]
      : undefined;
  await new Promise<void>((resolve) => {
    const { unmount } = render(
      <ScreenshotView
        customPath={customPath}
        onDone={() => {
          setTimeout(() => {
            unmount();
            resolve();
          }, 400);
        }}
      />,
    );
  });
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
