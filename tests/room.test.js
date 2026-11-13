import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, cleanName } from '../server/room.js';

function client() {
  const c = { log: [] };
  c.send = (s) => c.log.push(JSON.parse(s));
  c.last = (t) => c.log.filter((m) => m.t === t).at(-1);
  c.all = (t) => c.log.filter((m) => m.t === t);
  return c;
}

function setup() {
  const room = new Room('TEST', 7);
  const a = client();
  const b = client();
  const ma = room.add('דנה', 0, a.send);
  const mb = room.add('יואב', 0, b.send);
  return { room, a, b, ma, mb };
}

const run = (room, seconds) => {
  for (let i = 0; i < seconds * 60; i++) room.tick(1 / 60);
};

test('joining gives an id, a token and a unique colour', () => {
  const { a, b, ma, mb, room } = setup();
  assert.equal(a.last('joined').you, ma.id);
  assert.ok(a.last('joined').token);
  assert.equal(ma.color, 0);
  assert.notEqual(mb.color, 0); // asked for a taken colour, got another
  assert.equal(room.hostId, ma.id);
  assert.equal(b.last('room').members.length, 2);
});

test('names are cleaned and capped', () => {
  assert.equal(cleanName('  <b>abcdefghijklmnop'), 'babcdefghi');
  assert.equal(cleanName(''), 'Player');
  assert.equal(cleanName(null), 'Player');
});

test('a room holds at most six, bots included', () => {
  const { room, ma } = setup();
  for (let i = 0; i < 10; i++) room.handle(ma.id, { t: 'addBot' });
  assert.equal(room.members.length, 6);
  assert.equal(room.add('x', 1, () => {}), null);
  assert.equal(new Set(room.members.map((m) => m.color)).size, 6);
});

test('only the host changes settings and starts', () => {
  const { room, ma, mb } = setup();
  room.handle(mb.id, { t: 'set', key: 'length', val: 'short' });
  assert.equal(room.settings.length, 'normal');
  room.handle(ma.id, { t: 'set', key: 'length', val: 'nonsense' });
  assert.equal(room.settings.length, 'normal');
  room.handle(ma.id, { t: 'set', key: 'length', val: 'short' });
  assert.equal(room.settings.length, 'short');
  room.handle(mb.id, { t: 'start' });
  assert.equal(room.state, 'lobby');
  room.handle(ma.id, { t: 'start' });
  assert.equal(room.state, 'match');
});

test('a taken colour cannot be picked', () => {
  const { room, ma, mb } = setup();
  room.handle(mb.id, { t: 'color', color: ma.color });
  assert.notEqual(mb.color, ma.color);
  room.handle(mb.id, { t: 'color', color: 9 });
  assert.equal(mb.color, 9);
});

test('countdown, then snapshots with trail segments, and input steers', () => {
  const { room, a, ma } = setup();
  room.handle(ma.id, { t: 'start' });
  assert.equal(a.last('round').order.length, 2);
  assert.equal(a.last('s').ph, 'c');
  run(room, 2.5);
  assert.equal(room.phase, 'playing');
  const before = a.last('s').p[0][2];
  room.handle(ma.id, { t: 'input', d: 1 });
  run(room, 0.25);
  const snap = a.last('s');
  assert.equal(snap.ph, 'p');
  assert.ok(snap.p[0][2] > before + 0.3, 'angle grew while turning right');
  assert.ok(a.all('s').some((m) => m.g.length > 0), 'segments were sent');
});

test('a full match with bots ends back in the lobby with a champion', () => {
  const { room, a, ma } = setup();
  room.handle(ma.id, { t: 'addBot' });
  room.handle(ma.id, { t: 'set', key: 'length', val: 'short' });
  room.handle(ma.id, { t: 'start' });
  for (let i = 0; i < 60 * 60 * 30 && room.state === 'match'; i++) room.tick(1 / 60);
  assert.equal(room.state, 'lobby');
  const end = a.last('roundEnd');
  assert.ok(end.champion >= 0);
  assert.ok(end.scores[end.champion] >= 10);
  assert.equal(a.last('room').state, 'lobby');
});

test('a dropped player is steered by a bot and can come back', () => {
  const { room, a, b, ma, mb } = setup();
  room.handle(ma.id, { t: 'start' });
  run(room, 2.5);
  room.disconnect(mb.id);
  assert.equal(room.members.length, 2, 'seat is kept during a match');
  room.tick(1 / 60);
  assert.ok(room.round.players[1].bot, 'bot took over');
  const c = client();
  assert.equal(room.reconnect('wrong-token', c.send), null);
  const back = room.reconnect(b.last('joined').token, c.send);
  assert.equal(back.id, mb.id);
  assert.ok(Array.isArray(c.last('round').segs));
  assert.ok(c.last('round').segs.length > 0, 'trail so far is replayed');
  room.tick(1 / 60);
  assert.equal(room.round.players[1].bot, null);
  assert.ok(a.last('room').members.every((m) => m.on));
});

test('the host role moves on when the host leaves', () => {
  const { room, ma, mb, b } = setup();
  room.handle(ma.id, { t: 'leave' });
  assert.equal(room.hostId, mb.id);
  assert.equal(b.last('room').members.length, 1);
  room.disconnect(mb.id);
  assert.equal(room.members.length, 0);
  room.tick(1);
  assert.ok(room.emptyFor > 0);
});
