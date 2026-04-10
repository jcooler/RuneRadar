# RuneRadar

A live OSRS world map that tracks your player position in real-time on a second monitor. Built with a RuneLite plugin and a Leaflet-based web app.

## Features

- **Live player tracking** — your position updates on the map as you move in-game
- **Quest Helper integration** — shows quest step waypoints on the map with Go to location button
- **Clue Scroll integration** — shows clue target locations with OSRS clue scroll icon
- **Full OSRS map** — up-to-date tiles from mejrs with OSRS Wiki base layer for ocean coverage
- **POI icons** — 1,945 map icons (banks, quests, dungeons, fishing spots, etc.) from the OSRS Wiki
- **Transport network** — fairy ring codes, spirit trees, and teleport locations with OSRS item icons
- **Town and kingdom labels** — zoom-responsive with configurable font scale
- **Map tools** — search bar, distance measurement, custom pins, path drawing, right-click coordinate copy
- **Minimap** — overview map in the corner
- **Plane switching** — map changes when you go upstairs/downstairs
- **Instance detection** — stays at the entrance when you enter a PoH, raid, or other instance
- **Customizable** — marker color, auto-follow toggle, font scale, layer toggles, all persisted

## Setup

### Prerequisites

- [RuneLite](https://runelite.net/) (via Jagex Launcher)
- [JDK 11+](https://adoptium.net/temurin/releases/) (Eclipse Temurin recommended)
- A web browser

### 1. Cache Jagex credentials (one-time)

1. Open RuneLite via `RuneLite.exe --configure`
2. Add `--insecure-write-credentials` to Client Arguments
3. Launch via Jagex Launcher once, log in, then close RuneLite

### 2. Run the plugin

```bash
cd runelite-plugin
./gradlew run
```

This launches RuneLite in developer mode with RuneRadar loaded. Log in with your cached credentials.

### 3. Open the web app

Open `webapp/index.html` in your browser. The map will connect to the RuneLite plugin via WebSocket on `localhost:37780`.

## Architecture

```
RuneLite Plugin (Java)          Web App (HTML/JS)
┌──────────────────────┐       ┌──────────────────────┐
│ RuneRadarPlugin      │       │ Leaflet map          │
│ - GameTick listener  │ WS    │ - OSRS Wiki tiles    │
│ - Player position    │──────>│ - mejrs tiles        │
│ - Quest Helper bridge│:37780 │ - POI icons          │
│ - Clue Scroll bridge │       │ - Transport markers  │
│ - Instance detection │       │ - Quest/Clue markers  │
└──────────────────────┘       └──────────────────────┘
```

## Project Structure

```
RuneRadar/
├── runelite-plugin/           # Java RuneLite plugin
│   ├── src/main/java/com/runeradar/
│   │   ├── RuneRadarPlugin.java    # Main plugin
│   │   ├── RuneRadarConfig.java    # Settings
│   │   ├── RuneRadarServer.java    # WebSocket server
│   │   ├── PlayerData.java         # Position data model
│   │   ├── QuestHelperBridge.java  # Quest Helper integration
│   │   └── ClueScrollBridge.java   # Clue Scroll integration
│   └── src/test/java/com/runeradar/
│       └── RuneRadarPluginTest.java # Dev launcher
│
└── webapp/                    # Browser map app
    ├── index.html             # UI + styles
    ├── runeradar.js           # Main app + WebSocket client
    ├── map-icons.js           # POI icons + town/kingdom labels
    ├── tools.js               # Search, pins, paths, distance, transports
    └── transport-data.js      # Fairy rings, spirit trees, teleports
```

## Keyboard Shortcuts

- **Space** — snap to player location
- **Escape** — cancel active tool (measure, pin, path)
- **Right-click map** — copy coordinates to clipboard

## License

MIT
