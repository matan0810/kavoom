import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, cleanName, SEAT_GRACE, HOST_GRACE } from '../server/room.js';

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
  assert.equal(cleanName({ toString: () => 'x' }), 'Player', 'only strings are names');
  assert.equal(
    cleanName('ab\u202Ecd\u200B'),
    'abcd',
    'text-reordering and invisible characters are dropped',
  );
  assert.equal(cleanName('\u200B\u200F'), 'Player', 'an invisible name is no name');
  assert.equal(
    cleanName('😀'.repeat(12)),
    '😀'.repeat(10),
    'emoji are counted whole, never cut in half',
  );
});

test('a room holds at most six, bots included', () => {
  const { room, ma } = setup();
  for (let i = 0; i < 10; i++) room.handle(ma.id, { t: 'addBot' });
  assert.equal(room.members.length, 6);
  assert.equal(
    room.add('x', 1, () => {}),
    null,
  );
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
  assert.ok(
    a.all('s').some((m) => m.g.length > 0),
    'segments were sent',
  );
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
  assert.equal(room.members.length, 1, 'a dropped player keeps the seat for a while');
  assert.equal(room.abandoned(), false);
  run(room, SEAT_GRACE + 1);
  assert.equal(room.members.length, 0);
  assert.equal(room.abandoned(), true);
  assert.ok(room.emptyFor > 0);
});

test('an old connection closing does not throw out a player who already came back', () => {
  const room = new Room('TEST', 1);
  const a = client();
  const b = client();
  const c = client();
  room.add('A', 0, a.send);
  const mb = room.add('B', 1, b.send);
  room.handle(room.hostId, { t: 'start' });
  // B's phone changes network: the new connection rejoins before the old one is noticed dead.
  assert.ok(room.reconnect(b.last('joined').token, c.send));
  room.disconnect(mb.id, b.send);
  assert.equal(room.members.find((m) => m.id === mb.id).connected, true);
  room.disconnect(mb.id, c.send);
  assert.equal(room.members.find((m) => m.id === mb.id).connected, false);
});

test('setting keys that are not settings are ignored without an error', () => {
  const room = new Room('TEST', 1);
  const a = client();
  room.add('A', 0, a.send);
  for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    assert.doesNotThrow(() => room.handle(room.hostId, { t: 'set', key, val: 'x' }));
  }
  assert.equal(room.settings.length, 'normal');
  assert.equal(Object.keys(room.settings).length, 6);
});

test('a locked room takes no newcomers, but a player who dropped can still come back', () => {
  const { room, a, b, mb } = setup();
  room.handle(mb.id, { t: 'set', key: 'locked', val: 'on' });
  assert.equal(room.settings.locked, 'off', 'only the host locks');
  room.handle(room.hostId, { t: 'set', key: 'locked', val: 'on' });
  assert.equal(a.last('room').settings.locked, 'on');
  assert.equal(room.refusal(), 'locked');
  assert.equal(room.add('C', 3, client().send), null);
  assert.equal(room.members.length, 2);

  room.handle(room.hostId, { t: 'start' });
  room.disconnect(mb.id);
  assert.ok(
    room.reconnect(b.last('joined').token, client().send),
    'the token still opens the door',
  );
});

test('the host can remove a player from the lobby, and nobody else can', () => {
  const { room, a, b, ma, mb } = setup();
  room.handle(mb.id, { t: 'kick', id: ma.id });
  assert.equal(room.members.length, 2, 'a guest cannot remove the host');
  room.handle(ma.id, { t: 'kick', id: ma.id });
  assert.equal(room.members.length, 2, 'the host cannot remove themselves');
  room.handle(ma.id, { t: 'kick', id: mb.id });
  assert.deepEqual(
    room.members.map((m) => m.id),
    [ma.id],
  );
  assert.equal(b.last('error').code, 'kicked');
  assert.equal(a.last('room').members.length, 1);
});

test('nobody is removed once the match is on', () => {
  const { room, ma, mb } = setup();
  room.handle(ma.id, { t: 'start' });
  room.handle(ma.id, { t: 'kick', id: mb.id });
  assert.equal(room.members.length, 2);
});

test('a public room starts by itself ten seconds after a second person arrives', () => {
  const room = new Room('OPEN', 3, { isPublic: true });
  const a = client();
  const b = client();
  room.add('A', 0, a.send);
  run(room, 15);
  assert.equal(room.state, 'lobby', 'one person alone waits');
  assert.equal(a.last('room').startsIn, 0);
  assert.equal(a.last('room').public, true);

  const mb = room.add('B', 1, b.send);
  run(room, 3);
  assert.equal(a.last('room').startsIn, 7);
  room.disconnect(mb.id);
  run(room, 1);
  assert.equal(a.last('room').startsIn, 0, 'the count stops when they leave');

  room.add('B', 1, b.send);
  run(room, 9);
  assert.equal(room.state, 'lobby');
  run(room, 1.1);
  assert.equal(room.state, 'match');
  assert.ok(b.last('round'));
});

test('a public room cannot be locked, and a private one never starts by itself', () => {
  const open = new Room('OPEN', 3, { isPublic: true });
  open.add('A', 0, client().send);
  open.handle(open.hostId, { t: 'set', key: 'locked', val: 'on' });
  assert.equal(open.settings.locked, 'off');

  const { room } = setup();
  run(room, 30);
  assert.equal(room.state, 'lobby');
});

test('a ping is echoed to the one who sent it, with a safe number', () => {
  const { room, a, b, ma } = setup();
  room.handle(ma.id, { t: 'ping', c: 123.5 });
  assert.deepEqual(a.last('pong'), { t: 'pong', c: 123.5 });
  assert.equal(b.last('pong'), undefined);
  room.handle(ma.id, { t: 'ping', c: 'x'.repeat(500) });
  assert.deepEqual(a.last('pong'), { t: 'pong', c: 0 });
});

test('the host can set a custom target and turn win-by-2 off; numbers are clamped', () => {
  const { room, a, ma, mb } = setup();
  room.handle(mb.id, { t: 'set', key: 'target', val: 7 });
  assert.equal(room.settings.target, 20, 'a guest cannot');
  for (const [val, want] of [
    [7, 7],
    [7.6, 8],
    [0, 1],
    [-50, 1],
    [1e9, 300],
  ]) {
    room.handle(ma.id, { t: 'set', key: 'target', val });
    assert.equal(room.settings.target, want, String(val));
  }
  for (const bad of ['12', null, [3], { n: 3 }, NaN]) {
    room.handle(ma.id, { t: 'set', key: 'target', val: bad });
    assert.equal(room.settings.target, 300, String(bad));
  }
  room.handle(ma.id, { t: 'set', key: 'target', val: 4 });
  room.handle(ma.id, { t: 'set', key: 'length', val: 'custom' });
  room.handle(ma.id, { t: 'set', key: 'winBy2', val: 'off' });
  room.handle(ma.id, { t: 'set', key: 'winBy2', val: 'maybe' });
  assert.equal(a.last('room').settings.winBy2, 'off');

  room.handle(ma.id, { t: 'start' });
  const round = a.last('round');
  assert.equal(round.target, 4);
  assert.equal(round.lead, 1);
});

test('a preset length scales with the players in the room', () => {
  const { room, a, ma } = setup();
  room.handle(ma.id, { t: 'addBot' });
  room.handle(ma.id, { t: 'set', key: 'length', val: 'long' });
  room.handle(ma.id, { t: 'start' });
  assert.equal(a.last('round').target, 30); // 15 per rival, 2 rivals
  assert.equal(a.last('round').lead, 2);
});

test('nothing about the target changes once the match is on', () => {
  const { room, ma } = setup();
  room.handle(ma.id, { t: 'start' });
  room.handle(ma.id, { t: 'set', key: 'target', val: 3 });
  assert.equal(room.settings.target, 20);
});

test('the host can rename a bot in the lobby, and nobody can rename a person this way', () => {
  const { room, a, ma, mb } = setup();
  room.handle(ma.id, { t: 'addBot' });
  const bot = room.members.find((m) => m.bot);
  room.handle(mb.id, { t: 'renameBot', id: bot.id, name: 'Guest try' });
  assert.equal(bot.name, 'BOT 1', 'a guest cannot');
  room.handle(ma.id, { t: 'renameBot', id: bot.id, name: '  <Robo>\u202E  ' });
  assert.equal(bot.name, 'Robo', 'cleaned like any name');
  assert.equal(a.last('room').members.find((m) => m.id === bot.id).name, 'Robo');
  room.handle(ma.id, { t: 'renameBot', id: mb.id, name: 'Hacked' });
  assert.notEqual(room.members.find((m) => m.id === mb.id).name, 'Hacked');
  room.handle(ma.id, { t: 'start' });
  room.handle(ma.id, { t: 'renameBot', id: bot.id, name: 'Late' });
  assert.equal(bot.name, 'Robo', 'not during a match');
});

test('a player who drops in the lobby keeps the seat and comes back to it', () => {
  const { room, a, b, mb } = setup();
  room.disconnect(mb.id);
  assert.equal(a.last('room').members.find((m) => m.id === mb.id).on, false, 'shown as away');
  run(room, SEAT_GRACE - 5);
  const c = client();
  const back = room.reconnect(b.last('joined').token, c.send);
  assert.equal(back.id, mb.id, 'the same seat, not a new player');
  assert.equal(room.members.length, 2);
  run(room, SEAT_GRACE + 5);
  assert.equal(room.members.length, 2, 'back in time: the seat is safe');
});

test('the host stays host through a short drop, and hands over after a long one', () => {
  const { room, a, b, ma, mb } = setup();
  room.disconnect(ma.id);
  run(room, HOST_GRACE - 5);
  assert.equal(room.hostId, ma.id, 'a locked phone does not cost the host role');
  room.reconnect(a.last('joined').token, client().send);
  assert.equal(room.hostId, ma.id);

  room.disconnect(ma.id);
  run(room, HOST_GRACE + 1);
  assert.equal(room.hostId, mb.id, 'after a long absence someone present takes over');
  assert.equal(b.last('room').host, mb.id);
  room.reconnect(a.last('joined').token, client().send);
  assert.equal(room.hostId, mb.id, 'and keeps it when the old host comes back');
});

test('with nobody here, the match waits instead of bots playing on', () => {
  const { room, a, ma, mb } = setup();
  room.handle(ma.id, { t: 'addBot' });
  room.handle(ma.id, { t: 'start' });
  run(room, 4);
  room.disconnect(ma.id);
  room.disconnect(mb.id);
  const before = a.all('s').length;
  const stepsBefore = room.round.stepN;
  run(room, 10);
  assert.equal(room.round.stepN, stepsBefore, 'frozen');
  room.reconnect(a.last('joined').token, client().send);
  run(room, 1);
  assert.ok(
    room.round.stepN > stepsBefore || room.phase !== 'playing',
    'and goes on when someone is back',
  );
  assert.ok(before > 0);
});

test('at the end of a match, players away only briefly keep their seats', () => {
  const room = new Room('TEST', 7);
  const a = client();
  const b = client();
  room.add('A', 0, a.send);
  const mb = room.add('B', 1, b.send);
  room.settings.length = 'custom';
  room.settings.target = 1;
  room.settings.winBy2 = 'off';
  room.handle(room.hostId, { t: 'start' });
  room.disconnect(mb.id);
  let away = 0;
  for (; away < 120 && room.state === 'match'; away += 1 / 60) room.tick(1 / 60);
  assert.equal(room.state, 'lobby');
  assert.ok(away < SEAT_GRACE, 'a one-point match is short');
  room.tick(1 / 60);
  assert.ok(
    room.members.some((m) => m.id === mb.id),
    'B keeps the seat for now',
  );
  run(room, SEAT_GRACE - away + 1);
  assert.ok(!room.members.some((m) => m.id === mb.id), 'and loses it once away too long');
});
