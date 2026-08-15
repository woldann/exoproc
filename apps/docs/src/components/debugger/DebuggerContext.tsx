'use client';

import { createContext, useContext } from 'react';
import type { DebugSession } from './useDebugSession';
import type { ScannerSession } from './useScannerSession';

/**
 * Dockview mounts panel content through `ReactDOM.createPortal`, which keeps
 * the portaled tree inside React's normal reconciliation -- portals don't
 * break Context propagation, only the DOM parent changes. So panels read
 * live session state through this context instead of dockview `params`,
 * which are frozen at `addPanel()` time and only change via an explicit
 * `updateParameters()` call. Context re-renders every panel on every
 * `Win64Debugger` render, same as the pre-dockview layout did.
 *
 * `process`/`thread` deliberately aren't carried here -- every panel reads
 * process/thread state through `session` (a `ProcessSnapshotDto`/
 * `ThreadSnapshotDto` pair kept fresh inside the hook), never off this
 * context directly.
 */
export interface DebuggerContextValue {
  session: DebugSession;
  scanner: ScannerSession;
  selectedAddress?: bigint;
  onSelectAddress: (address: bigint) => void;
}

const DebuggerContext = createContext<DebuggerContextValue | undefined>(undefined);

export const DebuggerContextProvider = DebuggerContext.Provider;

export function useDebuggerContext(): DebuggerContextValue {
  const value = useContext(DebuggerContext);
  if (!value) {
    throw new Error('useDebuggerContext() must be used within a Win64Debugger');
  }
  return value;
}
