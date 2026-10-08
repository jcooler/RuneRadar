# RuneRadar

A personal Old School RuneScape map for your browser, connected to RuneLite on
the same computer. RuneRadar is in development and is not yet available from
the Plugin Hub.

## Features

- Live player location with a close initial view.
- Ground-map context while upstairs, with an Upstairs marker label and optional
  upper-floor layouts in map settings. Supported caves and dungeons retain
  their own map locations.
- Account name, world, nearby area, HP, prayer and run energy.
- Search, map layers, transport locations and named raid entrances.
- Free browsing while the player marker keeps updating. Use the navigation
  arrow or Space to return to your location and resume following.
- Optional clue instructions and supported target markers from RuneLite's
  Clue Scroll plugin, with RuneLite clue icons and destination details on hover
  or tap. Upstairs clues mark the building on the ground map. Clue assistance
  starts off.
- Local pins, paths, distance measurement, import and export.
- Dark, light and Old School themes.

## Run locally

Requirements: Java 11, Python 3, and Node 18 or newer for verification.

1. Serve the map from the repository root:
   `python -m http.server 8000 --bind 127.0.0.1 --directory webapp`.
2. Start the development client: `./gradlew.bat run` on Windows or
   `./gradlew run` on macOS/Linux.
3. Enable RuneRadar and **Use local development map** in its RuneLite settings.
4. Click **Open RuneRadar** in its sidebar. Allow local-network access if your
   browser requests it, then log into the game.
5. For clue assistance, enable RuneLite's **Clue Scroll** plugin and RuneRadar's
   **Show clue assistance** setting, then read a clue in game.

Search or move the map to browse freely. Click the navigation arrow to follow
again. After refreshing the browser, use **Open RuneRadar** to reconnect.
For multiple clients, choose a different local connection port for each.

The regular plugin setting opens [runeradar.app](https://runeradar.app).
Local changes do not update that website. The map is static and can be hosted
on GitHub Pages; live player data does not require a hosted relay.

## Current limitations

- Browser and RuneLite must run on the same computer.
- Player location is hidden in instanced areas, including player-owned houses.
  Account details and enabled helper destinations keep updating there.
- Clue coverage still needs in-game validation. Some clues provide instructions
  without a map target; equipment, combat and puzzle overlays stay in RuneLite.
- Quest step sharing is experimental and does not work with the current
  Plugin Hub version of Quest Helper.

## Privacy

Opening the map pairs a browser tab using a one-use link that expires after
one minute. The plugin sends your own location and account details directly to
that tab over a local connection. Clue details are sent only when enabled.
Disconnecting, replacing the pairing, or disabling the plugin revokes access.
Live game data and pairing credentials are not saved in browser storage.

The static website host receives normal asset requests, including tiles that
can indicate the area being viewed. See [Privacy](webapp/privacy.html) and
[Help](webapp/help.html) for connection and storage details.

## Verification

```text
./gradlew.bat test jar --no-daemon -PruneLiteVersion=1.13.1
node --test tests/connection.test.cjs tests/map-areas.test.cjs tests/map-storage.test.cjs
node scripts/check-source.cjs
node scripts/check-release.cjs
```

Use `./gradlew` outside Windows. Plugin code is in `src/main`; automated tests
are in `src/test` and `tests`. The nested `runelite-plugin` launcher uses the
same source files.

## License

Original code is licensed under [BSD 2-Clause](LICENSE). Third-party libraries,
data and game artwork retain their own rights. See [NOTICE.md](NOTICE.md).
