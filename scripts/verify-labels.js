#!/usr/bin/env node
/**
 * verify-labels.js
 *
 * Checks every TOWN_LABELS and KINGDOM_LABELS entry against icon density
 * in cache-icons.json. A label sitting in empty space (no nearby icons)
 * is suspicious — it may be misplaced or on the wrong coordinates.
 *
 * For each label, counts cache icons within several radii and flags:
 *   - RED:    0 icons within 30 tiles (likely misplaced or wrong coords)
 *   - YELLOW: 0 icons within 15 tiles but some within 30 (edge of a location)
 *   - GREEN:  icons within 15 tiles (looks correctly placed)
 *
 * Also detects labels that are too close to each other (potential overlaps).
 */

const fs = require('fs');
const path = require('path');

// ── Load cache icons ──
const cacheIcons = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'webapp', 'cache-icons.json'), 'utf8')
);

// ── Extract labels from map-icons.js ──
const mapIconsSrc = fs.readFileSync(
  path.join(__dirname, '..', 'webapp', 'map-icons.js'), 'utf8'
);

function extractArray(src, varName) {
  // Match the array contents between [ and ];
  const regex = new RegExp(`const ${varName}\\s*=\\s*\\[([\\s\\S]*?)\\];`);
  const match = src.match(regex);
  if (!match) throw new Error(`Could not find ${varName} in map-icons.js`);

  const entries = [];
  const entryRegex = /\{\s*name:\s*"([^"]+)"\s*,\s*x:\s*(\d+)\s*,\s*y:\s*(\d+)\s*,\s*size:\s*(\d+)\s*\}/g;
  let m;
  while ((m = entryRegex.exec(match[1])) !== null) {
    entries.push({ name: m[1], x: parseInt(m[2]), y: parseInt(m[3]), size: parseInt(m[4]) });
  }
  return entries;
}

const townLabels = extractArray(mapIconsSrc, 'TOWN_LABELS');
const kingdomLabels = extractArray(mapIconsSrc, 'KINGDOM_LABELS');
const allLabels = [
  ...kingdomLabels.map(l => ({ ...l, type: 'KINGDOM' })),
  ...townLabels.map(l => ({ ...l, type: 'TOWN' })),
];

console.log(`Loaded ${allLabels.length} labels (${kingdomLabels.length} kingdoms, ${townLabels.length} towns)`);
console.log(`Loaded ${cacheIcons.features.length} cache icons\n`);

// ── Build spatial index for fast radius queries ──
// Bucket icons into 32x32 tile cells
const CELL_SIZE = 32;
const iconGrid = new Map();

for (const feature of cacheIcons.features) {
  const [x, y, plane] = feature.geometry.coordinates;
  if (plane !== 0) continue; // only surface-level icons
  const key = `${Math.floor(x / CELL_SIZE)},${Math.floor(y / CELL_SIZE)}`;
  if (!iconGrid.has(key)) iconGrid.set(key, []);
  iconGrid.get(key).push({ x, y, icon: feature.properties.icon });
}

function countIconsInRadius(cx, cy, radius) {
  const minCellX = Math.floor((cx - radius) / CELL_SIZE);
  const maxCellX = Math.floor((cx + radius) / CELL_SIZE);
  const minCellY = Math.floor((cy - radius) / CELL_SIZE);
  const maxCellY = Math.floor((cy + radius) / CELL_SIZE);
  const r2 = radius * radius;

  let count = 0;
  const iconTypes = {};

  for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
    for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
      const cell = iconGrid.get(`${cellX},${cellY}`);
      if (!cell) continue;
      for (const icon of cell) {
        const dx = icon.x - cx;
        const dy = icon.y - cy;
        if (dx * dx + dy * dy <= r2) {
          count++;
          iconTypes[icon.icon] = (iconTypes[icon.icon] || 0) + 1;
        }
      }
    }
  }
  return { count, iconTypes };
}

// ── Also count ALL icons (including underground) for underground labels ──
const allIconGrid = new Map();
for (const feature of cacheIcons.features) {
  const [x, y] = feature.geometry.coordinates;
  const key = `${Math.floor(x / CELL_SIZE)},${Math.floor(y / CELL_SIZE)}`;
  if (!allIconGrid.has(key)) allIconGrid.set(key, []);
  allIconGrid.get(key).push({ x, y, icon: feature.properties.icon });
}

function countAllIconsInRadius(cx, cy, radius) {
  const minCellX = Math.floor((cx - radius) / CELL_SIZE);
  const maxCellX = Math.floor((cx + radius) / CELL_SIZE);
  const minCellY = Math.floor((cy - radius) / CELL_SIZE);
  const maxCellY = Math.floor((cy + radius) / CELL_SIZE);
  const r2 = radius * radius;
  let count = 0;
  for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
    for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
      const cell = allIconGrid.get(`${cellX},${cellY}`);
      if (!cell) continue;
      for (const icon of cell) {
        const dx = icon.x - cx;
        const dy = icon.y - cy;
        if (dx * dx + dy * dy <= r2) count++;
      }
    }
  }
  return count;
}

// ── Check each label ──
const CLOSE_RADIUS = 15;
const MEDIUM_RADIUS = 30;
const WIDE_RADIUS = 50;

const results = { red: [], yellow: [], green: [] };

for (const label of allLabels) {
  const close = countIconsInRadius(label.x, label.y, CLOSE_RADIUS);
  const medium = countIconsInRadius(label.x, label.y, MEDIUM_RADIUS);
  const wide = countIconsInRadius(label.x, label.y, WIDE_RADIUS);

  // For underground/instance labels (y > 4000 or y > 9000), also check all planes
  const isUnderground = label.y > 4000;
  let allPlanesClose = 0;
  if (isUnderground && close.count === 0) {
    allPlanesClose = countAllIconsInRadius(label.x, label.y, CLOSE_RADIUS);
  }

  const entry = {
    ...label,
    icons15: close.count,
    icons30: medium.count,
    icons50: wide.count,
    nearbyTypes: close.count > 0 ? close.iconTypes : medium.iconTypes,
    isUnderground,
    allPlanesClose,
  };

  if (close.count === 0 && medium.count === 0) {
    // No icons within 30 tiles — check wider radius
    if (wide.count === 0 && !isUnderground) {
      entry.severity = 'RED';
      entry.reason = 'No cache icons within 50 tiles on surface plane';
    } else if (wide.count === 0 && isUnderground) {
      if (allPlanesClose > 0) {
        entry.severity = 'GREEN';
        entry.reason = `Underground location — ${allPlanesClose} icons on other planes within 15 tiles`;
      } else {
        entry.severity = 'YELLOW';
        entry.reason = 'Underground/instance location — no surface icons (expected)';
      }
    } else {
      entry.severity = 'YELLOW';
      entry.reason = `No icons within 30 tiles, but ${wide.count} within 50 (might be offset)`;
    }
    results[entry.severity === 'RED' ? 'red' : entry.severity === 'YELLOW' ? 'yellow' : 'green'].push(entry);
  } else if (close.count === 0) {
    entry.severity = 'YELLOW';
    entry.reason = `No icons within 15 tiles, ${medium.count} within 30 (edge of location?)`;
    results.yellow.push(entry);
  } else {
    entry.severity = 'GREEN';
    entry.reason = `${close.count} icons within 15 tiles`;
    results.green.push(entry);
  }
}

// ── Detect overlapping labels ──
const overlaps = [];
for (let i = 0; i < allLabels.length; i++) {
  for (let j = i + 1; j < allLabels.length; j++) {
    const a = allLabels[i], b = allLabels[j];
    const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    if (dist < 20) {
      overlaps.push({ a: a.name, b: b.name, dist: Math.round(dist), ax: a.x, ay: a.y, bx: b.x, by: b.y });
    }
  }
}

// ── Output results ──
console.log('═══════════════════════════════════════════════════════════');
console.log(' RED FLAGS — Labels likely misplaced (no icons within 50 tiles)');
console.log('═══════════════════════════════════════════════════════════');
if (results.red.length === 0) {
  console.log('  (none)\n');
} else {
  for (const r of results.red) {
    console.log(`  ✗ ${r.name} (${r.type}) @ (${r.x}, ${r.y})`);
    console.log(`    → ${r.reason}`);
  }
  console.log();
}

console.log('═══════════════════════════════════════════════════════════');
console.log(' YELLOW FLAGS — Labels worth checking');
console.log('═══════════════════════════════════════════════════════════');
if (results.yellow.length === 0) {
  console.log('  (none)\n');
} else {
  for (const r of results.yellow) {
    console.log(`  ? ${r.name} (${r.type}) @ (${r.x}, ${r.y})`);
    console.log(`    → ${r.reason}`);
    if (Object.keys(r.nearbyTypes).length > 0) {
      console.log(`    Nearby icons: ${JSON.stringify(r.nearbyTypes)}`);
    }
  }
  console.log();
}

console.log('═══════════════════════════════════════════════════════════');
console.log(` GREEN — ${results.green.length} labels look correctly placed`);
console.log('═══════════════════════════════════════════════════════════');
// Show green ones with fewest nearby icons (most marginal)
const marginalGreens = results.green
  .filter(r => r.icons15 <= 2)
  .sort((a, b) => a.icons15 - b.icons15);
if (marginalGreens.length > 0) {
  console.log('  Marginal greens (only 1-2 icons within 15 tiles):');
  for (const r of marginalGreens) {
    console.log(`    ~ ${r.name} @ (${r.x}, ${r.y}) — ${r.icons15} icons within 15 tiles`);
  }
}
console.log();

if (overlaps.length > 0) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' OVERLAPPING LABELS (< 20 tiles apart)');
  console.log('═══════════════════════════════════════════════════════════');
  for (const o of overlaps) {
    console.log(`  ⚠ "${o.a}" & "${o.b}" — ${o.dist} tiles apart`);
    console.log(`    (${o.ax},${o.ay}) vs (${o.bx},${o.by})`);
  }
  console.log();
}

// ── Summary ──
console.log('═══════════════════════════════════════════════════════════');
console.log(' SUMMARY');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  Total labels:  ${allLabels.length}`);
console.log(`  GREEN:         ${results.green.length}`);
console.log(`  YELLOW:        ${results.yellow.length}`);
console.log(`  RED:           ${results.red.length}`);
console.log(`  Overlaps:      ${overlaps.length}`);
