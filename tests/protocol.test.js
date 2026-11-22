import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, FX_KEYS, POWERUPS, makeRng } from '../shared/config.js';
import { Round } from '../shared/sim/round.js';
import {
  checkServerMessage,
  decodeSegment,
  decodeSnapshot,
  encodeEvent,
  encodeSnapshot,
} from '../shared/protocol.js';
import { Room } from '../server/room.js';

const near = (a, b, eps) => Math.abs(a - b) <= eps;

test('a snapshot survives the trip through JSON', () => {
  const round = new Round({
    w: ARENA.w,
    h: ARENA.h,
    players: [{ bot: 'hard' }, { bot: 'hard' }, { bot: null }],
    rng: makeRng(5),
    powerups: true,
    hooks: {},
  });
  for (let i = 0; i < 900; i++) round.step();
  round.players[0].fx.ghost = 2.34;
  round.wrap = 3.21;
  const wire = JSON.parse(
    JSON.stringify(
      encodeSnapshot(round, {
        countingDown: false,
        countdown: -0.2,
        segments: [[1, 10, 20, 30.5, 40, 3]],
        events: [],
      }),
    ),
  );
  const snap = decodeSnapshot(wire);

  assert.equal(snap.countingDown, false);
  assert.equal(snap.countdown, 0, 'never negative');
  assert.equal(snap.players.length, 3);
  snap.players.forEach((p, i) => {
    const real = round.players[i];
    assert.equal(p.id, i);
    assert.ok(
      near(p.x, real.x, 0.05) && near(p.y, real.y, 0.05) && near(p.angle, real.angle, 0.0005),
    );
    assert.equal(p.alive, real.alive);
    assert.equal(p.r, real.r);
    assert.deepEqual(Object.keys(p.fx), FX_KEYS);
  });
  assert.equal(snap.players[0].fx.ghost, 2.3);
  assert.equal(snap.players[2].fx.ghost, 0);
  assert.equal(snap.wrap, 3.2);
  assert.equal(snap.items.length, round.items.length);
  snap.items.forEach((it, i) => assert.equal(it.def, round.items[i].def));
  assert.deepEqual(snap.segments, [[{ id: 1 }, 10, 20, 30.5, 40, 3]]);
  assert.deepEqual(snap.points, round.points);
  assert.equal(snap.step, 900, 'the server clock: steps simulated so far');
});

test('the countdown flag and time are carried', () => {
  const round = new Round({
    w: ARENA.w,
    h: ARENA.h,
    players: [{ bot: null }, { bot: null }],
    rng: makeRng(1),
    powerups: false,
    hooks: {},
  });
  const snap = decodeSnapshot(
    encodeSnapshot(round, { countingDown: true, countdown: 1.64, segments: [], events: [] }),
  );
  assert.equal(snap.countingDown, true);
  assert.equal(snap.countdown, 1.6);
});

test('events decode to what the renderer hooks expect', () => {
  const turbo = POWERUPS.find((d) => d.id === 'fast');
  const events = [
    encodeEvent.death({ id: 2, x: 10.26, y: 20.04 }),
    encodeEvent.pickup({ id: 1 }, { x: 5, y: 6, def: turbo }),
    encodeEvent.clear(),
  ];
  const round = { players: [], items: [], wrap: 0, points: [] };
  const snap = decodeSnapshot(
    JSON.parse(
      JSON.stringify(
        encodeSnapshot(round, { countingDown: false, countdown: 0, segments: [], events }),
      ),
    ),
  );
  assert.deepEqual(snap.events, [
    { type: 'death', player: { id: 2, x: 10.3, y: 20 } },
    { type: 'pickup', player: { id: 1 }, item: { x: 5, y: 6, def: turbo } },
    { type: 'clear' },
  ]);
});

test('a logged segment becomes the arguments of the segment hook', () => {
  assert.deepEqual(decodeSegment([4, 1, 2, 3, 4, 1.5]), [{ id: 4 }, 1, 2, 3, 4, 1.5]);
});

test("every message a real match sends passes the browser's check", () => {
  const room = new Room('ABCD', 11);
  const seen = new Map();
  const failed = [];
  const send = (text) => {
    const m = JSON.parse(text);
    seen.set(m.t, (seen.get(m.t) || 0) + 1);
    if (!checkServerMessage(m)) failed.push(m);
  };
  const a = room.add('Dana 😀😀😀😀😀😀😀😀', 0, send);
  const b = room.add('יואב', 3, send);
  room.handle(a.id, { t: 'addBot' });
  room.handle(a.id, { t: 'set', key: 'powerups', val: 'on' });
  room.handle(a.id, { t: 'set', key: 'length', val: 'custom' });
  room.handle(a.id, { t: 'set', key: 'target', val: 3 });
  room.handle(a.id, { t: 'set', key: 'leavers', val: 'out' });
  room.handle(a.id, { t: 'ping', c: 12.5 });
  room.handle(a.id, { t: 'start' });
  for (let i = 0; i < 60 * 300 && room.state === 'match'; i++) {
    if (i === 60 * 20) room.handle(b.id, { t: 'leave' });
    room.tick(1 / 60);
  }
  room.add('Late', 5, send); // joins the lobby after the match
  for (const t of ['joined', 'room', 'round', 's', 'roundEnd', 'gone', 'pong']) {
    assert.ok(seen.get(t) > 0, `saw ${t}`);
  }
  assert.deepEqual(failed.slice(0, 3), [], `${failed.length} messages failed the check`);
});

test('a broken, unknown or hostile message is refused', () => {
  const good = { t: 'joined', code: 'ABCD', you: 2, token: 'x' };
  assert.equal(checkServerMessage(good), true);
  const bad = [
    null,
    42,
    [],
    'joined',
    { t: 'nonsense' },
    { t: 'toString' },
    { t: '__proto__' },
    { ...good, code: 'abcd' },
    { ...good, you: '2' },
    { ...good, token: 'x'.repeat(65) },
    {
      t: 'room',
      code: 'ABCD',
      host: 1,
      state: 'lobby',
      public: false,
      startsIn: 0,
      settings: {},
      members: [],
    },
    { t: 'gone', i: 99 },
    { t: 'pong', c: 'now' },
    {
      t: 's',
      ph: 'c',
      cd: 1,
      p: [[1, 2, 3, 1, 3, 0, 'extra']],
      it: [],
      wr: 0,
      g: [],
      e: [],
      pts: [],
    },
    { t: 's', ph: 'p', cd: 0, p: [], it: [[99, 1, 2, 3]], wr: 0, g: [], e: [], pts: [] },
    { t: 's', ph: 'p', cd: 0, p: [], it: [], wr: 0, g: [], e: [['d', 1, 'x', 0]], pts: [] },
    { t: 'roundEnd', winner: 0, scores: [1], champion: 7, rounds: 1 },
  ];
  for (const m of bad) assert.equal(checkServerMessage(m), false, JSON.stringify(m));
});
