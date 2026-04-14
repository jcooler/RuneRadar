#!/usr/bin/env node
/**
 * convert-cache.js
 *
 * Converts minimapIcons.json (raw cache export) + sprite-mapping.json
 * into cache-icons.json (GeoJSON FeatureCollection) for the webapp.
 *
 * Usage: node scripts/convert-cache.js [path-to-minimapIcons.json]
 *
 * If no path is given, uses the latest version in osrs-wiki-maps/out/mapgen/versions/
 */

const fs = require('fs');
const path = require('path');

// ── Resolve input file ──
let minimapPath = process.argv[2];
if (!minimapPath) {
  const versionsDir = path.join(__dirname, '..', 'osrs-wiki-maps', 'out', 'mapgen', 'versions');
  if (!fs.existsSync(versionsDir)) {
    console.error('Error: No osrs-wiki-maps/out/mapgen/versions/ directory found.');
    console.error('Run the MapExport pipeline first, or pass a path to minimapIcons.json.');
    process.exit(1);
  }
  const versions = fs.readdirSync(versionsDir).sort().reverse();
  if (versions.length === 0) {
    console.error('Error: No version directories found.');
    process.exit(1);
  }
  minimapPath = path.join(versionsDir, versions[0], 'minimapIcons.json');
  console.log(`Using latest version: ${versions[0]}`);
}

if (!fs.existsSync(minimapPath)) {
  console.error(`Error: ${minimapPath} not found.`);
  process.exit(1);
}

// ── Load data ──
const minimapIcons = JSON.parse(fs.readFileSync(minimapPath, 'utf8'));
const spriteMapping = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'out', 'sprite-mapping.json'), 'utf8')
);

console.log(`Loaded ${minimapIcons.length} minimap icons`);
console.log(`Loaded ${Object.keys(spriteMapping).length} sprite mappings`);

// ── Convert to GeoJSON ──
const features = [];
const stats = { mapped: 0, unmapped: 0, byType: {} };
const unmappedSprites = {};

for (const icon of minimapIcons) {
  const { position, spriteId } = icon;
  const iconName = spriteMapping[String(spriteId)];

  if (!iconName) {
    unmappedSprites[spriteId] = (unmappedSprites[spriteId] || 0) + 1;
    stats.unmapped++;
    continue;
  }

  stats.mapped++;
  stats.byType[iconName] = (stats.byType[iconName] || 0) + 1;

  features.push({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [position.x, position.y, position.z]
    },
    properties: {
      icon: iconName,
      mapID: 0,
      providerID: 1
    }
  });
}

const geojson = {
  type: "FeatureCollection",
  features
};

// ── Write output ──
const outputPath = path.join(__dirname, '..', 'webapp', 'cache-icons.json');
fs.writeFileSync(outputPath, JSON.stringify(geojson));
console.log(`\nWrote ${features.length} features to ${outputPath}`);

// ── Report ──
console.log(`\n=== Conversion Report ===`);
console.log(`Total input:     ${minimapIcons.length}`);
console.log(`Mapped:          ${stats.mapped}`);
console.log(`Unmapped:        ${stats.unmapped}`);
console.log(`Icon types:      ${Object.keys(stats.byType).length}`);

if (Object.keys(unmappedSprites).length > 0) {
  console.log(`\nUnmapped sprite IDs:`);
  for (const [id, count] of Object.entries(unmappedSprites).sort((a, b) => b[1] - a[1])) {
    console.log(`  spriteId ${id}: ${count} occurrences`);
  }
}

// Sort by count descending
const sorted = Object.entries(stats.byType).sort((a, b) => b[1] - a[1]);
console.log(`\nIcon type breakdown:`);
for (const [type, count] of sorted) {
  console.log(`  ${type}: ${count}`);
}
