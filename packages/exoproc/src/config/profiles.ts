import type { MatchOptions } from 'exoproc-minecraft';

export interface GameProfile {
  id: string;
  name: string;
  description: string;
  launcher: string;
  matchOptions: MatchOptions;
  icon: string;
}

export const GAME_PROFILES: Record<string, GameProfile> = {
  vanilla_1_8_9: {
    id: 'vanilla_1_8_9',
    name: 'Vanilla Minecraft 1.8.9',
    description:
      'Standard Mojang/Prism/MultiMC 1.8.9 client using RealmsBridge root anchor',
    launcher: 'Vanilla / Prism / MultiMC',
    icon: 'cube',
    matchOptions: {
      seeds: {
        RealmsBridge: 'net.minecraft.realms.RealmsBridge',
      },
    },
  },
  lunar_client: {
    id: 'lunar_client',
    name: 'Lunar Client 1.8.9',
    description:
      'Lunar Client repackaged build with custom classloader & anchor heuristics',
    launcher: 'Lunar Client',
    icon: 'moon',
    matchOptions: {
      seeds: {
        RealmsBridge: 'net.minecraft.realms.RealmsBridge',
      },
    },
  },
  badlion_client: {
    id: 'badlion_client',
    name: 'Badlion Client 1.8.9',
    description: 'Badlion Client 1.8.9 with standard Notch obfuscation seeds',
    launcher: 'Badlion Client',
    icon: 'shield',
    matchOptions: {
      seeds: {
        RealmsBridge: 'net.minecraft.realms.RealmsBridge',
      },
    },
  },
  feather_client: {
    id: 'feather_client',
    name: 'Feather Client 1.8.9',
    description: 'Feather Forge/Fabric-based client with Fabric/Forge mappings',
    launcher: 'Feather Client',
    icon: 'feather',
    matchOptions: {
      seeds: {
        RealmsBridge: 'net.minecraft.realms.RealmsBridge',
        Minecraft: 'net.minecraft.client.Minecraft',
      },
    },
  },
  forge_1_8_9: {
    id: 'forge_1_8_9',
    name: 'Minecraft Forge 1.8.9',
    description: 'Forge 1.8.9 modded environment with FML hooks',
    launcher: 'Forge / FML',
    icon: 'hammer',
    matchOptions: {
      seeds: {
        RealmsBridge: 'net.minecraft.realms.RealmsBridge',
      },
    },
  },
  generic_auto: {
    id: 'generic_auto',
    name: 'Generic Auto-Detection',
    description: 'Universal zero-assumption bidirectional graph resolver',
    launcher: 'Universal / Custom',
    icon: 'cpu',
    matchOptions: {},
  },
};

/**
 * Detects the optimal GameProfile by analyzing the window title and process name.
 */
export function detectProfileFromWindow(
  windowTitle: string = '',
  procName: string = '',
): GameProfile {
  const title = windowTitle.toLowerCase();
  const proc = procName.toLowerCase();

  if (title.includes('lunar') || proc.includes('lunar')) {
    return GAME_PROFILES.lunar_client!;
  }
  if (title.includes('badlion') || proc.includes('badlion')) {
    return GAME_PROFILES.badlion_client!;
  }
  if (title.includes('feather') || proc.includes('feather')) {
    return GAME_PROFILES.feather_client!;
  }
  if (title.includes('forge') || proc.includes('forge')) {
    return GAME_PROFILES.forge_1_8_9!;
  }
  if (
    title.includes('1.8.9') ||
    title.includes('minecraft') ||
    proc.includes('java')
  ) {
    return GAME_PROFILES.vanilla_1_8_9!;
  }

  return GAME_PROFILES.generic_auto!;
}
