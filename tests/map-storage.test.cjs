const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../webapp/map-storage.js'), 'utf8');
function load(storage) {
  const window = {dispatchEvent() {}};
  Object.defineProperty(window, 'localStorage', {get: storage});
  return vm.runInNewContext(source + '\nMapStorage', {window, Event: class {}});
}
test('blocked browser storage leaves preferences and drawings usable for this tab', () => {
  const map = load(() => { throw new Error('Storage denied'); });
  assert.equal(map.getItem('runeradar-theme'), null);
  assert.equal(map.persistent, false);
  map.setItem('runeradar-theme', 'light');
  assert.equal(map.getItem('runeradar-theme'), 'light');
  map.setItem('runeradar-pins', JSON.stringify([{x:3222,y:3218,note:'Home'}]));
  assert.equal(map.drawings('pins')[0].note, 'Home');
  map.removeItem('runeradar-pins');
  assert.equal(map.drawings('pins').length, 0);
});
test('malformed saved drawings do not break the map or discard valid neighboring entries', () => {
  const values = new Map();
  const map = load(() => ({getItem:k=>values.get(k)??null, setItem:(k,v)=>values.set(k,v), removeItem:k=>values.delete(k)}));
  for (const value of ['broken', '{}', 'null']) {
    values.set('runeradar-pins', value);
    assert.equal(map.drawings('pins').length, 0);
  }
  values.set('runeradar-pins', '[null,{"x":"bad","y":1},{"x":2,"y":3,"note":"Keep me"}]');
  assert.equal(map.drawings('pins').length, 1);
  values.set('runeradar-paths', '[null,[],[{"x":2,"y":3},null],[{"x":2,"y":3},{"x":4,"y":5}]]');
  assert.equal(map.drawings('paths').length, 1);
  assert.equal(map.persistent, true);
});
test('a quota failure keeps the newest drawing in tab memory for export', () => {
  const map = load(() => ({getItem:()=>null, setItem:()=>{throw new Error('Quota');}}));
  map.setItem('runeradar-pins', '[{"x":2,"y":3}]');
  assert.equal(map.persistent, false);
  assert.equal(map.drawings('pins').length, 1);
});
