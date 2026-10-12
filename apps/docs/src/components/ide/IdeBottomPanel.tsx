'use client';

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { useService } from '@/platform/instantiation/browser/instantiationService';
import {
  IOutputService,
  type OutputChannelId,
} from '@/workbench/services/output/IOutputService';
import { IdeTerminalPanel, type IdeTerminalHandle } from './IdeTerminalPanel';

export interface IdeBottomPanelProps {
  readonly terminalRef: RefObject<IdeTerminalHandle | null>;
}

type BottomTab = 'terminal' | 'debug' | 'output';

const TABS: ReadonlyArray<{ id: BottomTab; label: string }> = [
  { id: 'terminal', label: 'Terminal' },
  { id: 'debug', label: 'Debug Logs' },
  { id: 'output', label: 'Output' },
];

/**
 * The bottom panel below the editor, tabbed like VS Code's own (Terminal /
 * Debug Console / Output) -- previously just a bare terminal. All three
 * tabs' content stays mounted at all times and is only hidden via CSS when
 * inactive, same reasoning as `FileTree`'s persistent nav: `IdeTerminalPanel`
 * wraps a real xterm.js session that must not remount (or lose scrollback/
 * the running shell) just because the user looked at another tab.
 */
export function IdeBottomPanel({ terminalRef }: IdeBottomPanelProps) {
  const [activeTab, setActiveTab] = useState<BottomTab>('terminal');

  return (
    <div className="flex h-full flex-col border-t border-[#2b2b2b] bg-[#181818]">
      <div className="flex h-7 shrink-0 items-center gap-1 border-b border-[#2b2b2b] px-2 text-[11px]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`h-full border-b px-2.5 uppercase tracking-wide ${
              activeTab === tab.id
                ? 'border-b-[#e7e7e7] text-[#e7e7e7]'
                : 'border-b-transparent text-[#9d9d9d] hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <div className={activeTab === 'terminal' ? 'h-full' : 'hidden h-full'}>
          <IdeTerminalPanel ref={terminalRef} />
        </div>
        <div className={activeTab === 'debug' ? 'h-full' : 'hidden h-full'}>
          <OutputLogView channel="debug" />
        </div>
        <div className={activeTab === 'output' ? 'h-full' : 'hidden h-full'}>
          <OutputLogView channel="output" />
        </div>
      </div>
    </div>
  );
}

function OutputLogView({ channel }: { readonly channel: OutputChannelId }) {
  const outputService = useService(IOutputService);
  const lines = useSyncExternalStore(
    (onStoreChange) =>
      outputService.onDidAppend((changedChannel) => {
        if (changedChannel === channel) onStoreChange();
      }).dispose,
    () => outputService.getLines(channel),
    () => outputService.getLines(channel),
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto px-3 py-2 font-mono text-xs"
    >
      {lines.length === 0 ? (
        <p className="text-[#6b6b6b]">Henüz kayıt yok.</p>
      ) : (
        lines.map((line) => (
          <div
            key={line.id}
            className={
              line.tone === 'error'
                ? 'text-red-300'
                : line.tone === 'success'
                  ? 'text-emerald-300'
                  : 'text-[#cccccc]'
            }
          >
            <span className="mr-2 text-[#6b6b6b]">
              {new Date(line.timestamp).toLocaleTimeString('tr')}
            </span>
            {line.text}
          </div>
        ))
      )}
    </div>
  );
}
