import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { loadAgentMappingPool } from 'exoproc/remote';
import { MinecraftMatcher } from '@woldann/exoproc-minecraft';

describe('exoproc-tool > pool preloading and Minecraft mappings reuse', () => {
  const tmpMappingPath = resolve(process.cwd(), 'tmp-test-mappings.json');

  it('loads pool from JSON mappings and skips reflection scanner in MinecraftMatcher', async () => {
    const dummyMappings = {
      classes: {
        'net.minecraft.client.Minecraft': {
          canonical: 'net.minecraft.client.Minecraft',
          simpleName: 'Minecraft',
          superclass: 'Object',
          obf: 'ave',
          fields: {
            theMinecraft: 'S',
            thePlayer: 'h',
            theWorld: 'f',
          },
          methods: {
            getMinecraft: 'A',
          },
        },
        'net.minecraft.client.entity.EntityPlayerSP': {
          canonical: 'net.minecraft.client.entity.EntityPlayerSP',
          simpleName: 'EntityPlayerSP',
          superclass: 'EntityPlayer',
          obf: 'bew',
          fields: {
            movementInput: 'b',
          },
          methods: {
            sendChatMessage: 'e',
          },
        },
      },
    };

    writeFileSync(
      tmpMappingPath,
      JSON.stringify(dummyMappings, null, 2),
      'utf8',
    );

    try {
      // 1. Load pool from file
      const pool = loadAgentMappingPool(tmpMappingPath);
      expect(pool).toBeDefined();

      // 2. Verify pool resolution
      expect(pool.resolveClass('net.minecraft.client.Minecraft')).toBe('ave');
      expect(pool.resolveClass('EntityPlayerSP')).toBe('bew');
      expect(
        pool.resolveField('net.minecraft.client.Minecraft', 'thePlayer'),
      ).toBe('h');

      // 3. Verify MinecraftMatcher extracts mappingsFromPool
      const mcMappings = MinecraftMatcher.mappingsFromPool(pool);
      expect(mcMappings).not.toBeNull();
      expect(mcMappings?.Minecraft.realClassName).toBe('ave');
      expect(mcMappings?.Minecraft.fields.thePlayer).toBe('h');
      expect(mcMappings?.EntityPlayerSP.realClassName).toBe('bew');
      expect(mcMappings?.EntityPlayerSP.fields.movementInput).toBe('b');
    } finally {
      if (existsSync(tmpMappingPath)) {
        unlinkSync(tmpMappingPath);
      }
    }
  });

  it('supports nested data.classes format exported by tool export-mappings', async () => {
    const nestedDataMappings = {
      success: true,
      profile: '1.8.9',
      data: {
        classes: {
          'net.minecraft.client.Minecraft': {
            canonical: 'net.minecraft.client.Minecraft',
            obf: 'ave',
            fields: { theMinecraft: { type: 'Minecraft', obf: 'S' } },
            methods: { getMinecraft: { obf: 'A' } },
          },
        },
      },
    };

    writeFileSync(
      tmpMappingPath,
      JSON.stringify(nestedDataMappings, null, 2),
      'utf8',
    );

    try {
      const pool = loadAgentMappingPool(tmpMappingPath);
      expect(pool.resolveClass('net.minecraft.client.Minecraft')).toBe('ave');
      expect(
        pool.resolveField('net.minecraft.client.Minecraft', 'theMinecraft'),
      ).toBe('S');
    } finally {
      if (existsSync(tmpMappingPath)) {
        unlinkSync(tmpMappingPath);
      }
    }
  });
});
