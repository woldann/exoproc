import { describe, test, expect } from 'bun:test';
import { detectProfileFromWindow } from '../../packages/exoproc/src/config/profiles.js';

describe('exoproc > Profile Heuristics & Window Title Detection', () => {
  test('detects Vanilla 1.8.9 profile from window title', () => {
    const profile = detectProfileFromWindow('Minecraft 1.8.9', 'javaw.exe');
    expect(profile.id).toBe('vanilla_1_8_9');
  });

  test('detects Lunar Client from window title', () => {
    const profile = detectProfileFromWindow(
      'Lunar Client (1.8.9-v1.0)',
      'javaw.exe',
    );
    expect(profile.id).toBe('lunar_client');
  });

  test('detects Badlion Client from window title', () => {
    const profile = detectProfileFromWindow(
      'Badlion Minecraft Client v3.4',
      'javaw.exe',
    );
    expect(profile.id).toBe('badlion_client');
  });

  test('detects Feather Client from window title', () => {
    const profile = detectProfileFromWindow(
      'Feather Client 1.8.9',
      'javaw.exe',
    );
    expect(profile.id).toBe('feather_client');
  });

  test('falls back to generic_auto for unknown titles', () => {
    const profile = detectProfileFromWindow(
      'Custom Title',
      'custom_process.exe',
    );
    expect(profile.id).toBe('generic_auto');
  });
});
