import { expect, test, describe } from 'bun:test';
import {
  ReactiveWebviewBridge,
  type ConfigDiffEvent,
} from '../../packages/exoproc/src/bridge/index.js';

describe('exoproc > ReactiveWebviewBridge & 2-Struct Contract', () => {
  test('initializes with default 2-struct state', () => {
    const bridge = new ReactiveWebviewBridge();

    // Struct 1: ConfigState
    expect(bridge.config).toBeDefined();
    expect(bridge.config.settings).toEqual({});
    expect(bridge.config.activeProfile).toBe('vanilla_1_8_9');
    expect(bridge.config.targetPid).toBeNull();

    // Struct 2: TelemetryState
    expect(bridge.telemetry).toBeDefined();
    expect(bridge.telemetry.connected).toBe(false);
    expect(bridge.telemetry.health).toBe(20);
    expect(bridge.telemetry.maxHealth).toBe(20);
    expect(bridge.telemetry.tickCount).toBe(0);
    expect(bridge.telemetry.processes).toEqual([]);
  });

  test('applies nested config diffs to Struct 1 (ConfigState) correctly', async () => {
    const bridge = new ReactiveWebviewBridge();
    const diffsReceived: ConfigDiffEvent[] = [];

    bridge.onConfigChange((diff, fullConfig) => {
      diffsReceived.push(diff);
      expect(fullConfig).toBe(bridge.config);
    });

    // 1. Mutate root property
    const diff1: ConfigDiffEvent = {
      type: 'config_diff',
      path: 'activeProfile',
      value: 'forge_1_8_9',
      oldValue: 'vanilla_1_8_9',
      timestamp: Date.now(),
    };
    await bridge.handleInboundMessage(diff1);

    expect(bridge.config.activeProfile).toBe('forge_1_8_9');
    expect(diffsReceived.length).toBe(1);

    // 2. Mutate nested setting switch
    const diff2: ConfigDiffEvent = {
      type: 'config_diff',
      path: 'settings.telemetry.enabled',
      value: true,
      oldValue: false,
      timestamp: Date.now(),
    };
    await bridge.handleInboundMessage(diff2);

    expect(bridge.config.settings.telemetry?.enabled).toBe(true);
    expect(diffsReceived.length).toBe(2);

    // 3. Mutate deeply nested setting slider
    const diff3: ConfigDiffEvent = {
      type: 'config_diff',
      path: 'settings.inspector.settings.sampleRate',
      value: 60,
      oldValue: 30,
      timestamp: Date.now(),
    };
    await bridge.handleInboundMessage(diff3);

    expect(bridge.config.settings.inspector?.settings.sampleRate).toBe(60);
    expect(diffsReceived.length).toBe(3);
  });

  test('updates and exposes Struct 2 (TelemetryState) metrics', () => {
    const bridge = new ReactiveWebviewBridge();

    bridge.pushTelemetry({
      health: 15.5,
      maxHealth: 20,
      posX: 128.45,
      posY: 64.0,
      posZ: -320.12,
      tickCount: 42,
    });

    expect(bridge.telemetry.health).toBe(15.5);
    expect(bridge.telemetry.posX).toBe(128.45);
    expect(bridge.telemetry.posY).toBe(64.0);
    expect(bridge.telemetry.posZ).toBe(-320.12);
    expect(bridge.telemetry.tickCount).toBe(42);
    expect(bridge.telemetry.timestamp).toBeGreaterThan(0);
  });

  test('dispatches named action events to registered action listeners', async () => {
    const bridge = new ReactiveWebviewBridge();
    const actions: Array<{ action: string; payload: any }> = [];

    bridge.onAction((action, payload) => {
      actions.push({ action, payload });
    });

    await bridge.handleInboundMessage({
      type: 'action',
      action: 'attach_process',
      payload: { pid: 4820, profileId: 'badlion_1_8_9' },
    });

    expect(actions.length).toBe(1);
    expect(actions[0]!.action).toBe('attach_process');
    expect(actions[0]!.payload.pid).toBe(4820);
    expect(actions[0]!.payload.profileId).toBe('badlion_1_8_9');
  });

  test('saves and loads presets cleanly', async () => {
    const bridge = new ReactiveWebviewBridge();
    expect(bridge.presets.length).toBeGreaterThanOrEqual(1);

    // 1. Save custom preset
    await bridge.handleInboundMessage({
      type: 'action',
      action: 'save_preset',
      payload: {
        preset: {
          id: 'custom_diagnostics',
          name: 'Diagnostics Profile',
          description: 'High-frequency telemetry logging',
          config: {
            telemetry: { enabled: true, settings: { pollIntervalMs: 50 } },
          },
        },
      },
    });

    const found = bridge.presets.find((p) => p.id === 'custom_diagnostics');
    expect(found).toBeDefined();
    expect(found?.name).toBe('Diagnostics Profile');

    // 2. Load preset into config
    await bridge.handleInboundMessage({
      type: 'action',
      action: 'load_preset',
      payload: { presetId: 'custom_diagnostics' },
    });

    expect(bridge.config.settings.telemetry?.enabled).toBe(true);
    expect(bridge.config.settings.telemetry?.settings?.pollIntervalMs).toBe(50);
  });

  test('updates MDX layout on save_layout action', async () => {
    const bridge = new ReactiveWebviewBridge();
    const customMdx =
      '<Tabs><Tab label="Custom"><Card title="Test" /></Tab></Tabs>';

    await bridge.handleInboundMessage({
      type: 'action',
      action: 'save_layout',
      payload: { layoutMdx: customMdx },
    });

    expect(bridge.layoutMdx).toBe(customMdx);
  });
});
