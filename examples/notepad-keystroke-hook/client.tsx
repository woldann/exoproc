import { useState } from 'react';
import { Pause, Play, Trash2 } from 'lucide-react';
import {
  Button,
  DemoShell,
  EventLog,
  LabeledCheckbox,
  StatusBar,
  mountDemo,
  useSocket,
} from '../kit/client.js';

interface KeyEvent {
  label: string;
  hex: string;
}

type ServerEvent =
  | { type: 'status'; text: string }
  | { type: 'countdown'; seconds: number }
  | { type: 'key'; label: string; hex: string };

function App() {
  const [status, setStatus] = useState('connecting...');
  const [countdown, setCountdown] = useState('');
  const [keys, setKeys] = useState<KeyEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [showHex, setShowHex] = useState(false);
  const [spellExoproc, setSpellExoproc] = useState(false);

  const { send, connected } = useSocket<ServerEvent>((msg) => {
    if (msg.type === 'status') setStatus(msg.text);
    else if (msg.type === 'countdown')
      setCountdown(`time left: ${msg.seconds}s`);
    else if (msg.type === 'key')
      setKeys((prev) => [...prev, { label: msg.label, hex: msg.hex }]);
  });

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    send(next ? 'pause' : 'resume');
  };

  const toggleSpellExoproc = (next: boolean) => {
    setSpellExoproc(next);
    send(next ? 'spell-exoproc-on' : 'spell-exoproc-off');
  };

  return (
    <DemoShell
      subtitle={
        <>
          2-byte park-and-simulate hook on{' '}
          <code>user32.dll!TranslateMessage</code> in a freshly spawned
          notepad.exe
        </>
      }
    >
      <StatusBar status={connected ? status : 'disconnected'} />
      <div className="text-sm text-muted-foreground">{countdown}</div>
      <div className="my-4 flex items-center gap-3">
        <Button onClick={togglePause}>
          {paused ? (
            <Play className="h-4 w-4" />
          ) : (
            <Pause className="h-4 w-4" />
          )}
          {paused ? 'Resume capture' : 'Pause capture'}
        </Button>
        <Button variant="ghost" onClick={() => setKeys([])}>
          <Trash2 className="h-4 w-4" />
          Clear log
        </Button>
        <LabeledCheckbox
          id="show-hex"
          label="show hex codes"
          checked={showHex}
          onChange={setShowHex}
        />
        <LabeledCheckbox
          id="spell-exoproc"
          label={'type "exoproc" no matter what you press'}
          checked={spellExoproc}
          onChange={toggleSpellExoproc}
        />
      </div>
      <EventLog
        items={keys}
        render={(k) => (showHex ? k.hex : k.label)}
        empty="(click into the Notepad window and type...)"
      />
    </DemoShell>
  );
}

mountDemo(<App />);
