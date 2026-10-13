import React, { useEffect, useState } from 'react';
import { render, Box, Text, useApp } from 'ink';
import { evalRemote, loadScript } from '../client.js';

interface GuiNavigateProps {
  mode: 'click' | 'resume';
  target?: string;
}

interface ButtonItem {
  id: number;
  text: string;
  enabled: boolean;
}

interface StepLog {
  icon: string;
  text: string;
  color?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch current GUI state by executing inspect-gui script
 */
async function fetchScreenState(): Promise<ButtonItem[]> {
  const scriptCode = loadScript('inspect-gui');
  const resp = await evalRemote(scriptCode);

  if (!resp.success) {
    throw new Error(`Failed to inspect GUI: ${resp.error}`);
  }

  for (const log of resp.logs) {
    if (log.startsWith('RESULT:INSPECT_GUI|')) {
      try {
        const jsonStr = log.substring('RESULT:INSPECT_GUI|'.length);
        const result = JSON.parse(jsonStr);
        if (result.buttons && Array.isArray(result.buttons)) {
          return result.buttons.map((b: any) => ({
            id: b.id,
            text: b.text,
            enabled: b.enabled,
          }));
        }
      } catch (e) {
        // Ignore parse errors
      }
    } else if (log.startsWith('RESULT:INSPECT_GUI|ERROR:')) {
      throw new Error(log.substring('RESULT:INSPECT_GUI|ERROR:'.length));
    }
  }

  return [];
}

/**
 * Click a button by ID
 */
async function executeClick(
  buttonId: number,
): Promise<{ success: boolean; error?: string }> {
  const scriptCode = loadScript('click-button');
  const resp = await evalRemote(scriptCode, {
    __buttonId__: buttonId,
  });

  if (!resp.success) {
    return { success: false, error: resp.error };
  }

  for (const log of resp.logs) {
    if (log.startsWith('RESULT:CLICK_BUTTON|')) {
      try {
        const jsonStr = log.substring('RESULT:CLICK_BUTTON|'.length);
        const result = JSON.parse(jsonStr);
        return { success: result.success, error: result.error };
      } catch (e) {
        // Ignore parse errors
      }
    }
  }

  return { success: false, error: 'No response from click executor' };
}

/**
 * Close the current GUI screen
 */
async function executeCloseScreen(): Promise<void> {
  const scriptCode = loadScript('close-screen');
  await evalRemote(scriptCode);
  await sleep(200);
}

export const GuiNavigateView: React.FC<GuiNavigateProps> = ({
  mode,
  target,
}) => {
  const { exit } = useApp();
  const [logs, setLogs] = useState<StepLog[]>([]);
  const [status, setStatus] = useState<'running' | 'success' | 'error'>(
    'running',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const addLog = (icon: string, text: string, color?: string) => {
    setLogs((prev) => [...prev, { icon, text, color }]);
  };

  useEffect(() => {
    let unmounted = false;

    async function run() {
      try {
        addLog('🔍', 'Fetching GUI state...', 'cyan');
        const buttons = await fetchScreenState();
        const buttonsList = buttons
          .map((b) => `[${b.id}] "${b.text}"`)
          .join(', ');
        addLog('✓', `Found ${buttons.length} buttons: ${buttonsList}`, 'cyan');

        if (mode === 'click') {
          if (!target) {
            throw new Error('Button ID or label required for click mode');
          }

          const numTarget = parseInt(target, 10);
          addLog('⏳', `Clicking button ${numTarget}...`, 'yellow');
          const res = await executeClick(numTarget);

          if (!res.success) {
            throw new Error(res.error || 'Click failed');
          }

          addLog('✓', `Clicked button ${numTarget} successfully!`, 'green');
          await sleep(600);
          setStatus('success');
          setTimeout(() => exit(), 500);
          return;
        }

        // RESUME mode: Auto-navigate to game state
        addLog('🚀', 'Resume mode: Navigating back to game...', 'magenta');

        let attempts = 0;
        const maxAttempts = 15;

        while (attempts < maxAttempts && !unmounted) {
          attempts++;
          const current = await fetchScreenState();
          addLog(
            '🔄',
            `Attempt ${attempts}: ${current.length} buttons visible`,
            'gray',
          );

          // Try to find and click the "Back to Game" button
          const backBtn = current.find(
            (b) =>
              b.id === 4 ||
              b.text.toLowerCase().includes('back') ||
              b.text.toLowerCase().includes('game'),
          );

          if (backBtn) {
            addLog(
              '→',
              `Clicking "${backBtn.text}" (ID: ${backBtn.id})...`,
              'cyan',
            );
            await executeClick(backBtn.id);
            await sleep(400);
            continue;
          }

          // If no back button, try to close the screen
          addLog(
            '→',
            'No back button found, attempting to close screen...',
            'yellow',
          );
          await executeCloseScreen();
          await sleep(600);
        }

        addLog('✓', 'Navigation sequence complete!', 'green');
        setStatus('success');
        setTimeout(() => exit(), 500);
      } catch (err: any) {
        addLog('✗', `Error: ${err?.message || String(err)}`, 'red');
        setErrorMessage(err?.message);
        setStatus('error');
        setTimeout(() => exit(), 1500);
      }
    }

    run();
    return () => {
      unmounted = true;
    };
  }, [mode, target, exit]);

  return (
    <Box
      flexDirection="column"
      padding={1}
      borderStyle="round"
      borderColor={status === 'error' ? 'red' : 'cyan'}
    >
      <Box marginBottom={1}>
        <Text
          bold
          color={
            status === 'running'
              ? 'yellow'
              : status === 'success'
                ? 'green'
                : 'red'
          }
        >
          {mode === 'click' ? '🖱️  GUI Click' : '🎮 Resume Game'}{' '}
          {status === 'running' && '[...]'}
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {logs.map((log, i) => (
          <Text key={i} color={log.color}>
            {log.icon} {log.text}
          </Text>
        ))}
      </Box>

      {status === 'error' && (
        <Box marginTop={1}>
          <Text color="red" bold>
            ⚠️ Failed: {errorMessage}
          </Text>
        </Box>
      )}
    </Box>
  );
};

// Main entry point
const args = process.argv.slice(2);
const mode = (args[0] === 'resume' ? 'resume' : 'click') as 'click' | 'resume';
const target = args[1] || args[0]; // If only one arg and not 'resume', treat as target for click mode

render(<GuiNavigateView mode={mode} target={target} />);
