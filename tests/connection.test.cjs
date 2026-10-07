const test = require('node:test');
const assert = require('node:assert/strict');
const {consumeLaunch, createConnection} = require('../webapp/connection.js');
const token = 'a'.repeat(43);
const resume = 'b'.repeat(43);

function fixture(launch = {credential: token, port: 37780}) {
  const sockets = [], positions = [], states = [], timers = new Map();
  let clears = 0, time = 0, id = 0;
  class Socket {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.readyState = 3; }
    open() { this.readyState = 1; this.onopen(); }
    message(value) { this.onmessage({data: JSON.stringify(value)}); }
    end(code = 1006) { this.readyState = 3; this.onclose({code}); }
  }
  const connection = createConnection({launch, WebSocketClass: Socket, now: () => time,
    setTimer: (fn, delay) => { timers.set(++id, {fn, at: time + delay}); return id; },
    clearTimer: id => timers.delete(id),
    onState: state => states.push(state), onPosition: value => positions.push(value), onClear: () => clears++});
  return {connection, sockets, positions, states, timers, get clears() { return clears; },
    advance(ms) { time += ms; for (const [id, timer] of [...timers]) if(timer.at <= time) { timers.delete(id); timer.fn(); } }};
}
const accepted = {version: 1, type: 'authenticated', credential: resume};
const snapshot = (sequence = 1, extra = {}) => ({version: 1, type: 'snapshot', session: 'game-session', sequence,
  timestamp: 1000, availability: 'available', position: {x: 3222, y: 3218, plane: 0}, ...extra});

test('consume and erase launch fragment before the map runs; retain map hash', () => {
  const location = {pathname: '/', search: '?example=1', hash: '#pair='+token+'&port=37780&x=100&y=200'};
  let replaced;
  const launch = consumeLaunch(location, {replaceState: (...args) => replaced = args[2]});
  assert.deepEqual(launch, {credential: token, port: 37780});
  assert.equal(replaced, '/?example=1#x=100&y=200');
  assert.equal(consumeLaunch({...location, hash: '#pair=bad&port=90000'}, {replaceState() {}}), null);
  assert.equal(consumeLaunch({...location, hash: '#pair='+token+'&pair='+token}, {replaceState() {}}), null);
});
test('ordinary map visit makes no connection or polling timers', () => {
  const f = fixture(null);
  f.connection.start();
  assert.equal(f.sockets.length, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.states.at(-1), 'static');
});
test('authenticated snapshot only; no premature connected marker', () => {
  const f = fixture(); f.connection.start();
  const socket = f.sockets[0]; socket.open();
  assert.deepEqual(socket.sent[0], {type: 'authenticate', version: 1, mode: 'pair', credential: token});
  assert.ok(!f.states.includes('connected'));
  socket.message(snapshot());
  assert.equal(f.positions.length, 0);
  assert.equal(f.states.at(-1), 'rejected');
});
test('fresh snapshots render; old sequences and invalid coordinates cannot leave stale markers', () => {
  const f = fixture(); f.connection.start(); const socket = f.sockets[0]; socket.open(); socket.message(accepted);
  socket.message(snapshot(2)); assert.equal(f.positions.length, 1);
  socket.message(snapshot(1)); assert.equal(f.positions.length, 1);
  socket.message(snapshot(3, {position: {x: -1, y: 0, plane: 0}}));
  assert.equal(f.positions.length, 1); assert.equal(f.states.at(-1), 'rejected'); assert.ok(f.clears > 0);
});
test('logout and unavailable instances clear; fresh account sessions render', () => {
  const f = fixture(); f.connection.start(); const s = f.sockets[0]; s.open(); s.message(accepted); s.message(snapshot());
  const before = f.clears;
  s.message(snapshot(2, {session: 'logout-session', availability: 'logged_out', position: undefined}));
  assert.equal(f.states.at(-1), 'logged_out'); assert.ok(f.clears > before);
  s.message(snapshot(3, {session: 'new-account'})); assert.equal(f.positions.length, 2);
  s.message(snapshot(4, {availability: 'instanced', position: undefined})); assert.equal(f.states.at(-1), 'instanced');
});
test('network drop clears immediately and reconnect uses only the in-memory resume secret', () => {
  const f = fixture(); f.connection.start(); const s = f.sockets[0]; s.open(); s.message(accepted); s.message(snapshot(42));
  const before = f.clears; s.end(); assert.ok(f.clears > before); f.advance(2000);
  const next = f.sockets[1]; next.open();
  assert.equal(next.sent[0].mode, 'resume'); assert.equal(next.sent[0].credential, resume);
  next.message(accepted); next.message(snapshot(42)); assert.equal(f.positions.length, 2);
  // Late events from the old socket must not change the new map.
  s.message(snapshot(500)); assert.equal(f.positions.length, 2);
  next.end(4001); f.advance(60000); assert.equal(f.sockets.length, 2);
});
test('manual disconnect erases credentials, notifies plugin and prevents retries', () => {
  const f = fixture(); f.connection.start(); const s = f.sockets[0]; s.open(); s.message(accepted); s.message(snapshot());
  f.connection.disconnect(); assert.deepEqual(s.sent.at(-1), {type: 'disconnect', version: 1});
  s.end(); f.advance(60000); f.connection.start(); assert.equal(f.sockets.length, 1);
  assert.equal(f.timers.size, 0);
});
test('missing heartbeat and failed pairing clear state and do not scan other ports', () => {
  const f = fixture(); f.connection.start(); const s = f.sockets[0]; s.open(); s.message(accepted); s.message(snapshot());
  const before = f.clears; f.advance(8000); assert.ok(f.clears > before);
  assert.equal(f.states.at(-1), 'reconnecting');
  const failed = fixture(); failed.connection.start(); failed.sockets[0].open(); failed.advance(6000);
  assert.equal(failed.states.at(-1), 'rejected'); failed.advance(60000); assert.equal(failed.sockets.length, 1);
});

test('reusing the map tab consumes a new pairing fragment immediately', () => {
  const vm = require('node:vm'), fs = require('node:fs');
  const events = {};
  const location = {pathname: '/', search: '', hash: ''};
  const window = {location, history: {replaceState(_state, _title, url) { location.hash = url.includes('#') ? url.slice(url.indexOf('#')) : ''; }}, addEventListener: (type, callback) => events[type] = callback};
  vm.runInNewContext(fs.readFileSync(require.resolve('../webapp/connection.js'), 'utf8'), {window, URLSearchParams});
  let received;
  window.RuneRadarConnection.onLaunch(value => received = value);
  location.hash = '#pair='+token+'&port=37780';
  events.hashchange();
  assert.deepEqual(JSON.parse(JSON.stringify(received)), {credential: token, port: 37780});
  assert.equal(location.hash, '');
  assert.equal(window.RuneRadarConnection.takeLaunch(), null);
});

test('paired location updates cannot write the map viewport into browser history', () => {
  const vm = require('node:vm'), fs = require('node:fs');
  const source = fs.readFileSync(require.resolve('../webapp/runeradar.js'), 'utf8');
  const hashFunction = source.slice(source.indexOf('function updateHash()'), source.indexOf('// Apply hash on load'));
  let writes = 0;
  const context = {connectionState: 'connected', map: {getCenter: () => ({lng:3222,lat:3218}), getZoom: () => 2}, history:{replaceState:()=>writes++}};
  vm.runInNewContext(hashFunction + '\nupdateHash();', context);
  assert.equal(writes, 0);
  context.connectionState = 'disconnected'; vm.runInNewContext('updateHash();', context); assert.equal(writes, 0);
  context.connectionState = 'static'; vm.runInNewContext('updateHash();', context); assert.equal(writes, 1);
});

test('optional account details reach the map and old position-only clients still work', () => {
  const f = fixture(); f.connection.start(); const s = f.sockets[0]; s.open(); s.message(accepted);
  const account = {name: 'Test <Player>', world: 301, hitpoints: 87, prayer: 63, runEnergy: 42};
  s.message(snapshot(1, {account}));
  assert.deepEqual(f.positions.at(-1).account, account);
  s.message(snapshot(2));
  assert.equal(f.positions.at(-1).account, undefined);
  const before = f.clears;
  s.message(snapshot(3, {availability: 'logged_out', position: undefined}));
  assert.ok(f.clears > before);
});

test('malformed account details cannot display or retain the previous account', () => {
  for (const extra of [{name: ''}, {world: -1}, {hitpoints: -1}, {prayer: '63'}, {runEnergy: 101}]) {
    const f = fixture(); f.connection.start(); const s = f.sockets[0]; s.open(); s.message(accepted);
    s.message(snapshot());
    const before = f.clears;
    s.message(snapshot(2, {account: {name: 'Test', world: 301, hitpoints: 87, prayer: 63, runEnergy: 42, ...extra}}));
    assert.equal(f.states.at(-1), 'rejected');
    assert.ok(f.clears > before);
  }
});


const objective = (extra = {}) => ({state:'active',title:'Example clue',text:'Go to the marker.',
  targets:[{x:3254,y:3421,plane:0}],totalTargets:1,approximate:false,...extra});
test('helpers are independent, ephemeral and cleared by logout or connection loss', () => {
  const f=fixture(); f.connection.start(); const s=f.sockets[0]; s.open(); s.message(accepted);
  s.message(snapshot(1,{helpers:{clue:objective(),quest:objective({title:'Example quest'})}}));
  assert.equal(f.positions.at(-1).helpers.clue.title,'Example clue');
  s.message(snapshot(2,{helpers:{quest:objective({title:'Example quest'})}}));
  assert.equal(f.positions.at(-1).helpers.clue,undefined);
  assert.equal(f.positions.at(-1).helpers.quest.title,'Example quest');
  s.message(snapshot(3)); assert.equal(f.positions.at(-1).helpers,undefined);
  const before=f.clears;
  s.message(snapshot(4,{availability:'logged_out',position:undefined}));
  assert.ok(f.clears>before);
  s.end(); assert.ok(f.clears>before+1);
});
test('invalid or excessive helper payloads cannot retain prior objectives', () => {
  for(const bad of [objective({targets:[{x:1,y:2,plane:4}]}),objective({text:'x'.repeat(1201)}),
    objective({targets:Array(17).fill({x:1,y:2,plane:0}),totalTargets:17}),
    objective({state:'idle'}),objective({totalTargets:0}),objective({approximate:'yes'})]) {
    const f=fixture(); f.connection.start();const s=f.sockets[0];s.open();s.message(accepted);
    s.message(snapshot(1,{helpers:{clue:objective()}}));
    s.message(snapshot(2,{helpers:{clue:bad}}));
    assert.equal(f.positions.length,1); assert.equal(f.states.at(-1),'rejected');assert.ok(f.clears>0);
  }
});
test('unavailable snapshots must not carry helper details', () => {
  const f=fixture();f.connection.start();const s=f.sockets[0];s.open();s.message(accepted);
  s.message(snapshot(1,{availability:'instanced',position:undefined,helpers:{clue:objective()}}));
  assert.equal(f.states.at(-1),'rejected');assert.equal(f.positions.length,0);
});
