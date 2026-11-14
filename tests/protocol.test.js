import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, FX_KEYS, POWERUPS, makeRng } from '../shared/config.js';
import { Round } from '../shared/sim/round.js';
import { decodeSegment, decodeSnapshot, encodeEvent, encodeSnapshot } from '../shared/protocol.js';

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
