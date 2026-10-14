import React, { useState, useCallback } from 'react';
import { useBindings } from '@opentui/keymap/react';

export interface CockpitLogEntry {
  id: string;
  time: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

export interface CockpitProps {
  initialTarget?: {
    pid?: number;
    name?: string;
    windowTitle?: string;
    profileName?: string;
  };
  ipcInfo: {
    port?: number | null;
    isHeadless: boolean;
    sessionToken: string;
    cockpitUrl: string;
  };
  logs: CockpitLogEntry[];
  status: 'scanning' | 'attached' | 'standby' | 'disconnected';
  onShutdown: (reason: string) => void;
  onRescan: () => Promise<void>;
}

export const ExoprocCockpit: React.FC<CockpitProps> = ({
  initialTarget,
  ipcInfo,
  logs,
  status,
  onShutdown,
  onRescan,
}) => {
  const [isRescanning, setIsRescanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleRescan = useCallback(async () => {
    if (isRescanning) return;
    setIsRescanning(true);
    setNotice('Rescanning running processes...');
    try {
      await onRescan();
      setNotice('Rescan complete.');
    } catch (err: any) {
      setNotice(`Rescan error: ${err.message || String(err)}`);
    } finally {
      setIsRescanning(false);
      setTimeout(() => setNotice(null), 2500);
    }
  }, [isRescanning, onRescan]);

  useBindings(
    () => ({
      bindings: [
        {
          key: 'q',
          cmd: () => onShutdown('Quit requested from terminal cockpit'),
        },
        {
          key: 'ctrl+c',
          cmd: () =>
            onShutdown('Quit requested from terminal cockpit (Ctrl+C)'),
        },
        { key: 'r', cmd: () => handleRescan() },
        {
          key: 'c',
          cmd: () => {
            setNotice(`Cockpit URL: ${ipcInfo.cockpitUrl}`);
            setTimeout(() => setNotice(null), 4000);
          },
        },
      ],
    }),
    [onShutdown, handleRescan, ipcInfo.cockpitUrl],
  );

  const getStatusBadge = () => {
    switch (status) {
      case 'attached':
        return <strong fg="#00FF66">● ATTACHED & INSTRUMENTED</strong>;
      case 'scanning':
        return <strong fg="#FFCC00">◌ SCANNING TARGETS...</strong>;
      case 'standby':
        return <strong fg="#00CCFF">◐ STANDBY (WEB UI READY)</strong>;
      default:
        return <strong fg="#FF4444">○ DISCONNECTED</strong>;
    }
  };

  const visibleLogs = logs.slice(-6);

  return (
    <box flexDirection="column" style={{ padding: 1, flexGrow: 1 }}>
      {/* Header Banner */}
      <box
        title=" 🔱 EXOPROC AUTONOMOUS GAME COCKPIT "
        titleColor="cyan"
        border
        borderStyle="rounded"
        borderColor="cyan"
        padding={1}
        marginBottom={1}
      >
        <box flexDirection="row" style={{ justifyContent: 'space-between' }}>
          <box flexDirection="column">
            <text fg="cyan">
              <strong fg="cyan">
                Exoproc External Instrumentation & Reactive Bridge
              </strong>
            </text>
            <text fg="gray">
              High-Performance OpenTUI Cockpit • Bun x64 Native
            </text>
          </box>
          <box flexDirection="column" style={{ alignItems: 'flex-end' }}>
            <text>{getStatusBadge()}</text>
            <text fg="gray">
              {notice ? <span fg="yellow">{notice}</span> : 'Status: Ready'}
            </text>
          </box>
        </box>
      </box>

      {/* Target & IPC Info Panels */}
      <box flexDirection="row" marginBottom={1}>
        {/* Target Process */}
        <box
          title=" 🎯 Target Process "
          titleColor={status === 'attached' ? '#00FF66' : 'yellow'}
          border
          borderStyle="single"
          borderColor={status === 'attached' ? '#00FF66' : 'yellow'}
          padding={1}
          style={{ flexGrow: 1, marginRight: 1 }}
        >
          <text fg="white">
            Process:{' '}
            <strong fg={initialTarget?.name ? '#00FF66' : 'yellow'}>
              {initialTarget?.name ||
                (isRescanning ? 'Scanning...' : 'None detected')}
            </strong>
          </text>
          <text fg="white">
            PID:{' '}
            <strong fg="cyan">
              {initialTarget?.pid ? String(initialTarget.pid) : '—'}
            </strong>
          </text>
          <text fg="white">
            Window: <span fg="white">{initialTarget?.windowTitle || '—'}</span>
          </text>
          <text fg="white">
            Profile:{' '}
            <span fg="magenta">{initialTarget?.profileName || 'Auto'}</span>
          </text>
        </box>

        {/* Webview & IPC Bridge */}
        <box
          title=" 🌐 Webview & CDP Bridge "
          titleColor="magenta"
          border
          borderStyle="single"
          borderColor="magenta"
          padding={1}
          style={{ flexGrow: 1 }}
        >
          <text fg="white">
            Mode:{' '}
            <strong fg="cyan">
              {ipcInfo.isHeadless ? 'Headless Mode' : 'Desktop Hybrid Cockpit'}
            </strong>
          </text>
          <text fg="white">
            IPC Port:{' '}
            <span fg="green">
              {ipcInfo.port
                ? `Port ${ipcInfo.port}`
                : 'DevTools Internal Bridge (0 Ports Open)'}
            </span>
          </text>
          <text fg="white">
            Token:{' '}
            <span fg="yellow">{ipcInfo.sessionToken.slice(0, 16)}...</span>
          </text>
          <text fg="white">
            Host: <span fg="magenta">{ipcInfo.cockpitUrl.slice(0, 32)}...</span>
          </text>
        </box>
      </box>

      {/* Live Event Stream */}
      <box
        title=" 📋 Live Event Stream "
        titleColor="blue"
        border
        borderStyle="single"
        borderColor="blue"
        padding={1}
        marginBottom={1}
        flexDirection="column"
        style={{ flexGrow: 1 }}
      >
        {visibleLogs.length === 0 ? (
          <text fg="gray">Waiting for events...</text>
        ) : (
          visibleLogs.map((log) => {
            let color = 'white';
            let prefix = '•';
            if (log.level === 'success') {
              color = '#00FF66';
              prefix = '✓';
            } else if (log.level === 'warn') {
              color = '#FFCC00';
              prefix = '⚠';
            } else if (log.level === 'error') {
              color = '#FF4444';
              prefix = '✖';
            } else if (log.level === 'info') {
              color = '#00CCFF';
              prefix = 'ℹ';
            }

            return (
              <text key={log.id} fg="white">
                <span fg="gray">[{log.time}] </span>
                <span fg={color}>{prefix} </span>
                <span fg={color}>{log.message}</span>
              </text>
            );
          })
        )}
      </box>

      {/* Controls Bar */}
      <box
        title=" ⌨ Key Controls "
        border
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
      >
        <text fg="gray">
          Press <strong fg="yellow">[Q]</strong> Disconnect & Quit •{' '}
          <strong fg="yellow">[R]</strong> Rescan Targets •{' '}
          <strong fg="yellow">[C]</strong> Cockpit Link •{' '}
          <span fg="cyan">OpenTUI Active</span>
        </text>
      </box>
    </box>
  );
};
