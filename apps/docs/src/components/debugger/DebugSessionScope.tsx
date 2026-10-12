'use client';

import { useEffect, useState } from 'react';
import { useService } from '@/platform/instantiation/browser/instantiationService';
import { IDebugService } from '@/workbench/services/debug/IDebugService';
import { IOutputService } from '@/workbench/services/output/IOutputService';
import { DEBUGGER_CSS } from './chrome';
import { useDebugSession, type DebugSession } from './useDebugSession';

export interface DebugSessionValue {
  readonly session: DebugSession;
  readonly tid: number;
  readonly selectedAddress: bigint | undefined;
  readonly onSelectAddress: (address: bigint) => void;
}

/**
 * Mounts exactly one `useDebugSession` for the whole `/ide` workbench and
 * reports its composed value up to `IdeWorkbench`'s `onSessionChange`,
 * instead of a React Context provider wrapping the workbench body.
 *
 * A Context provider was the first design here, but it's wrong for this
 * case specifically: whether a debug target is attached has to flip this
 * component in and out of existence (its underlying `useDebugSession` call
 * eagerly starts a real attach round-trip the moment it's given a pid/tid,
 * so it cannot be mounted unconditionally with placeholder values). A
 * Context *provider* wrapping `IdeWorkbenchBody` would therefore need to
 * conditionally interpose itself above `IdeWorkbenchBody` in the tree --
 * and React remounts a subtree the instant the component type at its
 * parent's slot changes, which would blow away `IdeWorkbenchBody`'s own
 * state (the open file's unsaved draft, the terminal session, ...) on
 * every attach/detach. Rendering this component as an inert, always-safe-
 * to-omit *sibling* at the end of `IdeWorkbenchBody`'s own children (see
 * `IdeWorkbench.tsx`) and lifting its value through a plain callback
 * instead avoids ever changing `IdeWorkbenchBody`'s own position in the
 * tree -- exactly the "nothing else should change" behavior asked for.
 *
 * Also folds in what used to be `Win64Debugger`'s own status-bar
 * publishing and the RIP/breakpoint decoration CSS, now that nothing here
 * mounts the full dockview surface -- see `useDebuggerView`'s doc comment
 * for what's no longer reachable (Memory/Trace/Scanner).
 */
export function DebugSessionMount({
  pid,
  tid,
  onSessionChange,
}: {
  readonly pid: number;
  readonly tid: number;
  readonly onSessionChange: (value: DebugSessionValue | undefined) => void;
}) {
  const session = useDebugSession({
    pid,
    tid,
    initialMemoryMappingId: 'process-heap',
    initialMemoryAddress: '',
    initialMemoryLength: 128,
  });
  const debugService = useService(IDebugService);
  const outputService = useService(IOutputService);
  const [selectedAddress, setSelectedAddress] = useState<bigint>();

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

  // Every status message the session already produces (attach, step,
  // breakpoint hits, memory writes, errors) becomes a line in the "Debug
  // Logs" tab -- there was no persistent log of these before, only the
  // single latest `message` shown in the toolbar.
  useEffect(() => {
    outputService.append('debug', session.message.text, session.message.tone);
  }, [session.message, outputService]);

  // Reports the composed value after every render (so `IdeWorkbenchBody`
  // is always at most one render behind), and clears it on unmount only --
  // splitting these into two effects avoids the cleanup-then-immediately-
  // reapply flicker a single effect keyed on `[session, ...]` would cause.
  useEffect(() => {
    onSessionChange({
      session,
      tid,
      selectedAddress,
      onSelectAddress: setSelectedAddress,
    });
  }, [onSessionChange, session, tid, selectedAddress]);
  useEffect(() => {
    return () => onSessionChange(undefined);
  }, [onSessionChange]);

  return <style>{DEBUGGER_CSS}</style>;
}
