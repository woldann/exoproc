'use client';

import { useDebuggerContext } from './DebuggerContext';
import { DisassemblyView } from './DisassemblyView';
import {
  BreakpointsPanel,
  CallStackPanel,
  MemoryPanel,
  RegistersPanel,
  TracePanel,
} from './panels';
import { ScannerPanel } from './ScannerPanel';
import { TerminalPanel } from './Terminal';

/**
 * dockview panel content components. Every one reads live state from
 * `DebuggerContext` instead of dockview's own `params` -- `params` are
 * frozen at `addPanel()` time and only change via an explicit
 * `updateParameters()` call, whereas context flows through the portal on
 * every `Win64Debugger` render (see `DebuggerContext.tsx`).
 */

function DisassemblyDockPanel() {
  const { session, selectedAddress, onSelectAddress } = useDebuggerContext();
  return (
    <DisassemblyView
      session={session}
      selectedAddress={selectedAddress}
      onSelectAddress={onSelectAddress}
    />
  );
}

/**
 * Registers / call stack / breakpoints stacked in one scrollable sidebar --
 * matches real VS Code, whose "Run and Debug" side panel groups these as
 * collapsible sections rather than separate draggable tabs.
 */
function SidebarDockPanel() {
  const { session } = useDebuggerContext();
  return (
    <aside className="flex h-full flex-col overflow-y-auto bg-[#252526]">
      <RegistersPanel session={session} />
      <CallStackPanel session={session} />
      <BreakpointsPanel session={session} />
    </aside>
  );
}

function MemoryDockPanel() {
  const { session } = useDebuggerContext();
  return <MemoryPanel session={session} />;
}

function TraceDockPanel() {
  const { session } = useDebuggerContext();
  return <TracePanel session={session} />;
}

function ScannerDockPanel() {
  const { session, scanner } = useDebuggerContext();
  return <ScannerPanel scanner={scanner} session={session} />;
}

function TerminalDockPanel() {
  return <TerminalPanel />;
}

export const DOCKVIEW_PANEL_COMPONENTS = {
  disassembly: DisassemblyDockPanel,
  sidebar: SidebarDockPanel,
  memory: MemoryDockPanel,
  trace: TraceDockPanel,
  scanner: ScannerDockPanel,
  terminal: TerminalDockPanel,
};
