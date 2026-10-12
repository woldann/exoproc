import { writeFileSync } from 'node:fs';
import type { NeptuneClient } from '../client.js';
import { GAME_PROFILES } from '../config/profiles.js';
import type { WebviewDriver } from '../webview/driver.js';
import { CdpWebviewDriver } from '../webview/cdp-driver.js';
import type {
  ConfigDiffEvent,
  ConfigState,
  RunningProcessItem,
  TelemetryState,
  TargetInfo,
  ConfigPreset,
} from './structs.js';

export type ConfigChangeCallback = (
  diff: ConfigDiffEvent,
  fullConfig: ConfigState,
) => void;
export type ActionCallback = (action: string, payload: any) => void;

import { DEFAULT_NEPTUNE_LAYOUT_MDX } from '../layout/default-layout.js';
import {
  importBridgeCryptoKey,
  encryptBridgePacket,
  decryptBridgePacket,
  resetBridgeCryptoSeq,
} from '../crypto/bridge-crypto.js';

export const DEFAULT_PRESETS: ConfigPreset[] = [
  {
    id: 'default_telemetry',
    name: 'Default Diagnostics',
    description: 'Standard diagnostics and telemetry collection profile.',
    config: {
      telemetry: {
        enabled: true,
        settings: { pollIntervalMs: 100 },
      },
    },
  },
];

export interface NeptuneUIConfig {
  statusTitle: string;
  statusSubtitle: string;
  showSearchBar: boolean;
  searchPlaceholder: string;
  showHealth: boolean;
  showPosition: boolean;
  showTimer: boolean;
  showFps: boolean;
  showProcessPicker: boolean;
  emptyStateTitle: string;
  emptyStateSubtitle: string;
}

export const DEFAULT_UI_CONFIG: NeptuneUIConfig = {
  statusTitle: '0ms',
  statusSubtitle: 'Local Engine Bridge Active',
  showSearchBar: true,
  searchPlaceholder: 'Search settings...',
  showHealth: true,
  showPosition: true,
  showTimer: true,
  showFps: true,
  showProcessPicker: true,
  emptyStateTitle: 'No instrumentation active',
  emptyStateSubtitle:
    'All diagnostics are dynamically provided by the Neptune Engine.',
};

/**
 * Dedicated Deno Fresh Cockpit Bridge & RPC Binding for Neptune.
 * Connects the Deno Web Cockpit directly via WebviewDriver (CDP or Native Webview).
 */
export class ReactiveWebviewBridge {
  public driver: WebviewDriver;
  private telemetryTimer: any = null;
  private actionCallbacks: ActionCallback[] = [];
  private configCallbacks: ConfigChangeCallback[] = [];

  public config: ConfigState = {
    settings: {},
    activeProfile: 'vanilla_1_8_9',
    targetPid: null,
  };

  public layoutMdx: string = DEFAULT_NEPTUNE_LAYOUT_MDX;
  public cryptoKey: CryptoKey | null = null;
  public isEncrypted: boolean = false;
  public activeAccount: { id: string; name: string; username?: string } | null =
    null;

  public telemetry: TelemetryState = {
    connected: false,
    health: 20,
    maxHealth: 20,
    posX: 0,
    posY: 0,
    posZ: 0,
    motionX: 0,
    motionY: 0,
    motionZ: 0,
    timerSpeed: 1.0,
    tickCount: 0,
    processes: [],
    timestamp: Date.now(),
  };

  public presets: ConfigPreset[] = [...DEFAULT_PRESETS];
  public target: TargetInfo | null = {
    name: 'TargetPlayer_42',
    distance: 3.4,
    health: 16.5,
    maxHealth: 20,
    armor: 15,
    hurtTime: 0,
    ping: 32,
  };
  public combatTelemetry = {
    cpsLeft: 12,
    cpsRight: 0,
    combo: 3,
    reach: 3.12,
  };

  public expectedSessionNonce?: string;

  constructor(
    public client?: NeptuneClient,
    targetUrl?: string,
    driver?: WebviewDriver,
    sessionNonce?: string,
  ) {
    this.expectedSessionNonce = sessionNonce;

    this.driver =
      driver ||
      new CdpWebviewDriver({
        targetUrl,
        onConnect: () => {
          this.driver.eval(`
            if (typeof window.dispatchEvent === 'function') {
              window.dispatchEvent(new CustomEvent('neptune:engine-ready', { detail: { ready: true } }));
            }
          `);
          this.syncFullState();
          this.startTelemetryLoop();
          this.startScreenshotLoop(2000);
        },
      });

    this.setupRpcBindings();
  }

  private setupRpcBindings() {
    // 1. getEngineAccount()
    this.driver.bind('getEngineAccount', () => {
      return this.activeAccount;
    });

    // 2. canSwitchToEncrypted(userId, sessionNonce)
    this.driver.bind(
      'canSwitchToEncrypted',
      async (userId?: string, sessionNonce?: string) => {
        if (
          this.expectedSessionNonce &&
          sessionNonce &&
          sessionNonce !== this.expectedSessionNonce
        ) {
          console.warn(
            '[Neptune Bridge] ⚠️ Session nonce mismatch in canSwitchToEncrypted!',
          );
          return false;
        }

        if (this.isEncrypted && this.cryptoKey) {
          return true;
        }

        const targetUserId = userId || this.activeAccount?.id || 'guest_local';
        if (!this.activeAccount && userId) {
          this.activeAccount = { id: userId, name: userId };
        }

        try {
          const targetHost = 'http://127.0.0.1:8000';
          const res = await fetch(
            `${targetHost}/api/auth/key?user_id=${encodeURIComponent(targetUserId)}`,
            {
              signal: AbortSignal.timeout(2500),
            },
          ).catch(() => null);

          if (res && res.ok) {
            const data = (await res.json()) as any;
            if (data && data.success && data.key) {
              resetBridgeCryptoSeq();
              this.cryptoKey = await importBridgeCryptoKey(data.key);
              this.isEncrypted = true;
              console.log(
                `[Neptune Bridge] ✓ E2EE Key loaded for [${targetUserId}]! canSwitchToEncrypted: TRUE`,
              );
              // Immediately sync full state and start telemetry loop
              this.syncFullState();
              this.startTelemetryLoop();
              this.startScreenshotLoop(2000);
              return true;
            }
          }
        } catch {}
        return false;
      },
    );

    // 3. getEngineState()
    this.driver.bind('getEngineState', async () => {
      return this.getSerializedState();
    });

    // 4. sendEngineAction(action, payload)
    this.driver.bind(
      'sendEngineAction',
      async (action: string, payload: any = {}) => {
        return this.handleAction(action, payload);
      },
    );

    // 5. switchEngineAccount(user)
    this.driver.bind('switchEngineAccount', async (user: any) => {
      this.activeAccount = user;
      this.cryptoKey = null;
      this.isEncrypted = false;
      resetBridgeCryptoSeq();
      console.log(
        `[Neptune Bridge] 🔄 Switched engine account to [${user?.name || 'Guest'}]. Awaiting new key.`,
      );
      return { success: true };
    });

    // 6. enginePing()
    this.driver.bind('enginePing', () => {
      return {
        alive: true,
        isEncrypted: this.isEncrypted,
        connected: Boolean(this.client?.host),
        pid: this.telemetry.pid,
        timestamp: Date.now(),
      };
    });
  }

  private screenshotTimer: any = null;

  public startScreenshotLoop(intervalMs: number = 2000) {
    if (this.screenshotTimer) return;
    const outputPath =
      process.env.NEPTUNE_SCREENSHOT_PATH || 'neptune-cockpit.png';

    this.screenshotTimer = setInterval(async () => {
      try {
        if ('captureScreenshot' in this.driver) {
          const base64 = await (this.driver as any).captureScreenshot();
          if (base64) {
            const buf = Buffer.from(base64, 'base64');
            writeFileSync(outputPath, buf);
          }
        }
      } catch {}
    }, intervalMs);
  }

  public onConfigChange(cb: ConfigChangeCallback) {
    this.configCallbacks.push(cb);
  }

  public onAction(cb: ActionCallback) {
    this.actionCallbacks.push(cb);
  }

  public async connect(port: number = 9222): Promise<boolean> {
    return this.driver.connect(port);
  }

  public async attach(port: number = 9222): Promise<boolean> {
    return this.driver.connect(port);
  }

  public pushTelemetry(customTelemetry?: Partial<TelemetryState>) {
    if (this.client) {
      this.client
        .getTelemetry()
        .then((clientTel) => {
          this.pushState({
            ...clientTel,
            ...this.combatTelemetry,
            target: this.target,
            presets: this.presets,
            connected: Boolean(this.client?.host),
            ...(customTelemetry || {}),
            timestamp: Date.now(),
          });
        })
        .catch(() => {});
    } else {
      this.pushState({
        ...this.combatTelemetry,
        target: this.target,
        presets: this.presets,
        ...(customTelemetry || {}),
        timestamp: Date.now(),
      });
    }
  }

  private uiConfig: NeptuneUIConfig = DEFAULT_UI_CONFIG;

  public async getSerializedState() {
    if (this.client) {
      const clientTel = await this.client.getTelemetry();
      this.telemetry = {
        ...this.telemetry,
        ...clientTel,
        connected: Boolean(this.client.host),
        timestamp: Date.now(),
      };
    }

    const fullState = {
      ...this.telemetry,
      ...this.combatTelemetry,
      target: this.target,
      presets: this.presets,
      uiConfig: this.uiConfig,
      layoutMdx: this.layoutMdx,
      profiles: Object.values(GAME_PROFILES),
      activeProfile: this.client?.activeProfile?.id ?? 'vanilla_1_8_9',
      isPaired: true,
      timestamp: Date.now(),
    };

    if (this.isEncrypted && this.cryptoKey) {
      try {
        const packet = await encryptBridgePacket(fullState, this.cryptoKey);
        return { encrypted: true, packet };
      } catch {
        return { encrypted: false, state: fullState };
      }
    }

    return {
      encrypted: false,
      state: {
        isPaired: false,
        connected: false,
        telemetry: { ...this.telemetry, connected: false },
        profiles: [],
        uiConfig: {
          ...this.uiConfig,
          statusTitle: 'Encrypted Handshake Pending',
          statusSubtitle: 'Awaiting Key Verification',
        },
        layoutMdx: '',
        timestamp: Date.now(),
      },
    };
  }

  public pushState(state: Partial<TelemetryState> & Record<string, any>) {
    this.telemetry = { ...this.telemetry, ...state };
    if (state.uiConfig) this.uiConfig = state.uiConfig;
    if (state.layoutMdx) this.layoutMdx = state.layoutMdx;
    if (state.presets) this.presets = state.presets;
    if (state.target !== undefined) this.target = state.target;

    const fullState = {
      ...this.telemetry,
      ...this.combatTelemetry,
      target: this.target,
      presets: this.presets,
      uiConfig: this.uiConfig,
      layoutMdx: this.layoutMdx,
      profiles: Object.values(GAME_PROFILES),
      isPaired: true,
      ...state,
    };

    if (this.isEncrypted && this.cryptoKey) {
      encryptBridgePacket(fullState, this.cryptoKey)
        .then((encryptedPacket) => {
          const payload = JSON.stringify(encryptedPacket);
          this.driver.eval(`
            if (window.__NEPTUNE_SDK__) {
              window.__NEPTUNE_SDK__.receiveEngineState(${payload});
            }
            window.dispatchEvent(new CustomEvent('engine:state', { detail: ${payload} }));
          `);
        })
        .catch((e) =>
          console.error('[Neptune Encrypted Bridge] Encryption error:', e),
        );
      return;
    }

    // Unencrypted Mode: Strict Gate! No unauthenticated configuration or MDX leaked!
    const unencryptedState = {
      isPaired: false,
      isEncrypted: false,
      connected: Boolean(this.client?.host),
      status: 'awaiting_encryption',
    };
    const payload = JSON.stringify(unencryptedState);

    this.driver.eval(`
      window.dispatchEvent(new CustomEvent('engine:state', { detail: ${payload} }));
    `);
  }

  public async syncFullState() {
    this.pushState({
      isPaired: true,
      uiConfig: DEFAULT_UI_CONFIG,
      layoutMdx: this.layoutMdx,
      profiles: Object.values(GAME_PROFILES) as any,
      activeProfile: this.client?.activeProfile?.id ?? 'vanilla_1_8_9',
      connected: Boolean(this.client?.host),
      pid: this.client?.host ? (this.telemetry.pid ?? undefined) : undefined,
      timestamp: Date.now(),
    });

    if (this.client) {
      this.client
        .listProcesses()
        .then((procs) => {
          if (Array.isArray(procs) && procs.length > 0) {
            this.pushState({ processes: procs as RunningProcessItem[] });
          }
        })
        .catch(() => {});
    }
  }

  private startTelemetryLoop() {
    if (this.telemetryTimer) clearInterval(this.telemetryTimer);
    this.telemetryTimer = setInterval(() => {
      this.pushTelemetry();
    }, 100);
  }

  public async handleInboundMessage(msg: any) {
    if (!msg) return;

    // 1. Encrypted Inbound Message from Webview
    const packet = msg.packet || (msg.__encrypted ? msg : null);
    if (
      (msg.action === 'encrypted_msg' || msg.__encrypted) &&
      packet &&
      this.cryptoKey
    ) {
      try {
        const decrypted = await decryptBridgePacket(packet, this.cryptoKey);
        await this.handleAction(decrypted.action, decrypted);
      } catch (err) {
        console.error('[Neptune Bridge] Error decrypting inbound packet:', err);
      }
      return;
    }

    // 3. Config Diff Message
    if ((msg.type === 'diff' || msg.type === 'config_diff') && msg.path) {
      this.applyConfigDiff(msg as ConfigDiffEvent);
      for (const cb of this.configCallbacks) {
        try {
          cb(msg as ConfigDiffEvent, this.config);
        } catch (e) {
          console.error('[Neptune] Error in config callback:', e);
        }
      }
      return;
    }

    // 4. Cleartext Action Message (only allowed during unencrypted handshake)
    const action = msg.action || msg.type || 'unknown';
    const payload = msg.payload !== undefined ? msg.payload : msg;

    for (const cb of this.actionCallbacks) {
      try {
        cb(action, payload);
      } catch (e) {
        console.error('[Neptune] Error in action callback:', e);
      }
    }

    await this.handleAction(action, payload);
  }

  private async handleAction(action: string, payload: any) {
    switch (action) {
      case 'toggle':
      case 'toggle_setting': {
        const id = payload.id || payload.settingId || payload.moduleId;
        if (id) {
          if (!this.config.settings[id]) {
            this.config.settings[id] = { enabled: true, settings: {} };
          } else {
            this.config.settings[id].enabled =
              !this.config.settings[id].enabled;
          }
          await this.syncFullState();
        }
        break;
      }

      case 'setting':
      case 'update_setting': {
        const id = payload.id || payload.settingId || payload.moduleId;
        const key = payload.settingId || payload.settingKey || payload.key;
        if (id && key !== undefined) {
          if (!this.config.settings[id]) {
            this.config.settings[id] = { enabled: true, settings: {} };
          }
          this.config.settings[id].settings[key] = payload.value;
          await this.syncFullState();
        }
        break;
      }

      case 'attach':
      case 'attach_process': {
        const pid = payload.pid;
        const profileId = payload.profileId;
        if (pid && this.client) {
          console.log(
            `[Neptune Engine] Attaching to game process PID ${pid}...`,
          );
          try {
            await this.client.connect(pid, profileId);
            console.log(
              `[Neptune Engine] ✓ Successfully attached to process PID ${pid}`,
            );
          } catch (err: any) {
            console.error(
              `[Neptune Engine] ✗ Attachment failed for PID ${pid}:`,
              err?.message ?? err,
            );
          }
          await this.syncFullState();
        }
        break;
      }

      case 'detach':
      case 'detach_process': {
        if (this.client) {
          await this.client.disconnect();
          await this.syncFullState();
        }
        break;
      }

      case 'get_init':
      case 'init': {
        await this.syncFullState();
        break;
      }

      case 'get_processes':
      case 'processes': {
        if (this.client) {
          const procs = await this.client.listProcesses();
          this.pushState({ processes: procs as any });
        }
        break;
      }

      case 'save_preset': {
        const preset: ConfigPreset = payload.preset || payload;
        if (preset && preset.id) {
          const idx = this.presets.findIndex((p) => p.id === preset.id);
          if (idx >= 0) {
            this.presets[idx] = preset;
          } else {
            this.presets.push(preset);
          }
          await this.syncFullState();
        }
        break;
      }

      case 'load_preset': {
        const presetId = payload.presetId || payload.id;
        const preset = this.presets.find((p) => p.id === presetId);
        if (preset && preset.config) {
          for (const [id, conf] of Object.entries(preset.config)) {
            this.config.settings[id] = {
              enabled: Boolean(conf.enabled),
              settings: conf.settings || {},
            };
          }
          await this.syncFullState();
        }
        break;
      }

      case 'save_layout': {
        if (typeof payload.layoutMdx === 'string') {
          this.layoutMdx = payload.layoutMdx;
          await this.syncFullState();
        }
        break;
      }

      case 'set_target': {
        if (payload.target !== undefined) {
          this.target = payload.target;
          this.pushTelemetry();
        }
        break;
      }
    }
  }

  private applyConfigDiff(diff: ConfigDiffEvent) {
    const parts = diff.path.split('.');
    let curr: any = this.config;

    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]!;
      if (!curr[p] || typeof curr[p] !== 'object') {
        curr[p] = {};
      }
      curr = curr[p];
    }

    const lastKey = parts[parts.length - 1]!;
    curr[lastKey] = diff.value;
  }

  public close() {
    if (this.screenshotTimer) {
      clearInterval(this.screenshotTimer);
      this.screenshotTimer = null;
    }
    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
    this.driver.close();
  }
}
