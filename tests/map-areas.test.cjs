const {test} = require('node:test');
const assert = require('node:assert/strict');
const {getArea} = require('../webapp/map-areas.js');

test('named towns, rural regions, and underground areas use RuneLite region IDs', () => {
  assert.equal(getArea(3496,3488), 'Canifis');
  assert.equal(getArea(3222,3218), 'Lumbridge');
  assert.equal(getArea(3550,3400), 'Morytania');
  assert.equal(getArea(3222,9570), 'Lumbridge Swamp Caves');
});
test('unknown and invalid coordinates do not invent a region or wrap to another area', () => {
  for (const [x,y] of [[0,0],[-1,3488],[3496,NaN],[3496.5,3488],[3496,16384],[65536+3496,3488]]) assert.equal(getArea(x,y),null);
});
