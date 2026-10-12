/**
 * Core Struct Definitions for Neptune Reactive Webview Bridge
 *
 * Struct 1: ConfigState (Web UI -> Engine)
 * Struct 2: TelemetryState (Engine -> Web UI)
 */

export interface SettingConfig {
  enabled: boolean;
  settings: Record<string, any>;
}

export type ModuleConfig = SettingConfig;

export interface RunningProcessItem {
  pid: number;
  name: string;
  windowTitle?: string;
  isMinecraft?: boolean;
  isRecognized?: boolean;
  suggestedProfile?: {
    id: string;
    name: string;
  };
}

/**
 * Struct 1: ConfigState
 * Represents the configuration and runtime settings managed by the web interface.
 */
export interface ConfigState {
  settings: Record<string, SettingConfig>;
  activeProfile: string;
  targetPid: number | null;
  searchQuery?: string;
  custom?: Record<string, any>;
}

export interface TargetInfo {
  name: string;
  distance: number;
  health: number;
  maxHealth: number;
  armor: number;
  hurtTime: number;
  ping?: number;
}

export interface ConfigPreset {
  id: string;
  name: string;
  description: string;
  config: Record<string, { enabled: boolean; settings?: Record<string, any> }>;
}

export type CheatPreset = ConfigPreset;

/**
 * Struct 2: TelemetryState
 * Represents the live in-game engine metrics pushed from Minecraft to the web UI.
 */
export interface TelemetryState {
  connected: boolean;
  pid?: number;
  profileId?: string;
  profileName?: string;
  windowTitle?: string;
  health: number;
  maxHealth: number;
  posX: number;
  posY: number;
  posZ: number;
  motionX: number;
  motionY: number;
  motionZ: number;
  timerSpeed: number;
  tickCount: number;
  processes: RunningProcessItem[];
  profiles?: any[];
  activeProfile?: string;
  target?: TargetInfo | null;
  cpsLeft?: number;
  cpsRight?: number;
  combo?: number;
  reach?: number;
  presets?: ConfigPreset[];
  timestamp: number;
}

export interface ConfigDiffEvent {
  type: 'config_diff';
  path: string;
  value: any;
  oldValue?: any;
  timestamp: number;
}

export interface ActionEvent {
  type: 'action';
  action: string;
  payload?: any;
  timestamp: number;
}

export type InboundBridgeMessage =
  ConfigDiffEvent | ActionEvent | Record<string, any>;
