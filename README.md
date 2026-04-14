# RuneRadar

A live OSRS world map companion for your second monitor. Install the RuneLite plugin, open the web app, and see your player position, quests, clue scrolls, and friends on a full interactive map.

## Features

- **Live player tracking** - position updates in real-time as you move in-game
- **4,000+ POI icons** - banks, quests, dungeons, fishing spots, mining sites, shops, and more from the game cache
- **270+ location labels** - towns, cities, kingdoms, sailing islands, all wiki-verified
- **Quest Helper integration** - quest waypoints and step text shown on the map
- **Clue Scroll integration** - clue target locations with go-to button
- **Transport networks** - fairy rings with codes, spirit trees, teleports, balloons, canoes, gliders, minecarts
- **Social features** - share your location with friends, clan, and FC members via encrypted relay
- **Map tools** - search, distance measurement, custom pins, path drawing, coordinate copy
- **Themes** - dark, light, and Old School
- **Export/import** - save and share your pins and paths
- **URL sharing** - link directly to any map location

## Getting Started

1. Install the **RuneRadar** plugin in RuneLite
2. Open the web app in your browser
3. Log into OSRS - the map connects automatically

The plugin runs a local WebSocket server on port 37780. The web app connects to it and displays your live position.

## Social Features

Share your location with friends who also have the plugin:

1. Enable **Social Features** in the plugin settings
2. Choose who to share with - Friends List, Clan, or Friends Chat
3. Friends with the plugin see each other on the map automatically

No room codes or setup needed, if you're on each other's friends list in-game and both have sharing enabled, you see each other. All position data is end-to-end encrypted.

## Privacy

- **Opt-in only** - social features are off by default
- **Privacy modes** - share exact location, region only, world only, or appear hidden
- **E2E encrypted** - the relay server cannot read your coordinates
- **No persistence** - nothing is stored to disk, positions cleared on disconnect

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Snap to player |
| F11 | Toggle fullscreen |
| Escape | Cancel active tool |
| Right-click | Copy coordinates |



## License

MIT
