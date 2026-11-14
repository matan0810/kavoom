import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, BASE, DT, FX_KEYS, makeRng } from '../shared/config.js';
import { Round } from '../shared/sim/round.js';
import { moveHead, speedAndTurn } from '../shared/sim/motion.js';
import { Predictor } from '../src/engine/prediction.js';

const noFx = Object.fromEntries(FX_KEYS.map((k) => [k, 0]));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function soloRound() {
  const round = new Round({
    w: ARENA.w,
    h: ARENA.h,
    players: [{ bot: null }, { bot: null }],
    rng: makeRng(3),
    powerups: false,
    hooks: {},
  });
  Object.assign(round.players[0], { x: 400, y: 360, angle: 0 });
  Object.assign(round.players[1], { x: 100, y: 100, angle: 0 }); // out of the way
  return round;
}

test('moveHead moves a head exactly as the round does, turns and effects included', () => {
  for (const fx of [{}, { fast: 9 }, { slow: 9 }, { reverse: 9 }]) {
    const round = soloRound();
    const p = round.players[0];
    Object.assign(p.fx, fx);
    const head = { x: p.x, y: p.y, angle: p.angle };
    for (let i = 0; i < 200; i++) {
      p.input = i < 60 ? 1 : i < 120 ? -1 : 0;
      moveHead(head, p.input, p.fx, DT, ARENA, false);
      round.step();
    }
    assert.ok(dist(head, p) < 1e-6 && Math.abs(head.angle - p.angle) < 1e-9, JSON.stringify(fx));
  }
});

test('open walls bring the head back on the other side', () => {
  const head = { x: ARENA.w - 0.1, y: 5, angle: 0 };
  moveHead(head, 0, noFx, 0.1, ARENA, true);
  assert.ok(head.x < 20);
  assert.equal(speedAndTurn(noFx).speed, BASE.speed);
});

test('nothing is predicted before the round trip is known or during the countdown', () => {
  const p = new Predictor();
  p.addServerState({ x: 1, y: 1, angle: 0 }, noFx, 0, true, 1000, 1000);
  assert.equal(p.predict(1010), null, 'round trip not measured');
  p.addRttSample(100);
  p.reset();
  p.addServerState({ x: 1, y: 1, angle: 0 }, noFx, 0, false, 1000, 1000);
  assert.equal(p.predict(1010), null, 'countdown');
  assert.equal(new Predictor().predict(5), null);
});

test('going straight, the head is drawn one round trip (plus the age of the news) ahead', () => {
  const p = new Predictor();
  p.addRttSample(100);
  p.addServerState({ x: 500, y: 300, angle: 0 }, noFx, 0, true, 0, 0);
  p.addServerState({ x: 600, y: 300, angle: 0 }, noFx, 0, true, 1000, 1000);
  const guess = p.predict(1010);
  const lead = (100 + 1000 / 120 + 10) / 1000;
  assert.ok(Math.abs(guess.x - (600 + BASE.speed * lead)) < 0.01);
  assert.equal(guess.y, 300);
  assert.deepEqual(guess.path[0], [600, 300]);
  assert.ok(guess.path.length > 5);
});

test('the lead eases in at the start of a round and is capped on a terrible connection', () => {
  const p = new Predictor();
  p.addRttSample(100);
  p.addServerState({ x: 500, y: 300, angle: 0 }, noFx, 0, true, 1000, 1000);
  assert.equal(p.predict(1000).x, 500, 'no jump at "go"');

  const slow = new Predictor();
  slow.addRttSample(1500);
  slow.addServerState({ x: 500, y: 300, angle: 0 }, noFx, 0, true, 0, 0);
  slow.addServerState({ x: 500, y: 300, angle: 0 }, noFx, 0, true, 5000, 5000);
  assert.ok(Math.abs(slow.predict(5000).x - (500 + BASE.speed * 0.25)) < 0.01);
  // The server went quiet: the guess stops growing instead of running off.
  assert.ok(slow.predict(9000).x - 500 < BASE.speed * 0.45);
});

test('bad round trip samples are ignored and good ones are smoothed', () => {
  const p = new Predictor();
  for (const bad of [-5, NaN, 5000, undefined]) p.addRttSample(bad);
  assert.equal(p.rtt, 0);
  p.addRttSample(100);
  p.addRttSample(200);
  assert.ok(Math.abs(p.rtt - 120) < 1e-9);
});

// The real thing: a server 60 ms away in each direction, a player who weaves,
// and the question "is the head drawn where the server will really have it?"
test('with 120 ms of round trip, the predicted head matches where the server ends up', () => {
  const ONE_WAY = 60;
  const round = soloRound();
  const server = round.players[0];
  const predictor = new Predictor();
  predictor.addRttSample(2 * ONE_WAY);

  const truth = new Map(); // server time (ms) -> where the head was
  const toServer = []; // { at, dir } inputs on the wire
  const toClient = []; // { at, head } snapshots on the wire
  const keys = (t) => (t < 300 ? 0 : t < 900 ? 1 : t < 1400 ? -1 : t < 1700 ? 0 : 1);

  let held = 0;
  let worst = 0;
  let worstUnpredicted = 0;
  let checked = 0;
  let lastDrawn = null;
  let smoothest = Infinity;
  let roughest = 0;
  for (let ms = 0; ms <= 2600; ms++) {
    // Server: apply what arrived, step at 120 Hz, send a snapshot at 60 Hz.
    while (toServer.length && toServer[0].at <= ms) server.input = toServer.shift().dir;
    if (ms % 25 === 0) for (let i = 0; i < 3; i++) round.step(); // 120 steps a second
    truth.set(ms, { x: server.x, y: server.y });
    if (ms % 50 === 0) {
      const head = { x: server.x, y: server.y, angle: server.angle };
      // Deliveries wobble by up to 12 ms, as they do on a real network.
      const wobble = (ms / 50) % 3 === 0 ? 12 : (ms / 50) % 3 === 1 ? 5 : 0;
      toClient.push({ at: ms + ONE_WAY + wobble, head, serverMs: ms });
    }
    // Client: take what arrived, press keys, and predict.
    while (toClient.length && toClient[0].at <= ms) {
      const snap = toClient.shift();
      predictor.addServerState(snap.head, noFx, 0, true, ms, snap.serverMs);
    }
    if (keys(ms) !== held) {
      held = keys(ms);
      predictor.addInput(held, ms);
      toServer.push({ at: ms + ONE_WAY, dir: held });
    }
    const guess = predictor.predict(ms);
    // Straight stretch, sampled every 16 ms like a screen: the step should be speed x time.
    if (guess && ms > 1520 && ms < 1690 && ms % 16 === 0) {
      if (lastDrawn) {
        const ratio = dist(guess, lastDrawn) / (BASE.speed * 0.016);
        smoothest = Math.min(smoothest, ratio);
        roughest = Math.max(roughest, ratio);
      }
      lastDrawn = guess;
    }
    if (guess && ms > 400 && ms < 2500 && truth.has(ms - 1)) {
      // What we draw now should be where the server has the head when our input lands.
      const landed = ms + ONE_WAY;
      pending.push({ landed, guess, shown: predictor.base.head });
    }
    for (const check of pending.filter((c) => c.landed === ms)) {
      worst = Math.max(worst, dist(check.guess, truth.get(ms)));
      worstUnpredicted = Math.max(worstUnpredicted, dist(check.shown, truth.get(ms)));
      checked++;
    }
  }
  assert.ok(checked > 1500);
  assert.ok(
    smoothest > 0.6 && roughest < 1.4,
    `the head moves evenly (${smoothest.toFixed(2)} to ${roughest.toFixed(2)} of true speed)`,
  );
  assert.ok(
    worst < 6,
    `predicted head is within a line's width of the truth (worst ${worst.toFixed(1)})`,
  );
  assert.ok(
    worstUnpredicted > 12,
    `without prediction it trails well behind (${worstUnpredicted.toFixed(1)})`,
  );
});
const pending = [];
