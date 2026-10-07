// Verify deployable assets and the declared plugin entry point without network access.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const web = path.join(root, 'webapp');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const localFile = p => {
  assert(!/^(?:[a-z]+:|\/\/)/i.test(p), `Expected a local asset: ${p}`);
  const resolved = path.resolve(web, p);
  assert(resolved.startsWith(web + path.sep), `Asset must stay within webapp: ${p}`);
  assert(fs.statSync(resolved).isFile(), `Missing asset: ${p}`);
  return resolved;
};
const html = read('webapp/index.html');
for (const match of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)) localFile(match[1]);
for (const manifest of ['vendor/manifest.json', 'icons/transport/sources.json']) {
  for (const entry of JSON.parse(read('webapp/' + manifest))) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(localFile(entry.path))).digest('hex');
    assert.equal(hash, entry.sha256, `Changed pinned asset: ${entry.path}`);
  }
}
const tiles = JSON.parse(read('webapp/tile-manifest.json'));
for (const [key, folder] of [['detail', '2'], ['overview', 'overview']]) {
  const expected = new Set(tiles[key]);
  assert.equal(expected.size, tiles[key].length, `Duplicate ${key} tile`);
  for (const tile of expected) {
    assert(/^\d+_\d+_\d+$/.test(tile), `Invalid tile name ${tile}`);
    localFile(`tiles/${folder}/${tile}.png`);
  }
  const actual = fs.readdirSync(path.join(web, 'tiles', folder)).filter(p => p.endsWith('.png')).map(p => p.slice(0, -4));
  assert.equal(actual.length, expected.size, `Regenerate the ${key} manifest after changing tiles`);
}
const icons = JSON.parse(read('webapp/local-icons.json'));
for (const icon of Object.values(icons.icons)) {
  // Verify every game-cache sprite referenced by the bundled catalogue.
  assert.equal(typeof icon.filename, "string");
  localFile(icons.folder + icon.filename);
}
const props = Object.fromEntries(read('runelite-plugin.properties').trim().split(/\r?\n/).map(line => {
  const eq = line.indexOf('='); return [line.slice(0, eq), line.slice(eq + 1)];
}));
for (const field of ['displayName','author','description','plugins','build']) assert(props[field], `Missing ${field}`);
assert.equal(props.build, 'gradle');
assert(fs.existsSync(path.join(root, 'src/main/java', props.plugins.replaceAll('.', '/') + '.java')));
assert.equal(read('runelite-plugin.properties'), read('runelite-plugin/runelite-plugin.properties'), 'Developer and Hub metadata differ');
assert(fs.existsSync(path.join(root, 'LICENSE')));
console.log(`Release assets verified: ${tiles.detail.length} detailed tiles, ${tiles.overview.length} overview tiles, local libraries and plugin metadata.`);
