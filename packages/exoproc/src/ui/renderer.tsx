import React from 'react';
import { renderToString } from 'ink';
import { existsSync, readFileSync } from 'node:fs';
import {
  StatusCard,
  ProcsCard,
  PlayerCard,
  WorldCard,
  GuiCard,
  StateCard,
  JavaCard,
  ScreenshotCard,
  EvalCard,
  ActionCard,
  GenericCard,
} from './views.js';

export interface RenderOptions {
  json?: boolean;
}

export async function renderCliResult(
  command: string,
  data: any,
  options?: RenderOptions,
): Promise<void> {
  // If explicitly requested JSON or if stdout is being piped to another process
  if (options?.json || !process.stdout.isTTY) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  let element: React.ReactElement | null = null;
  const cmd = command.toLowerCase();

  if (
    data &&
    typeof data === 'object' &&
    data.success === false &&
    data.error &&
    cmd !== 'eval' &&
    cmd !== 'run'
  ) {
    element = <ActionCard action={command} result={data} />;
  } else {
    switch (cmd) {
      case 'status':
        element = <StatusCard status={data} />;
        break;

      case 'procs':
        element = <ProcsCard processes={data} />;
        break;

      case 'player':
      case 'p':
        element = <PlayerCard player={data} />;
        break;

      case 'world':
      case 'w':
        element = <WorldCard world={data} />;
        break;

      case 'gui':
      case 'screen':
      case 'g':
        element = <GuiCard gui={data} />;
        break;

      case 'state':
        element = <StateCard state={data} />;
        break;

      case 'java':
      case 'inspect-java':
        element = <JavaCard info={data} />;
        break;

      case 'screenshot': {
        let imageAnsi: string | undefined;
        const targetPath = data?.filePath || data?.path;
        if (targetPath && existsSync(targetPath)) {
          try {
            const terminalImage = (await import('terminal-image')).default;
            const buf = readFileSync(targetPath);
            imageAnsi = await terminalImage.buffer(buf, { width: 50 });
          } catch {}
        }
        element = <ScreenshotCard shot={data} imageAnsi={imageAnsi} />;
        break;
      }

      case 'eval':
      case 'run':
        element = <EvalCard result={data} />;
        break;

      case 'click':
      case 'action':
      case 'jump':
      case 'attack':
      case 'use':
      case 'slot':
      case 'look':
      case 'chat':
      case 'navigate':
      case 'close-screen':
      case 'close':
      case 'resume':
      case 'attach':
      case 'detach':
      case 'shutdown':
      case 'upgrade':
        element = <ActionCard action={command} result={data} />;
        break;

      default:
        element = <GenericCard command={command} data={data} />;
        break;
    }
  }

  try {
    const output = renderToString(element);
    console.log(output);
  } catch {
    console.log(JSON.stringify(data, null, 2));
  }
}
