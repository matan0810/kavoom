// The match state machine (src/engine/game.js) without a browser: a stub canvas
// and silent sound stand in for the real ones.

import test from 'node:test';
import assert from 'node:assert/strict';

const ctx = () => new Proxy({}, { get: () => () => {}, set: () => true }); // accepts any drawing call
globalThis.window = { devicePixelRatio: 1 };
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: ctx }) };

const { Game } = await import('../src/engine/game.js');

const quiet = new Proxy({}, { get: () => () => {} });
function makeInput() {
  const input = {
    dir: 0,
    pad: 0,
    keys: () => input.dir,
    touchDir: () => 0,
    padDir: () => input.pad,
  };
  return input;
}
const bots = (n) =>
  Array.from({ length: n }, (_, i) => ({ name: `B${i}`, color: '#fff', human: false, keys: [] }));
const setup = (players, extra = {}) => ({
  players,
  botLevel: 'medium',
  powerups: false,
  length: 'short',
  ...extra,
});

// Advance the game by `seconds` of frames. Returns the number of frames used.
function run(game, seconds, dt = 0.05) {
  let frames = 0;
  for (let t = 0; t < seconds; t += dt, frames++) game.frame(dt);
  return frames;
}

test('a new local match counts down, then plays', () => {
  const game = new Game({ input: makeInput(), sfx: quiet });
  assert.equal(game.ui.state, 'idle');
  game.startLocal(
    setup([{ name: 'Ann', color: '#f00', human: true, keys: ['KeyA', 'KeyD'] }, ...bots(2)]),
  );
  assert.equal(game.ui.state, 'countdown');
  assert.equal(game.ui.mode, 'local');
  assert.deepEqual(
    game.ui.players.map((p) => p.name),
    ['Ann', 'B0', 'B1'],
  );
  assert.deepEqual(game.ui.padOwners, [0], 'only the human gets touch buttons');
  assert.equal(game.ui.roundNo, 1);
  run(game, 1);
  assert.ok(game.ui.count >= 1 && game.ui.count <= 3, 'a countdown number is showing');
  run(game, 2);
  assert.equal(game.ui.state, 'playing');
  assert.equal(game.ui.count, 0);
});

test('fewer than two players do not start a match', () => {
  const game = new Game({ input: makeInput(), sfx: quiet });
  game.startLocal(setup(bots(1)));
  assert.equal(game.ui.state, 'idle');
});

test('pausing freezes the round and resuming continues it', () => {
  const game = new Game({ input: makeInput(), sfx: quiet });
  game.startLocal(setup(bots(3)));
  run(game, 3);
  const x = game.round.players[0].x;
  game.pause();
  assert.equal(game.ui.paused, true);
  run(game, 2);
  assert.equal(game.round.players[0].x, x, 'nothing moved while paused');
  game.resume();
  assert.equal(game.ui.paused, false);
  run(game, 0.5);
  assert.notEqual(game.round.players[0].x, x);
});

test('a human steers with keys and with the touch buttons', () => {
  const input = makeInput();
  const game = new Game({ input, sfx: quiet });
  game.startLocal(
    setup([{ name: 'Ann', color: '#f00', human: true, keys: ['KeyA', 'KeyD'] }, ...bots(1)]),
  );
  run(game, 3);
  input.dir = 1;
  game.frame(0.05);
  assert.equal(game.round.players[0].input, 1);
  input.dir = 0;
  input.pad = -1;
  game.frame(0.05);
  assert.equal(game.round.players[0].input, -1);
});

test('a bot-only match runs round after round to a winner, and a rematch starts clean', () => {
  const game = new Game({ input: makeInput(), sfx: quiet });
  game.startLocal(setup(bots(2)));
  const seen = new Set();
  for (let i = 0; i < 40000 && game.ui.state !== 'matchEnd'; i++) {
    game.frame(0.1);
    seen.add(game.ui.state);
  }
  assert.equal(game.ui.state, 'matchEnd');
  assert.ok(seen.has('roundEnd'), 'there were round breaks on the way');
  const { champion, rounds } = game.ui.result;
  assert.ok(champion === 0 || champion === 1);
  assert.ok(rounds >= 5, 'a short match is at least 5 rounds');
  const scores = game.ui.players.map((p) => p.score);
  assert.ok(
    scores[champion] >= 5 && scores[champion] - scores[1 - champion] >= 2,
    'target reached with a lead of 2',
  );

  game.rematch();
  assert.equal(game.ui.state, 'countdown');
  assert.deepEqual(
    game.ui.players.map((p) => p.score),
    [0, 0],
  );
  assert.equal(game.ui.result, null);
  game.stop();
  assert.equal(game.ui.state, 'idle');
});

test('a round end shows the winner in the banner, then the next round starts', () => {
  const game = new Game({ input: makeInput(), sfx: quiet });
  game.startLocal(setup(bots(3)));
  for (let i = 0; i < 20000 && game.ui.state !== 'roundEnd'; i++) game.frame(0.1);
  assert.equal(game.ui.state, 'roundEnd');
  assert.ok(game.ui.banner && 'winner' in game.ui.banner);
  assert.equal(game.ui.roundNo, 1);
  run(game, 3);
  assert.equal(game.ui.state, 'countdown');
  assert.equal(game.ui.roundNo, 2);
  assert.equal(game.ui.banner, null);
});

test('the pause button is a local-only thing', () => {
  const game = new Game({ input: makeInput(), sfx: quiet });
  assert.equal(game.canPause(), false, 'not while idle');
  game.startLocal(setup(bots(2)));
  assert.equal(game.canPause(), true);
  game.onlineRound(roundMsg(), 7);
  assert.equal(game.canPause(), false, 'not online: the server keeps running');
});

// ---------- online ----------

function roundMsg(extra = {}) {
  return {
    t: 'round',
    order: [7, 9],
    names: ['Me', 'Them'],
    colors: [0, 5],
    scores: [0, 0],
    target: 5,
    roundNo: 1,
    segs: [],
    ...extra,
  };
}
const player = (x, y, alive = 1) => [x, y, 0, alive, 3, 0];
const snap = (extra = {}) => ({
  t: 's',
  ph: 'p',
  cd: 0,
  p: [player(100, 100), player(300, 200)],
  it: [],
  wr: 0,
  g: [],
  e: [],
  pts: [0, 0],
  n: 0,
  ...extra,
});

test("an online round finds this device's player and follows the server's snapshots", () => {
  const sent = [];
  const input = makeInput();
  const game = new Game({ input, sfx: quiet });
  game.send = (m) => sent.push(m);
  game.onlineRound(roundMsg(), 9);
  assert.equal(game.ui.mode, 'online');
  assert.equal(game.myIndex, 1);
  assert.deepEqual(game.ui.padOwners, [1]);
  assert.deepEqual(
    game.ui.players.map((p) => p.name),
    ['Me', 'Them'],
  );

  game.onlineSnapshot(snap({ ph: 'c', cd: 2 }));
  assert.equal(game.ui.state, 'countdown');
  assert.equal(game.ui.count, 3);
  game.onlineSnapshot(snap({ ph: 'p' }));
  assert.equal(game.ui.state, 'playing');
  assert.equal(game.view.players.length, 2);

  // Input is sent only when it changes.
  input.dir = -1;
  game.frame(0.016);
  game.frame(0.016);
  input.dir = 0;
  game.frame(0.016);
  assert.deepEqual(
    sent.filter((m) => m.t === 'input'),
    [
      { t: 'input', d: -1 },
      { t: 'input', d: 0 },
    ],
  );
  assert.equal(sent.filter((m) => m.t === 'ping').length, 1, 'one ping to measure the round trip');
});

test('an online knockout strikes the player out of the scoreboard', () => {
  const game = new Game({ input: makeInput(), sfx: quiet });
  game.onlineRound(roundMsg(), 7);
  game.onlineSnapshot(snap());
  game.onlineSnapshot(
    snap({ p: [player(100, 100), player(300, 200, 0)], e: [['d', 1, 300, 200]], pts: [1, 0] }),
  );
  assert.equal(game.ui.players[1].out, true);
  assert.equal(game.ui.players[0].score, 1, 'a live point counts at once');
});

test('online round and match ends', () => {
  const game = new Game({ input: makeInput(), sfx: quiet });
  game.onlineRound(roundMsg(), 7);
  game.onlineSnapshot(snap());
  game.onlineRoundEnd({ winner: 0, scores: [1, 0], champion: -1, rounds: 1 });
  assert.equal(game.ui.state, 'roundEnd');
  assert.equal(game.ui.banner.winner, 0);
  game.onlineSnapshot(snap()); // late snapshots do not undo the banner
  assert.equal(game.ui.state, 'roundEnd');

  game.onlineRound(roundMsg({ roundNo: 6, scores: [4, 1] }), 7);
  game.onlineRoundEnd({ winner: 0, scores: [5, 1], champion: 0, rounds: 6 });
  assert.equal(game.ui.state, 'matchEnd');
  assert.deepEqual(game.ui.result, { champion: 0, rounds: 6 });
  game.stop();
  assert.equal(game.ui.state, 'idle');
});

test('an online player who joins mid-round without a seat gets no touch buttons', () => {
  const game = new Game({ input: makeInput(), sfx: quiet });
  game.onlineRound(roundMsg(), 42); // not in the order
  assert.equal(game.myIndex, -1);
  assert.deepEqual(game.ui.padOwners, []);
});

test('listeners hear about changes and can unsubscribe', () => {
  const game = new Game({ input: makeInput(), sfx: quiet });
  let heard = 0;
  const off = game.subscribe(() => heard++);
  game.startLocal(setup(bots(2)));
  assert.ok(heard > 0);
  off();
  const before = heard;
  game.stop();
  assert.equal(heard, before);
});

test('a knockout buzzes only for a human on this device', () => {
  let buzz = 0;
  const haptics = { knockout: () => buzz++ };
  const game = new Game({ input: makeInput(), sfx: quiet, haptics });
  game.onlineRound(roundMsg(), 7); // we are player 0
  game.onlineSnapshot(snap());
  game.onlineSnapshot(snap({ e: [['d', 1, 300, 200]] }));
  assert.equal(buzz, 0, 'a rival going out is not our buzz');
  game.onlineSnapshot(snap({ e: [['d', 0, 100, 100]] }));
  assert.equal(buzz, 1);

  const local = new Game({ input: makeInput(), sfx: quiet, haptics });
  local.startLocal(setup(bots(2)));
  for (let i = 0; i < 20000 && local.ui.state !== 'roundEnd'; i++) local.frame(0.1);
  assert.equal(buzz, 1, 'bots never buzz');
});

test('a finished match is reported once, with whether this device won', () => {
  const ends = [];
  const game = new Game({ input: makeInput(), sfx: quiet });
  game.onMatchEnd = (r) => ends.push(r);
  game.onlineRound(roundMsg(), 9); // we are player 1
  game.onlineRoundEnd({ winner: 0, scores: [1, 0], champion: -1, rounds: 1 });
  assert.deepEqual(ends, [], 'a round is not a match');
  game.onlineRoundEnd({ winner: 0, scores: [5, 1], champion: 0, rounds: 6 });
  assert.deepEqual(ends, [{ won: false }]);

  // Locally there is a "me" only when exactly one human plays.
  const solo = new Game({ input: makeInput(), sfx: quiet });
  solo.startLocal(setup([{ name: 'Ann', color: '#f00', human: true, keys: [] }, ...bots(1)]));
  assert.equal(solo.myPlayer(), 0);
  const two = new Game({ input: makeInput(), sfx: quiet });
  const human = (name) => ({ name, color: '#f00', human: true, keys: [] });
  two.startLocal(setup([human('A'), human('B')]));
  assert.equal(two.myPlayer(), -1);
  const none = new Game({ input: makeInput(), sfx: quiet });
  none.startLocal(setup(bots(2)));
  assert.equal(none.myPlayer(), -1);
});

test('online, our own head is drawn ahead of the server once the round trip is known', () => {
  let clock = 1000;
  const sent = [];
  const game = new Game({ input: makeInput(), sfx: quiet, now: () => clock });
  game.send = (m) => sent.push(m);
  game.onlineRound(roundMsg(), 7); // we are player 0
  game.onlineSnapshot(snap());
  game.frame(0.016);
  assert.equal(game.predictedHead(), null, 'no measurement yet: drawn where the server says');

  const ping = sent.find((m) => m.t === 'ping');
  clock += 80;
  game.onlinePong({ t: 'pong', c: ping.c });
  clock += 500;
  game.onlineSnapshot(snap({ n: 70, g: [[0, 99, 100, 100, 100, 3]] })); // 70 steps = 583 ms later
  const head = game.predictedHead();
  assert.ok(head.x > 100 + 5 && head.x < 100 + 20, 'about a round trip ahead along its heading');
  assert.equal(head.id, 0);
  assert.equal(head.trail, true);

  // In a gap (no trail from the server for a while) the stretch to the head stays empty.
  game.onlineSnapshot(snap({ n: 70 }));
  game.onlineSnapshot(snap({ n: 70 }));
  assert.equal(game.predictedHead().trail, false);

  // Knocked out, or only watching: nothing to predict.
  game.onlineSnapshot(snap({ p: [player(100, 100, 0), player(300, 200)] }));
  assert.equal(game.predictedHead(), null);
});
