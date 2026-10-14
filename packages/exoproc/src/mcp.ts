#!/usr/bin/env bun
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { service } from './service.js';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { VERSION } from './version.js';

// Create Model Context Protocol (MCP) Server
const server = new McpServer({
  name: 'exoproc',
  version: VERSION,
});

// Helper to format text response
const textResponse = (data: any) => ({
  content: [
    {
      type: 'text' as const,
      text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
    },
  ],
});

// ==========================================
// Dynamic MCP Resources (minecraft://*)
// ==========================================

// 1. Resource: minecraft://status
server.registerResource(
  'minecraft-status',
  'minecraft://status',
  {
    description:
      'Exoproc connection, Minecraft PID, active GUI screen class, and player presence.',
    mimeType: 'application/json',
  },
  async (uri) => {
    const res = await service.getStatus();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(res || { alive: false }, null, 2),
        },
      ],
    };
  },
);

// 2. Resource: minecraft://player
server.registerResource(
  'minecraft-player',
  'minecraft://player',
  {
    description:
      'Live player telemetry: 3D coordinates (x, y, z), camera rotation (yaw, pitch), health, food, flying, motion.',
    mimeType: 'application/json',
  },
  async (uri) => {
    const res = await service.getPlayer();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(res, null, 2),
        },
      ],
    };
  },
);

// 3. Resource: minecraft://world
server.registerResource(
  'minecraft-world',
  'minecraft://world',
  {
    description:
      'World environment: time of day, rain/thunder status, dimension, and loaded entity counts.',
    mimeType: 'application/json',
  },
  async (uri) => {
    const res = await service.getWorld();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(res, null, 2),
        },
      ],
    };
  },
);

// 4. Resource: minecraft://gui
server.registerResource(
  'minecraft-gui',
  'minecraft://gui',
  {
    description:
      'Active GUI screen, canonical class, in-game flag, and all visible buttons with IDs and labels.',
    mimeType: 'application/json',
  },
  async (uri) => {
    const res = await service.getGui();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(res, null, 2),
        },
      ],
    };
  },
);

// 5. Resource: minecraft://inventory
server.registerResource(
  'minecraft-inventory',
  'minecraft://inventory',
  {
    description:
      'Selected hotbar slot, hotbar item slots, main inventory, and equipped armor.',
    mimeType: 'application/json',
  },
  async (uri) => {
    const res = await service.getInventory();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(res, null, 2),
        },
      ],
    };
  },
);

// 6. Resource: minecraft://mappings
server.registerResource(
  'minecraft-mappings',
  'minecraft://mappings',
  {
    description:
      'Master Minecraft class, field, and method mappings and statistics for the current version.',
    mimeType: 'application/json',
  },
  async (uri) => {
    const res = await service.exportMappings();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(res.data || res, null, 2),
        },
      ],
    };
  },
);

// ==========================================
// MCP Tools (exoproc_* tools)
// ==========================================

function registerTool(
  toolName: string,
  description: string,
  schema: any,
  handler: any,
) {
  (server as any).tool(`exoproc_${toolName}`, description, schema, handler);
}

// 1. Connection & Status
registerTool(
  'status',
  'Get Exoproc daemon/agent connection status, target Minecraft PID, screen, and player state.',
  {},
  async () => {
    try {
      const res = await service.getStatus();
      return textResponse(
        res || { alive: false, message: 'Daemon/Agent is not reachable.' },
      );
    } catch (err: any) {
      return textResponse({ success: false, error: err.message });
    }
  },
);

// 1b. Upgrade to in-process Agent
registerTool(
  'upgrade',
  'Upgrade daemon/target connection to in-process Java Agent by loading .class bytecode into target JVM memory.',
  {
    classPath: z
      .string()
      .optional()
      .describe('Optional absolute path to agent .class bytecode file.'),
    port: z.number().optional().describe('Agent HTTP port (default 43378).'),
    obfuscate: z
      .boolean()
      .optional()
      .describe('Whether to obfuscate agent bytecode with TinyRemapper.'),
  },
  async ({ classPath, port, obfuscate }: any) => {
    try {
      const res = await service.upgrade({ classPath, port, obfuscate });
      return textResponse(res);
    } catch (err: any) {
      return textResponse({ success: false, error: err.message });
    }
  },
);

// 2. World & GUI Navigation (Universal Graph BFS)
registerTool(
  'navigate',
  'Automatically navigate menus using universal GUI graph pathfinding (default target: "InGame", or specify target screen like "GuiScreenOptionsSounds", "GuiOptions", "GuiVideoSettings").',
  {
    target: z
      .string()
      .optional()
      .describe(
        'Target screen to navigate to (e.g. "InGame", "GuiScreenOptionsSounds", "GuiOptions", "GuiVideoSettings"). Default is "InGame".',
      ),
  },
  async ({ target }: any) => {
    try {
      const steps: string[] = [];
      const res = await service.navigate(target || 'InGame', (step) =>
        steps.push(step),
      );
      return textResponse({ ...res, progressSteps: steps });
    } catch (err: any) {
      return textResponse({ success: false, error: err.message });
    }
  },
);

// 2b. GUI Inspection
registerTool(
  'get_gui',
  'Inspect active Minecraft GUI screen, canonical class, real class, and all buttons with IDs and label texts.',
  {},
  async () => {
    try {
      const res = await service.getGui();
      return textResponse(res);
    } catch (err: any) {
      return textResponse({ success: false, error: err.message });
    }
  },
);

// 3. Player Telemetry
registerTool(
  'get_player',
  'Get active player telemetry including exact 3D coordinates (X, Y, Z), camera angles (yaw, pitch), health, food, flying state, and motion.',
  {},
  async () => {
    try {
      const res = await service.getPlayer();
      return textResponse(res);
    } catch (err: any) {
      return textResponse({ success: false, error: err.message });
    }
  },
);

// 4. World State
registerTool(
  'get_world',
  'Get world stats including game time, weather (raining), entity count, dimension ID, and multiplayer status.',
  {},
  async () => {
    try {
      const res = await service.getWorld();
      return textResponse(res);
    } catch (err: any) {
      return textResponse({ success: false, error: err.message });
    }
  },
);

// 5. Target / Crosshair Raytrace
registerTool(
  'get_target',
  'Raytrace player look vector into the world to identify the block or entity currently targeted by the crosshair.',
  {
    reach: z
      .number()
      .optional()
      .describe('Maximum reach distance in blocks (default: 30)'),
  },
  async ({ reach }: any) => {
    try {
      const res = await service.getTarget(reach || 30);
      return textResponse(res);
    } catch (err: any) {
      return textResponse({ success: false, error: err.message });
    }
  },
);

// 6. Nearby Entities Radar
registerTool(
  'get_entities',
  'Scan loaded entities (players, hostile mobs, friendly animals, dropped items) within a radius around the player.',
  {
    radius: z
      .number()
      .optional()
      .describe('Search radius in blocks (default: 64)'),
  },
  async ({ radius }: any) => {
    try {
      const res = await service.getEntities(radius || 64);
      return textResponse(res);
    } catch (err: any) {
      return textResponse({ success: false, error: err.message });
    }
  },
);

// 7. Inventory & Equipment
registerTool(
  'get_inventory',
  'Inspect player inventory: selected hotbar slot (0-8), hotbar item slots, main inventory, and equipped armor.',
  {},
  async () => {
    try {
      const res = await service.getInventory();
      return textResponse(res);
    } catch (err: any) {
      return textResponse({ success: false, error: err.message });
    }
  },
);

// 8. Screenshot (In-memory visual inspection, zero disk write unless outputPath provided)
registerTool(
  'screenshot',
  'Capture live in-game screenshot from Minecraft framebuffer and return the image directly for multimodal visual inspection (HUD, GUI, terrain, mobs). Only specify outputPath if you explicitly need to save the PNG file to disk.',
  {
    outputPath: z
      .string()
      .optional()
      .describe(
        'Optional local file path to save screenshot on disk. Leave empty for in-memory visual inspection only.',
      ),
  },
  async ({ outputPath }: any) => {
    try {
      const shot = await service.fetchScreenshot();
      let savedPath: string | undefined;

      // Only persist to disk if explicitly requested
      if (outputPath) {
        const target = resolve(process.cwd(), outputPath);
        const dir = dirname(target);
        if (!existsSync(dir)) {
          try {
            mkdirSync(dir, { recursive: true });
          } catch {}
        }
        writeFileSync(target, shot.buffer);
        savedPath = target;
      }

      return {
        content: [
          {
            type: 'image' as const,
            data: shot.base64 || shot.buffer.toString('base64'),
            mimeType: 'image/png',
          },
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                savedToDisk: Boolean(savedPath),
                filePath: savedPath,
                width: shot.width,
                height: shot.height,
                size: shot.buffer.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err: any) {
      return textResponse({ success: false, error: err.message });
    }
  },
);

// 9. Chat & Commands
registerTool(
  'chat',
  'Send an in-game chat message or execute a slash command (e.g. "/time set day", "/gamemode creative", "hello world").',
  {
    message: z.string().describe('Message or slash command to send'),
  },
  async ({ message }: any) => {
    try {
      const res = await service.chat(message);
      return textResponse(res);
    } catch (err: any) {
      return textResponse({ success: false, error: err.message });
    }
  },
);

// 10. Camera Orientation
registerTool(
  'look',
  'Set player camera angles (yaw and pitch rotation).',
  {
    yaw: z.number().describe('Horizontal angle (-180 to 180 degrees)'),
    pitch: z.number().describe('Vertical angle (-90 up to 90 down degrees)'),
  },
  async ({ yaw, pitch }: any) => {
    try {
      const res = await service.look(yaw, pitch);
      return textResponse(res);
    } catch (err: any) {
      return textResponse({ success: false, error: err.message });
    }
  },
);

// 11. Physical Player Actions
registerTool(
  'action',
  'Trigger a physical player action in Minecraft (jump, left-click swing/attack, right-click use/interact, or hotbar slot select).',
  {
    action: z
      .enum(['jump', 'attack', 'swing', 'use', 'slot'])
      .describe('The action to perform'),
    slot: z
      .number()
      .optional()
      .describe('Hotbar slot index (0-8) required if action is "slot"'),
  },
  async ({ action, slot }: any) => {
    try {
      if (action === 'jump') return textResponse(await service.jump());
      if (action === 'attack' || action === 'swing')
        return textResponse(await service.attack());
      if (action === 'use') return textResponse(await service.use());
      if (action === 'slot') {
        if (slot === undefined)
          throw new Error('Missing slot index (0-8) for slot action');
        return textResponse(await service.slot(slot));
      }
      throw new Error(`Unsupported action: ${action}`);
    } catch (err: any) {
      return textResponse({ success: false, error: err.message });
    }
  },
);

// 12. Click GUI Button
registerTool(
  'click_button',
  'Click a button on the current Minecraft GUI screen by button ID or text label.',
  {
    selector: z
      .union([z.number(), z.string()])
      .describe('Button ID number or text label (e.g. 1 or "Singleplayer")'),
  },
  async ({ selector }: any) => {
    try {
      const res = await service.click(selector);
      return textResponse(res);
    } catch (err: any) {
      return textResponse({ success: false, error: err.message });
    }
  },
);

// 13. JVM JavaScript Evaluation
registerTool(
  'eval',
  'Evaluate arbitrary JavaScript code inside the running Minecraft JVM using Nashorn scripting engine.',
  {
    code: z.string().describe('JavaScript code to evaluate in JVM'),
  },
  async ({ code }: any) => {
    try {
      const res = await service.evalCode(code);
      return textResponse(res);
    } catch (err: any) {
      return textResponse({ success: false, error: err.message });
    }
  },
);

// 14. GUI Crawler
registerTool(
  'crawl_guis',
  'Automatically navigate and crawl all reachable Minecraft GUI menus, discover their live obfuscated classes, fields, and buttons via JVM reflection, and safely return to gameplay.',
  {
    targets: z
      .array(z.string())
      .optional()
      .describe(
        'Optional list of specific GUI screens to crawl. Defaults to all reachable menus from current screen.',
      ),
  },
  async ({ targets }: any) => {
    try {
      const progress: string[] = [];
      const res = await service.crawl({
        targets,
        onProgress: (step) => progress.push(step),
      });
      return textResponse({ ...res, progress });
    } catch (err: any) {
      return textResponse({ success: false, error: err.message });
    }
  },
);

// 15. Export Mappings (with automated GUI crawl)
registerTool(
  'export_mappings',
  'Export complete mappings JSON by crawling all GUI screens and merging in-memory JVM reflection with canonical schema.',
  {
    profile: z
      .string()
      .optional()
      .describe('Target profile (default: "1.8.9")'),
    crawl: z
      .boolean()
      .optional()
      .describe(
        'Whether to crawl all GUI screens to ensure all menu classes are discovered (default: true)',
      ),
  },
  async ({ profile, crawl }: any) => {
    try {
      const progress: string[] = [];
      const res = await service.exportMappings(profile, {
        crawlGuis: crawl !== false,
        onProgress: (step) => progress.push(step),
      });
      return textResponse({ ...res, progress });
    } catch (err: any) {
      return textResponse({ success: false, error: err.message });
    }
  },
);

// Start MCP server over stdio
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal MCP Server Error:', err);
  process.exit(1);
});
