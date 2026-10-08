# Licenses and attribution

The root BSD 2-Clause license applies to original RuneRadar source code. It does
not relicense third-party libraries, data, game imagery or trademarks.

| Material | Source and terms |
| --- | --- |
| RuneLite API/client | [RuneLite](https://github.com/runelite/runelite), BSD 2-Clause; supplied by RuneLite rather than bundled in the plugin |
| Java-WebSocket 1.5.7 | [Upstream](https://github.com/TooTallNate/Java-WebSocket/tree/v1.5.7), MIT; license included in plugin resources |
| Leaflet 1.9.4 | [Upstream](https://github.com/Leaflet/Leaflet/tree/v1.9.4), BSD 2-Clause; unmodified runtime and license under `webapp/vendor/leaflet`; debug-source comment punctuation normalized |
| Leaflet-MiniMap 3.6.1 | [Upstream](https://github.com/Norkart/Leaflet-MiniMap), BSD 2-Clause; unmodified npm distribution and license under `webapp/vendor/leaflet-minimap` |
| Clue map pointer | RuneLite 1.13.1 `util/clue_arrow.png`, unmodified; BSD notice in `webapp/icons/clue/LICENSE.txt` |
| Clue-scroll item sprite | Jagex game artwork, item 19835, obtained from RuneLite's static item service; source and hash in `webapp/icons/clue/sources.json` |
| Area-name catalogue | Derived from RuneLite's `DiscordGameEventType.java`; original BSD notice retained in `webapp/map-areas.js` |
| OSRS game tiles and sprites | Copyright Jagex Limited. Not covered by this project's software license |
| OSRS Wiki material | [OSRS Wiki](https://oldschool.runescape.wiki/); source rights and attribution must be preserved independently of this project's license |

The separately cloned `osrs-wiki-maps` generator is GPL-3.0 and is not distributed
as part of the plugin or website. Generated game artwork remains Jagex property.

The site includes Jagex's requested fan-content credit and a link to its
[Fan Content Policy](https://legal.jagex.com/docs/policies/fan-content-policy).
Attribution alone is not a grant of rights. Asset provenance and applicability
of that policy remain release-review items; Plugin Hub acceptance is not a
separate license for game artwork.

Browser library file hashes are recorded in `webapp/vendor/manifest.json`.
They were extracted from versioned npm packages after verifying the package
integrity supplied by the registry; these are integrity checks, not an audit
or security endorsement of the upstream packages.
