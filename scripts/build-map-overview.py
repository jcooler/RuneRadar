"""Build technical map overview tiles and an exact asset manifest.

Run from the repository root after changing tiles/2. Requires Pillow.
Each source image covers 64 game squares at zoom 2. A zoom -2 image
combines 16 x 16 source images; positive map y runs upward.
Existing detailed game artwork and attribution are unchanged.
"""
import json
from collections import defaultdict
from pathlib import Path
from PIL import Image

root = Path.cwd() / 'webapp'
source = root / 'tiles' / '2'
output = root / 'tiles' / 'overview'
output.mkdir(parents=True, exist_ok=True)
groups = defaultdict(list)
detail = []
for path in sorted(source.glob('*.png')):
    plane, x, y = map(int, path.stem.split('_'))
    detail.append(path.stem)
    if plane == 0:
        groups[(x // 16, y // 16)].append((path, x % 16, y % 16))

overview = []
for (x, y), entries in sorted(groups.items()):
    canvas = Image.new('RGBA', (256, 256))
    for path, dx, dy in entries:
        with Image.open(path) as tile:
            thumb = tile.convert('RGBA').resize((16, 16), Image.Resampling.LANCZOS)
        canvas.paste(thumb, (dx * 16, (15 - dy) * 16))
    key = f'0_{x}_{y}'
    canvas.save(output / f'{key}.png', optimize=True)
    overview.append(key)

(root / 'tile-manifest.json').write_text(json.dumps({'detail': detail, 'overview': overview}, separators=(',', ':')), encoding='utf-8')
print(f'Indexed {len(detail)} detail tiles; built {len(overview)} overview tiles ({sum((output / (key + ".png")).stat().st_size for key in overview):,} bytes).')
