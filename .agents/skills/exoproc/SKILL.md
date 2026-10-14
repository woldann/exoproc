---
name: exoproc
description: >-
  Control, inspect, and automate Minecraft gameplay using the Exoproc HTTP/SSE API, MCP tools, and Linux terminal utilities (chafa, httpie, jq, curl). Use when the user asks to navigate to ANY menu (video settings, sounds, controls, options), enter singleplayer/game world, inspect player/world/inventory/GUI state, take screenshots, execute physical actions, or test Minecraft automation.
---

# Exoproc Minecraft AI Automation Skill

This skill guides AI agents on interacting with, monitoring, and controlling live Minecraft (1.8.9) instances via the Exoproc instrumentation engine.

Exoproc operates as a high-performance **HTTP & Server-Sent Events (SSE) API server** (running on `http://127.0.0.1:43370`) and an **MCP Server** (`exoproc_*` tools and `minecraft://*` resources).

---

## 1. Quick Start & Server Liveness

Before issuing gameplay commands, verify that the Exoproc API server is active:

```bash
# Check API server status
curl -s http://127.0.0.1:43370/status | jq

# If the server is not running, launch it in the background:
bun run --cwd packages/exoproc dist/cli.js serve --port 43370 &
```

> [!NOTE]
> The server directly communicates with the in-game Java Agent or native daemon without touching files on disk or restarting the JVM.

---

## 2. Universal Menu & GUI Navigation (`/navigate`)

Exoproc features an autonomous graph-based pathfinder powered by `gui-navigation.json`. It can navigate from **ANY screen to ANY screen** (or into the game) automatically in a single call.

> [!IMPORTANT]
> **NEVER manually inspect internal obfuscation classes or write custom `eval` scripts to navigate menus!**
> Always use `navigate` with the `target` parameter. The graph engine automatically calculates the shortest path, handles obfuscated classes via the mapping pool, clicks intermediate buttons, and executes transitions.

### Common Navigation Targets:

- **Video Settings:** `target="video"` or `target="GuiVideoSettings"`
- **Music & Sound Options:** `target="sounds"` or `target="GuiScreenOptionsSounds"`
- **Controls / Keybindings:** `target="controls"` or `target="GuiControls"`
- **Main Options Menu:** `target="options"` or `target="GuiOptions"`
- **Skin Customization:** `target="skin"` or `target="GuiCustomizeSkin"`
- **Singleplayer / In-Game World (Default):** `target="InGame"` (bypasses pause menu, main menu, select world, and death screen)

### CLI & HTTP Recipes:

```bash
# Navigate to Video Settings:
http POST http://127.0.0.1:43370/navigate target=video
# Or using the exoproc-tool CLI:
bun run --cwd packages/exoproc dist/cli.js navigate video

# Navigate to Music & Sounds:
http POST http://127.0.0.1:43370/navigate target=sounds
# Or CLI:
bun run --cwd packages/exoproc dist/cli.js navigate sounds

# Navigate to Controls:
http POST http://127.0.0.1:43370/navigate target=controls

# Return to live gameplay (default target: InGame):
bun run --cwd packages/exoproc dist/cli.js navigate
# Or with real-time SSE progress streaming:
http --stream -b http://127.0.0.1:43370/navigate Accept:text/event-stream
```

---

## 3. Automated GUI Crawling & Dynamic Mapping Discovery

Exoproc includes an autonomous GUI crawler (`GuiCrawler`) that traverses every reachable menu screen using graph-based pathfinding (`gui-navigation.json`). This ensures lazy-loaded Minecraft menu classes (`GuiVideoSettings`, `GuiScreenOptionsSounds`, `GuiControls`, `GuiLanguage`, `GuiCustomizeSkin`, etc.) are actively instantiated and loaded into JVM memory.

### CLI & HTTP Recipes:

```bash
# 1. Crawl all reachable GUI menus, discover live JVM reflection data, and safely return to gameplay:
bun run tool:crawl
# Or via HTTP with real-time SSE streaming progress:
http --stream -b http://127.0.0.1:43370/crawl Accept:text/event-stream

# 2. Export complete version mappings (automatically crawls GUIs to guarantee 100% menu coverage):
bun run tool:export-mappings
# Or via HTTP:
http POST http://127.0.0.1:43370/mappings/export
```

---

## 4. Linux Terminal Recipes (CLI Combinations)

### A. Live Terminal Screenshots via Chafa

Capture the Minecraft framebuffer in memory and render it immediately inside the terminal:

```bash
# Render ASCII/ANSI preview in terminal:
http http://127.0.0.1:43370/screenshot | chafa --size 60x30 -

# Download directly to disk without server-side file creation:
http --download -b http://127.0.0.1:43370/screenshot -o screenshot.png
```

### B. Player Telemetry & Coordinates

Extract 3D position, camera rotation, flying mode, and health:

```bash
# Full telemetry
curl -s http://127.0.0.1:43370/player | jq

# Filter exact X, Y, Z coords:
curl -s http://127.0.0.1:43370/player | jq .coords
```

### C. Active GUI & Button Inspection

Inspect currently open screen and buttons with automatic simpleName resolution:

```bash
curl -s http://127.0.0.1:43370/gui | jq '{screenName, simpleName, buttons}'
```

### D. Crosshair Raytracing (Targeted Block / Entity)

Determine what block or mob the player is currently aiming at:

```bash
curl -s "http://127.0.0.1:43370/target?reach=20" | jq
```

### E. Entity Radar (Loaded Mobs, Animals, Items)

Scan nearby entities sorted by 3D Euclidean distance:

```bash
curl -s "http://127.0.0.1:43370/entities?radius=48" | jq '.entities[] | {name, distance, health, coords}'
```

### F. Inventory & Hotbar Inspection

Check active hotbar slots and equipped armor:

```bash
curl -s http://127.0.0.1:43370/inventory | jq
```

### G. Chat Messages & Slash Commands

Send in-game text or administrator commands:

```bash
# Day time
http POST http://127.0.0.1:43370/chat message="/time set day"

# Creative mode
http POST http://127.0.0.1:43370/chat message="/gamemode creative"
```

### H. Physical Controls & Actions

Simulate physical key and mouse events:

```bash
# Jump
http POST http://127.0.0.1:43370/jump

# Attack / Left-click swing
http POST http://127.0.0.1:43370/attack

# Use / Right-click interact / place block
http POST http://127.0.0.1:43370/use

# Select hotbar slot (0 to 8)
http POST http://127.0.0.1:43370/slot slot:=0

# Rotate camera (yaw, pitch)
http POST http://127.0.0.1:43370/look yaw:=-90 pitch:=0
```

---

## 4. Model Context Protocol (MCP) Reference

When using Antigravity or MCP clients, invoke these tools and resources:

### Native MCP Tools (`exoproc_*`)

| Tool Name               | Purpose                                                                                                                                                                                                |
| :---------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exoproc_navigate`      | **Universal GUI & World Navigator:** Navigates from ANY screen to ANY target (`target="video"`, `target="sounds"`, `target="controls"`, `target="options"`, `target="InGame"`). Default is `"InGame"`. |
| `exoproc_status`        | Connection health, Minecraft PID, and active screen state.                                                                                                                                             |
| `exoproc_get_gui`       | Active GUI screen name, auto-detected `simpleName`, and button list.                                                                                                                                   |
| `exoproc_get_player`    | Exact 3D coordinates, orientation, health, motion, and flying state.                                                                                                                                   |
| `exoproc_get_world`     | World time, weather, loaded entity counts, dimension.                                                                                                                                                  |
| `exoproc_get_target`    | Crosshair raytracing for aimed block or mob (`reach` parameter).                                                                                                                                       |
| `exoproc_get_entities`  | Radar scan of nearby mobs, animals, and items (`radius` parameter).                                                                                                                                    |
| `exoproc_get_inventory` | Hotbar slots, inventory storage, and armor pieces.                                                                                                                                                     |
| `exoproc_screenshot`    | In-memory capture returned directly for visual perception (zero disk write unless `outputPath` provided).                                                                                              |
| `exoproc_chat`          | Sends chat text or slash commands (`/time set day`).                                                                                                                                                   |
| `exoproc_look`          | Sets yaw and pitch camera angles.                                                                                                                                                                      |
| `exoproc_action`        | Performs physical action (`jump`, `attack`/`swing`, `use`, `slot`).                                                                                                                                    |
| `exoproc_click_button`  | Clicks GUI button by ID or text label.                                                                                                                                                                 |
| `exoproc_eval`          | Evaluates arbitrary Nashorn JavaScript in the Minecraft JVM.                                                                                                                                           |

### Dynamic MCP Resources

| Resource URI            | Content                                      |
| :---------------------- | :------------------------------------------- |
| `minecraft://status`    | Real-time connection status and PID.         |
| `minecraft://player`    | Live player coordinates, angles, and health. |
| `minecraft://world`     | Dimension, weather, and world time.          |
| `minecraft://gui`       | Current GUI and button catalog.              |
| `minecraft://inventory` | Hotbar, inventory, and armor slots.          |

---

## 5. Autonomous Exploration Loop

When writing an agent loop to play Minecraft autonomously:

1. **Perceive**: Call `exoproc_get_player` and `exoproc_get_target` to check position and line of sight.
2. **Scan**: Call `exoproc_get_entities` to detect nearby threats (Creeper, Skeleton) or resources (Cows, Trees).
3. **Visualize**: Call `exoproc_screenshot` for direct multimodal image inspection without writing to disk, or stream to chafa (`http .../screenshot | chafa -`) in the terminal.
4. **Decide & Act**: Rotate with `exoproc_look`, jump with `exoproc_action(action="jump")`, or interact with `exoproc_action(action="use")`.
