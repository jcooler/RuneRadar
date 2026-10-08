"""Extract named regions from a reviewed RuneLite DiscordGameEventType.java.

Usage: python scripts/build-map-areas.py path/to/DiscordGameEventType.java
The original BSD license is retained in the generated browser module.
"""
from pathlib import Path
import json
import re
import sys

source = Path(sys.argv[1]).read_text(encoding='utf-8-sig')
license_text = source[:source.index('package net.runelite')].strip()
entries = re.findall(r'\b[A-Z][A-Z_0-9]*\("((?:[^"\\]|\\.)*)"\s*,\s*DiscordAreaType\.[A-Z_]+\s*,\s*([\d,\s]+)\)', source)
assert len(entries) == len(re.findall(r'DiscordAreaType\.[A-Z_]+', source)), 'Unrecognized area definition; review upstream format.'
areas = {}
for name, ids in entries:
    name = json.loads('"' + name + '"')
    for region in re.findall(r'\d+', ids):
        assert region not in areas or areas[region] == name, (region, name, areas[region])
        areas[region] = name
assert len(areas) > 500
module = license_text + '''
// Area names adapted from RuneLite's DiscordGameEventType.java.
// Source: https://github.com/runelite/runelite/blob/master/runelite-client/src/main/java/net/runelite/client/plugins/discord/DiscordGameEventType.java
// Generated with scripts/build-map-areas.py. Uses RuneLite's named 64-square
// regions, not nearest-label guesses. Unknown regions intentionally return null.
// Location lookup stays entirely on device.
(function (root) {
  const areas = ''' + json.dumps(areas, ensure_ascii=False, separators=(',', ':')) + ''';
  function getArea(x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 16383 || y > 16383) return null;
    return areas[((x >> 6) << 8) | (y >> 6)] || null;
  }
  if (typeof module === "object" && module.exports) module.exports = {getArea};
  else root.RuneRadarAreas = {getArea};
})(typeof window === "undefined" ? globalThis : window);
'''
(Path.cwd() / 'webapp/map-areas.js').write_text(module, encoding='utf-8')
print(f'Extracted {len(entries)} named areas covering {len(areas)} regions.')
