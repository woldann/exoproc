'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
} from 'dockview-react';
import 'dockview-core/dist/styles/dockview.css';
import { useService } from '@/platform/instantiation/browser/instantiationService';
import { IDebugService } from '@/workbench/services/debug/IDebugService';
import { DEBUGGER_CSS, SURFACE } from './chrome';
import { DebuggerContextProvider } from './DebuggerContext';
import { DOCKVIEW_PANEL_COMPONENTS } from './dockPanels';
import { DOCKVIEW_THEME_CSS, themeDark } from './dockview-theme';
import { DebugToolbar } from './Toolbar';
import { useDebugSession } from './useDebugSession';
import { useScannerSession } from './useScannerSession';

export interface Win64DebuggerProps {
  pid: number;
  tid: number;
  initialMemoryMappingId?: string;
  initialMemoryAddress?: string;
  initialMemoryLength?: number;
  /** When true, the debugger fills its container using flex instead of a fixed height. */
  fullscreen?: boolean;
  /** Height of the embedded (non-fullscreen) debugger surface. Ignored when `fullscreen`. */
  height?: number | string;
}

/**
 * Every group starts with exactly the panels below and can be freely
 * rearranged from there (dragged into new tabs, split, moved to another
 * group) -- this only seeds the VS Code-like starting layout.
 */
function buildInitialLayout(api: DockviewApi) {
  api.addPanel({
    id: 'disassembly',
    component: 'disassembly',
    title: 'DISASSEMBLY',
  });
  api.addPanel({
    id: 'sidebar',
    component: 'sidebar',
    title: 'SIDEBAR',
    position: { referencePanel: 'disassembly', direction: 'right' },
    initialWidth: 340,
  });
  api.addPanel({
    id: 'memory',
    component: 'memory',
    title: 'MEMORY',
    position: { referencePanel: 'disassembly', direction: 'below' },
    initialHeight: 220,
  });
  api.addPanel({
    id: 'trace',
    component: 'trace',
    title: 'TRACE',
    position: { referencePanel: 'memory', direction: 'within' },
    inactive: true,
  });
  api.addPanel({
    id: 'scanner',
    component: 'scanner',
    title: 'TARAYICI',
    position: { referencePanel: 'memory', direction: 'within' },
    inactive: true,
  });
  api.addPanel({
    id: 'terminal',
    component: 'terminal',
    title: 'TERMINAL',
    position: { referencePanel: 'memory', direction: 'within' },
    inactive: true,
  });
}

export function Win64Debugger({
  pid,
  tid,
  initialMemoryMappingId = 'process-heap',
  initialMemoryAddress = '',
  initialMemoryLength = 128,
  fullscreen = false,
  height = 680,
}: Win64DebuggerProps) {
  const session = useDebugSession({
    pid,
    tid,
    initialMemoryMappingId,
    initialMemoryAddress,
    initialMemoryLength,
  });
  /* Publishes to the persistent root-layout status bar via IDebugService
   * instead of rendering its own -- that bar stays mounted across every
   * IDE route, switching to this debug styling only while a
   * `Win64Debugger` is actually attached (`IDebugService.isDebugging`). */
  const debugService = useService(IDebugService);
  useEffect(() => {
    if (!session.ready) return;
    debugService.publishSession({
      stateDotClass: session.stateDotClass,
      stateLabel: session.stateLabel,
      messageText: session.message.text,
      messageTone: session.message.tone,
      suspendCount: session.suspendCount,
      rip: session.rip,
      image: session.process?.image ?? '',
      pid,
      tid,
    });
    return () => debugService.publishSession(undefined);
  }, [
    debugService,
    session.ready,
    session.stateDotClass,
    session.stateLabel,
    session.message.text,
    session.message.tone,
    session.suspendCount,
    session.rip,
    session.process?.image,
    pid,
    tid,
  ]);
  /* Lives here, not in a panel: switching dockview tabs must not throw away a
   * narrowed candidate set the user spent several scans building. */
  const scanner = useScannerSession({ pid, session });
  const [selectedAddress, setSelectedAddress] = useState<bigint>();
  /* `DockviewApi` is a mutable imperative handle (`group.header.hidden = ...`
   * below), not React-owned data -- kept in a ref so mutating it doesn't trip
   * the compiler's state-immutability check the way `useState` would. */
  const dockviewApiRef = useRef<DockviewApi>(undefined);
  const [dockviewReady, setDockviewReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const contextValue = useMemo(
    () => ({
      session,
      scanner,
      selectedAddress,
      onSelectAddress: setSelectedAddress,
    }),
    [session, scanner, selectedAddress],
  );

  /* ---------- keyboard shortcuts ----------
   * Captured on `document` so Monaco never swallows them first. Outside
   * fullscreen they only fire while focus is inside the debugger, so an
   * embedded debugger in a docs page never hijacks the whole page's F5. The
   * listener is registered once and reads the live handlers through a ref. */
  const shortcutsRef = useRef({ session, selectedAddress });
  useEffect(() => {
    shortcutsRef.current = { session, selectedAddress };
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const active = document.activeElement;
      const inside = active instanceof Node && root.contains(active);
      if (!fullscreen && !inside) return;

      const { session: live, selectedAddress: cursor } = shortcutsRef.current;
      let action: (() => void) | undefined;
      if (
        event.key === 'F5' &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        action = live.continueExecution;
      } else if (event.key === 'F10' && (event.ctrlKey || event.metaKey)) {
        if (cursor !== undefined) action = () => live.runToCursor(cursor);
      } else if (event.key === 'F10' && !event.shiftKey) {
        action = live.stepOver;
      } else if (event.key === 'F11' && event.shiftKey) {
        action = live.stepOut;
      } else if (event.key === 'F11') {
        action = live.stepInto;
      } else if (event.key === 'F9' && cursor !== undefined) {
        action = () => live.toggleBreakpoint(cursor);
      }
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      action();
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [fullscreen]);

  /* Fullscreen owns the page, so it takes focus and the shortcuts work at once. */
  useEffect(() => {
    if (fullscreen) rootRef.current?.focus({ preventScroll: true });
  }, [fullscreen]);

  /* Hide a group's tab strip while it holds exactly one panel -- a lone
   * "file" doesn't need a name to disambiguate from. Re-evaluated on every
   * structural change since the user is free to drag panels between groups
   * at runtime. */
  useEffect(() => {
    const api = dockviewReady ? dockviewApiRef.current : undefined;
    if (!api) return;
    const syncGroupHeaders = () => {
      for (const group of api.groups) {
        group.header.hidden = group.panels.length <= 1;
      }
    };
    syncGroupHeaders();
    const disposables = [
      api.onDidAddPanel(syncGroupHeaders),
      api.onDidRemovePanel(syncGroupHeaders),
      api.onDidMovePanel(syncGroupHeaders),
    ];
    return () => {
      for (const disposable of disposables) disposable.dispose();
    };
  }, [dockviewReady]);

  /* Tab badges (trace/scan hit counts) -- dockview panel titles are static
   * once set, so they're pushed explicitly whenever the counts change. */
  useEffect(() => {
    const api = dockviewReady ? dockviewApiRef.current : undefined;
    if (!api) return;
    api.getPanel('trace')?.api.setTitle(`TRACE (${session.trace.length})`);
    api
      .getPanel('scanner')
      ?.api.setTitle(
        scanner.scanned
          ? `TARAYICI (${scanner.report?.total ?? 0})`
          : 'TARAYICI',
      );
  }, [
    dockviewReady,
    session.trace.length,
    scanner.scanned,
    scanner.report?.total,
  ]);

  const rootClassName = fullscreen
    ? `relative flex min-h-0 flex-1 flex-col text-sm outline-none ${SURFACE}`
    : `relative flex flex-col overflow-hidden rounded-lg border text-sm outline-none ${SURFACE}`;

  return (
    <DebuggerContextProvider value={contextValue}>
      <section
        ref={rootRef}
        tabIndex={-1}
        className={rootClassName}
        style={
          fullscreen
            ? undefined
            : { height: typeof height === 'number' ? `${height}px` : height }
        }
      >
        {/* Inline styles for Monaco decorations, resize handles and the dockview theme */}
        <style>{DEBUGGER_CSS}</style>
        <style>{DOCKVIEW_THEME_CSS}</style>

        <DebugToolbar
          session={session}
          tid={tid}
          selectedAddress={selectedAddress}
        />

        <div className="min-h-0 flex-1">
          <DockviewReact
            className="dockview-theme-dark"
            theme={themeDark}
            components={DOCKVIEW_PANEL_COMPONENTS}
            onReady={(event: DockviewReadyEvent) => {
              buildInitialLayout(event.api);
              dockviewApiRef.current = event.api;
              setDockviewReady(true);
            }}
          />
        </div>
      </section>
    </DebuggerContextProvider>
  );
}

export default Win64Debugger;
