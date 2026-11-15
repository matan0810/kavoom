import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA,
  BASE,
  POWERUPS,
  clampTarget,
  leadFor,
  makeRng,
  matchTarget,
} from '../shared/config.js';
import { Round } from '../shared/sim/round.js';
import { Match } from '../shared/sim/match.js';

const def = (id) => POWERUPS.find((d) => d.id === id);

function makeRound(n, opts = {}) {
  return new Round({
    w: ARENA.w,
    h: ARENA.h,
    players: Array.from({ length: n }, () => ({ bot: opts.bot || null })),
    rng: makeRng(opts.seed ?? 1),
    powerups: opts.powerups ?? false,
    hooks: opts.hooks || {},
  });
}

function put(p, x, y, angle) {
  p.x = p.px = x;
  p.y = p.py = y;
  p.angle = angle;
}

function runUntil(round, maxSteps, stop = () => false) {
  let n = 0;
  while (!round.over && n < maxSteps && !stop()) {
    round.step();
    n++;
  }
  return n;
}

test('a player dies on the wall', () => {
  const r = makeRound(2);
  put(r.players[0], 100, 360, Math.PI); // heading left
  put(r.players[1], 560, 100, 0);
  runUntil(r, 2000, () => !r.players[0].alive);
  assert.equal(r.players[0].alive, false);
  assert.ok(r.players[0].x <= BASE.radius + 1);
  assert.equal(r.points[1], 1);
  assert.equal(r.winner, 1);
});

test('open walls wrap instead of killing', () => {
  const r = makeRound(2);
  put(r.players[0], 30, 360, Math.PI);
  put(r.players[1], 560, 100, 0);
  r.wrap = 5;
  runUntil(r, 120);
  assert.equal(r.players[0].alive, true);
  assert.ok(r.players[0].x > ARENA.w / 2);
});

test('crossing an opponent trail kills', () => {
  const r = makeRound(2);
  const [a, b] = r.players;
  a.toGap = b.toGap = 1e9; // no gaps in this test
  put(a, 200, 300, 0); // draws a horizontal line
  put(b, 420, 600, -Math.PI / 2); // drives up into it later
  runUntil(r, 2000);
  assert.equal(b.alive, false);
  assert.equal(a.alive, true);
  assert.ok(Math.abs(b.y - 300) < 12, `died near the line, y=${b.y}`);
});

test('head-on collision kills both and scores nobody', () => {
  const r = makeRound(2);
  const [a, b] = r.players;
  a.toGap = b.toGap = 1e9;
  put(a, 300, 360, 0);
  put(b, 800, 360, Math.PI);
  runUntil(r, 2000);
  assert.equal(a.alive, false);
  assert.equal(b.alive, false);
  assert.equal(r.winner, -1);
  assert.deepEqual(r.points, [0, 0]);
});

test('no self-collision while circling, for every speed and width', () => {
  const combos = [
    [],
    ['fast'],
    ['slow'],
    ['thin'],
    ['thick'],
    ['fast', 'thick'],
    ['slow', 'thick'],
    ['fast', 'thin'],
    ['slow', 'thin'],
  ];
  for (const fx of combos) {
    const r = makeRound(2);
    const [a, b] = r.players;
    put(a, 560, 360, 0);
    put(b, 100, 100, 0);
    b.fx.ghost = 1e9; // parked out of the way: leaves no trail
    b.input = 1;
    a.input = 1;
    for (const k of fx) a.fx[k] = 1e9;
    // Just under one full circle of hard turning.
    r.step();
    const steps = Math.floor(((2 * Math.PI) / a.turn) * 120 * 0.8);
    for (let i = 0; i < steps && a.alive; i++) {
      b.x = 100;
      b.y = 100;
      r.step();
    }
    assert.equal(a.alive, true, `died with fx=[${fx}]`);
  }
});

test('a full circle does hit the own trail', () => {
  const r = makeRound(2);
  const [a, b] = r.players;
  a.toGap = 1e9;
  put(a, 560, 360, 0);
  put(b, 100, 100, 0);
  b.fx.ghost = 1e9;
  a.input = 1;
  for (let i = 0; i < 600 && a.alive; i++) {
    b.x = 100;
    b.y = 100;
    r.step();
  }
  assert.equal(a.alive, false);
});

test('trail gaps let an opponent through', () => {
  const r = makeRound(2);
  const [a, b] = r.players;
  put(a, 200, 300, 0);
  a.toGap = 100; // gap starts at x=300 and lasts 24 units
  put(b, 314, 420, -Math.PI / 2);
  b.toGap = 1e9;
  runUntil(r, 240, () => b.y < 280);
  assert.equal(b.alive, true);
  assert.ok(b.y < 280);
});

test('ghost passes through trails', () => {
  const r = makeRound(2);
  const [a, b] = r.players;
  a.toGap = 1e9;
  put(a, 200, 300, 0);
  put(b, 420, 600, -Math.PI / 2);
  b.fx.ghost = 1e9;
  runUntil(r, 450, () => b.y < 250);
  assert.equal(b.alive, true);
});

test('each death pays one point to everyone still alive', () => {
  const r = makeRound(3);
  const [a, b, c] = r.players;
  put(a, 30, 100, Math.PI); // dies first
  put(b, 80, 300, Math.PI); // dies second
  put(c, 560, 500, 0);
  runUntil(r, 3000);
  assert.deepEqual(r.points, [0, 1, 2]);
  assert.equal(r.winner, 2);
});

test('power-ups apply to the right players', () => {
  const r = makeRound(3);
  const [a, b, c] = r.players;
  r.apply(def('fast'), a);
  assert.ok(a.fx.fast > 0 && b.fx.fast === 0);
  r.apply(def('thickOthers'), a);
  assert.ok(a.fx.thick === 0 && b.fx.thick > 0 && c.fx.thick > 0);
  r.grid.stampDisc(50, 50, 3, 1, 0);
  let cleared = false;
  r.hooks.clear = () => (cleared = true);
  r.apply(def('clear'), a);
  assert.equal(r.grid.probe(50, 50, 0, 100, 0), 0);
  assert.ok(cleared);
  r.apply(def('wrap'), a);
  assert.ok(r.wrap > 0);
});

test('reversed controls flip the turn direction', () => {
  const r = makeRound(2);
  const [a, b] = r.players;
  put(a, 560, 360, 0);
  put(b, 200, 200, 0);
  a.input = 1;
  a.fx.reverse = 1;
  r.step();
  assert.ok(a.angle < 0);
});

test('items are picked up by driving over them', () => {
  const picked = [];
  const r = makeRound(2, {
    powerups: true,
    hooks: { pickup: (p, it) => picked.push([p.id, it.def.id]) },
  });
  const [a, b] = r.players;
  put(a, 300, 360, 0);
  put(b, 300, 100, 0);
  r.nextSpawn = 1e9;
  r.items.push({ def: def('thin'), x: 360, y: 360, life: 10 });
  runUntil(r, 120, () => picked.length > 0);
  assert.deepEqual(picked, [[0, 'thin']]);
  assert.ok(a.fx.thin > 0);
  assert.equal(r.items.length, 0);
});

test('match needs the target and a two point lead', () => {
  const m = new Match(3, 10); // to 10, win by 2
  assert.equal(m.target, 10);
  m.applyRound([9, 9, 0]);
  assert.equal(m.winner(), -1);
  m.applyRound([1, 0, 0]); // 10 : 9, lead of one
  assert.equal(m.winner(), -1);
  m.applyRound([1, 0, 0]); // 11 : 9
  assert.equal(m.winner(), 0);
  assert.deepEqual(m.ranking(), [0, 1, 2]);
});

test('same seed gives the same round', () => {
  const play = () => {
    const r = makeRound(4, { seed: 42, bot: 'medium', powerups: true });
    runUntil(r, 120 * 120);
    return [r.stepN, r.winner, ...r.points, ...r.players.map((p) => p.x.toFixed(3))];
  };
  assert.deepEqual(play(), play());
});

test('bots survive far longer than a straight line', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    let total = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const r = makeRound(2, { seed, bot: level });
      // Player 1 is parked as a ghost so only player 0 is being measured.
      r.players[1].bot = null;
      r.players[1].fx.ghost = 1e9;
      const b = r.players[1];
      for (let i = 0; i < 120 * 40 && r.players[0].alive; i++) {
        put(b, 20, 20, 0);
        r.step();
      }
      total += r.time;
    }
    const avg = total / 5;
    console.log(`bot ${level}: ${avg.toFixed(1)}s`);
    // A straight line crosses the arena in at most ~12 seconds.
    assert.ok(avg > (level === 'easy' ? 15 : 25), `${level} bot averaged ${avg.toFixed(1)}s alone`);
  }
});

test('bot rounds always finish with a consistent result', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const r = makeRound(6, { seed, bot: 'hard', powerups: true });
    runUntil(r, 120 * 300);
    assert.equal(r.over, true, `seed ${seed} did not finish`);
    assert.ok(r.aliveCount <= 1);
    assert.ok(r.points.every((p) => p >= 0 && p <= 5));
  }
});

test('the game version matches package.json', async () => {
  const { VERSION } = await import('../shared/config.js');
  const { readFile } = await import('node:fs/promises');
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(VERSION, pkg.version);
});

test('without win by 2, the first to the target wins; level at the top still plays on', () => {
  const m = new Match(3, 10, 1);
  m.applyRound([9, 9, 0]);
  assert.equal(m.winner(), -1);
  m.applyRound([1, 0, 0]);
  assert.equal(m.winner(), 0, '10 to 9 is enough');
  const level = new Match(2, 10, 1);
  level.applyRound([10, 10]);
  assert.equal(level.winner(), -1, 'nobody is ahead');
});

test('the target follows the length and the number of players', () => {
  assert.equal(matchTarget('normal', 2), 10);
  assert.equal(matchTarget('normal', 3), 20);
  assert.equal(matchTarget('short', 6), 25);
  assert.equal(matchTarget('long', 6), 75);
  assert.equal(matchTarget('custom', 6, 12), 12, 'a typed number does not scale');
  assert.equal(matchTarget('nonsense', 3), 20);
  assert.equal(clampTarget('abc'), 20);
  assert.equal(clampTarget(0), 1);
  assert.equal(clampTarget(301), 300);
  assert.equal(leadFor('on'), 2);
  assert.equal(leadFor('off'), 1);
});
