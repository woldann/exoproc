'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { FileCode2, Terminal as TerminalIcon, Sparkles } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

// Dynamically import Monaco Editor to avoid SSR hydration issues
const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then((mod) => mod.Editor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[285px] items-center justify-center bg-[#1e1e1e] text-xs text-neutral-500">
        Yükleniyor...
      </div>
    ),
  },
);

const CODE_SNIPPETS = {
  tr: `import { Java } from 'exoproc';

// 1. Hedef JVM sürecinden Java sürümünü oku
const System = Java.type('java.lang.System');
print(\`[+] Java Version: \${System.getProperty('java.version')}\`);

// 2. Nashorn'a erişmeyi dene (Java 15+'da kaldırıldı)
try {
  const Nashorn = Java.type('jdk.nashorn.api.scripting.NashornScriptEngine');
  print('[+] Nashorn engine ready');
} catch (err: any) {
  print(\`[-] Error: \${err.message}\`);
}`,
  en: `import { Java } from 'exoproc';

// 1. Read Java version from target JVM process
const System = Java.type('java.lang.System');
print(\`[+] Java Version: \${System.getProperty('java.version')}\`);

// 2. Try to access Nashorn (removed in Java 15+)
try {
  const Nashorn = Java.type('jdk.nashorn.api.scripting.NashornScriptEngine');
  print('[+] Nashorn engine ready');
} catch (err: any) {
  print(\`[-] Error: \${err.message}\`);
}`,
};

const OUTPUT_LINES = {
  tr: [
    '\x1b[32m[+]\x1b[0m Java Version: \x1b[1;37m21.0.12.1\x1b[0m',
    '\x1b[31m[-]\x1b[0m Error: \x1b[1;31mjdk.nashorn.api.scripting.NashornScriptEngine\x1b[0m',
  ],
  en: [
    '\x1b[32m[+]\x1b[0m Java Version: \x1b[1;37m21.0.12.1\x1b[0m',
    '\x1b[31m[-]\x1b[0m Error: \x1b[1;31mjdk.nashorn.api.scripting.NashornScriptEngine\x1b[0m',
  ],
};

interface HomeShowcaseProps {
  readonly lang: string;
}

export function HomeShowcase({ lang }: HomeShowcaseProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [isRunning, setIsRunning] = useState(false);

  const selectedLang = lang === 'en' ? 'en' : 'tr';
  const code = CODE_SNIPPETS[selectedLang];
  const outputLines = OUTPUT_LINES[selectedLang];

  useEffect(() => {
    const container = terminalRef.current;
    if (!container) return;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    void Promise.all([
      import('@xterm/xterm').then((mod) => mod.Terminal),
      import('@xterm/addon-fit').then((mod) => mod.FitAddon),
    ]).then(([Terminal, FitAddon]) => {
      if (disposed || !container) return;

      const term = new Terminal({
        cols: 74,
        rows: 10,
        fontFamily:
          "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
        fontSize: 12.5,
        lineHeight: 1.25,
        theme: {
          background: '#141414',
          foreground: '#d4d4d4',
          cursor: '#007acc',
          cursorAccent: '#141414',
        },
        cursorBlink: true,
        disableStdin: true,
        convertEol: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(container);

      try {
        fitAddon.fit();
      } catch {
        // Ignored if initially offscreen
      }

      const handleResize = () => {
        try {
          fitAddon.fit();
        } catch {
          // Ignored
        }
      };
      window.addEventListener('resize', handleResize);

      const command = 'exoproc run script.ts';
      const promptStr = '\x1b[1;36mC:\\exoproc>\x1b[0m ';

      const wait = (ms: number) =>
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, ms);
        });

      const typeString = async (str: string) => {
        for (let i = 0; i < str.length; i++) {
          if (disposed) return;
          term.write(str[i]);
          await wait(40 + Math.random() * 35);
        }
      };

      const runLoop = async (isFirst = false) => {
        if (disposed) return;

        if (isFirst) {
          term.write(promptStr);
          await wait(600);
        }

        setIsRunning(true);

        // Type: Exoproc run script.ts
        await typeString(command);
        if (disposed) return;

        // Press Enter
        await wait(220);
        if (disposed) return;
        term.write('\r\n');

        // Print outputs sequentially
        for (const line of outputLines) {
          await wait(200);
          if (disposed) return;
          term.write(line + '\r\n');
        }

        // Finished execution, show prompt
        setIsRunning(false);
        term.write('\r\n' + promptStr);

        // Pause to let the user read the full output
        await wait(3200);
        if (disposed) return;

        // Type: cls to clear terminal
        await typeString('cls');
        if (disposed) return;

        await wait(250);
        if (disposed) return;
        term.write('\r\n');

        // Clear terminal screen and reset prompt
        await wait(150);
        if (disposed) return;
        term.clear();
        term.write(promptStr);

        await wait(500);
        if (disposed) return;

        runLoop(false);
      };

      runLoop(true);

      return () => {
        disposed = true;
        clearTimeout(timer);
        window.removeEventListener('resize', handleResize);
        term.dispose();
      };
    });

    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [outputLines]);

  return (
    <div className="w-full max-w-4xl overflow-hidden rounded-xl border border-white/10 bg-[#1e1e1e] shadow-2xl">
      {/* Window Top Header */}
      <div className="flex h-10 items-center justify-between border-b border-white/10 bg-[#181818] px-4">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-[#ff5f56]" />
          <span className="size-3 rounded-full bg-[#ffbd2e]" />
          <span className="size-3 rounded-full bg-[#27c93f]" />
          <div className="ml-3 flex items-center gap-1.5 rounded bg-[#222222] px-2.5 py-0.5 text-xs font-medium text-neutral-300">
            <FileCode2 className="size-3.5 text-blue-400" />
            <span>script.ts</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <Sparkles className="size-3.5 text-amber-400" />
          <span>Exoproc TypeScript VM</span>
        </div>
      </div>

      {/* Editor Container (Top) - Full Code Visible Without Scroll */}
      <div className="border-b border-white/10 bg-[#1e1e1e]">
        <MonacoEditor
          height="285px"
          language="typescript"
          theme="vs-dark"
          value={code}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 20,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            renderLineHighlight: 'none',
            automaticLayout: true,
            overviewRulerBorder: false,
            folding: false,
            contextmenu: false,
            padding: {
              top: 12,
              bottom: 12,
            },
            scrollbar: {
              vertical: 'auto',
              horizontal: 'hidden',
            },
          }}
        />
      </div>

      {/* Terminal Title Bar */}
      <div className="flex h-8 items-center justify-between border-b border-white/10 bg-[#161616] px-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-neutral-300">
          <TerminalIcon className="size-3.5 text-neutral-400" />
          <span>Terminal — cmd.exe</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span
            className={`size-2 rounded-full ${
              isRunning ? 'animate-pulse bg-emerald-400' : 'bg-neutral-500'
            }`}
          />
          <span className="text-neutral-400">
            {isRunning
              ? selectedLang === 'tr'
                ? 'Çalışıyor'
                : 'Running'
              : selectedLang === 'tr'
                ? 'Hazır'
                : 'Ready'}
          </span>
        </div>
      </div>

      {/* Terminal Output Area (Bottom) */}
      <div className="h-[210px] w-full bg-[#141414] p-3">
        <div ref={terminalRef} className="h-full w-full" />
      </div>
    </div>
  );
}

export default HomeShowcase;
