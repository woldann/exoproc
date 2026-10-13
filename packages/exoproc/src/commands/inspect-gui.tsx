import React from 'react';
import { render, Box, Text } from 'ink';
import { evalRemote } from '../client.js';

interface ButtonInfo {
  id: number;
  text: string;
  enabled: boolean;
  visible: boolean;
  x: number;
  y: number;
}

interface GuiData {
  screenName: string;
  realClass: string;
  canonicalClass: string;
  buttons: ButtonInfo[];
}

const GuiInspectView: React.FC<{
  data: GuiData | null;
  error: string | null;
}> = ({ data, error }) => {
  if (error) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="red"
        padding={1}
        width={70}
      >
        <Text bold color="red">
          ❌ Failed to inspect Minecraft GUI
        </Text>
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  if (!data) return null;

  const inWorld =
    data.screenName.includes('In-Game') || data.screenName.includes('None');

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
          🖥️ Active Minecraft GUI Screen
        </Text>
        <Text color="black" backgroundColor={inWorld ? 'yellow' : 'green'}>
          {' '}
          {inWorld ? 'HUD / IN-GAME' : 'GUI ACTIVE'}{' '}
        </Text>
      </Box>

      {/* Screen Metadata */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        marginBottom={1}
      >
        <Box justifyContent="space-between">
          <Text color="gray">Screen Name: </Text>
          <Text bold color="white">
            {data.screenName}
          </Text>
        </Box>
        {data.realClass ? (
          <Box justifyContent="space-between">
            <Text color="gray">Obfuscated Class:</Text>
            <Text color="yellow">{data.realClass}</Text>
          </Box>
        ) : null}
        {data.canonicalClass ? (
          <Box justifyContent="space-between">
            <Text color="gray">Canonical Class: </Text>
            <Text color="magenta">{data.canonicalClass}</Text>
          </Box>
        ) : null}
        <Box justifyContent="space-between">
          <Text color="gray">Interactive Buttons:</Text>
          <Text bold color="green">
            {data.buttons.length}
          </Text>
        </Box>
      </Box>

      {/* Buttons Table */}
      {data.buttons.length > 0 ? (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
        >
          <Box justifyContent="space-between" marginBottom={1}>
            <Text bold color="gray">
              ID
            </Text>
            <Text bold color="gray">
              LABEL / TEXT
            </Text>
            <Text bold color="gray">
              STATE
            </Text>
            <Text bold color="gray">
              POSITION
            </Text>
          </Box>

          {data.buttons.map((b) => (
            <Box key={b.id} justifyContent="space-between">
              <Text bold color="white">
                [{b.id.toString().padStart(2)}]
              </Text>
              <Text color="cyan">
                "{(b.text || '<empty>').slice(0, 22).padEnd(22)}"
              </Text>
              <Text color={b.enabled ? 'green' : 'red'}>
                {b.enabled ? '✓ Enabled ' : '✗ Disabled'}
              </Text>
              <Text color="gray">
                ({b.x},{b.y})
              </Text>
            </Box>
          ))}
        </Box>
      ) : (
        <Box padding={1}>
          <Text dimColor>No buttons present on this screen.</Text>
        </Box>
      )}
    </Box>
  );
};

async function main() {
  const code = `
    const mc = Java.type('Minecraft').getMinecraft();
    const scr = mc.currentScreen;
    if (!scr || !scr.$ptr) {
      print('RESULT:NO_SCREEN');
    } else {
      const d = await Java.detect(scr);
      const simpleName = d ? d.simpleName : 'UnknownScreen';
      const realClass = d ? d.realClassName : scr.$className;
      const canonical = d ? (d.canonicalClassName || d.canonicalKey) : 'unknown';
      print('RESULT:SCREEN|' + simpleName + '|' + realClass + '|' + canonical);

      const list = scr.buttonList;
      const count = list ? list.size() : 0;
      print('RESULT:BUTTONS_COUNT|' + count);
      for (let i = 0; i < count; i++) {
        const b = list.get(i);
        const bid = (typeof b.id === 'number') ? b.id : (typeof b.k === 'number') ? b.k : 0;
        const bstr = (typeof b.displayString === 'string') ? b.displayString : (typeof b.j === 'string') ? b.j : '';
        const ben = (typeof b.enabled === 'boolean') ? b.enabled : (typeof b.l === 'boolean') ? b.l : true;
        const bvis = (typeof b.visible === 'boolean') ? b.visible : (typeof b.m === 'boolean') ? b.m : true;
        const bx = (typeof b.xPosition === 'number') ? b.xPosition : (typeof b.h === 'number') ? b.h : 0;
        const by = (typeof b.yPosition === 'number') ? b.yPosition : (typeof b.i === 'number') ? b.i : 0;
        print('RESULT:BTN|' + bid + '|' + bstr + '|' + ben + '|' + bvis + '|' + bx + '|' + by);
      }
    }
  `;

  const resp = await evalRemote(code);
  if (!resp.success) {
    render(
      <GuiInspectView data={null} error={resp.error || 'Execution failed'} />,
    );
    return;
  }

  let screenName = 'None (In-Game HUD / No Screen)';
  let realClass = '';
  let canonicalClass = '';
  const buttons: ButtonInfo[] = [];

  for (const log of resp.logs) {
    if (log === 'RESULT:NO_SCREEN') {
      screenName = 'None (In-Game / HUD)';
    } else if (log.startsWith('RESULT:SCREEN|')) {
      const parts = log.split('|');
      screenName = parts[1] || '';
      realClass = parts[2] || '';
      canonicalClass = parts[3] || '';
    } else if (log.startsWith('RESULT:BTN|')) {
      const parts = log.split('|');
      buttons.push({
        id: parseInt(parts[1] || '0', 10),
        text: parts[2] || '',
        enabled: parts[3] === 'true',
        visible: parts[4] === 'true',
        x: parseInt(parts[5] || '0', 10),
        y: parseInt(parts[6] || '0', 10),
      });
    }
  }

  render(
    <GuiInspectView
      data={{ screenName, realClass, canonicalClass, buttons }}
      error={null}
    />,
  );
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
