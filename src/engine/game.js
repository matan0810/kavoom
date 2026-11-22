// The match state machine, for both local and online play:
//   idle -> countdown -> playing -> roundEnd -> countdown ... -> matchEnd
// Local: this class runs the simulation. Online: the server runs it and this
// class draws the snapshots it sends.
//
// No React and no DOM in here. Components read `game.ui` (a small plain object
// that is replaced whenever something visible changes) through useGameUi(),
// and call the methods below.

import { ARENA, DT, PALETTE, makeRng } from '../../shared/config.js';
import { decodeSegment, decodeSnapshot } from '../../shared/protocol.js';
import { Round } from '../../shared/sim/round.js';
import { Match } from '../../shared/sim/match.js';
import { Renderer } from './renderer.js';
import { Predictor } from './prediction.js';

const ONLINE_KEYS = [
  ['ArrowLeft', 'ArrowRight'],
  ['KeyA', 'KeyD'],
];
const PING_EVERY_MS = 2000; // how often the round trip to the server is measured
const MAX_PADS = 4; // pairs of touch buttons that fit on one screen
const COUNTDOWN_SECONDS = 2.4; // "3, 2, 1" before a round
const COUNT_STEP = 0.8; // seconds each countdown number stays up
const ROUND_BREAK_SECONDS = 2.8; // pause between rounds

export class Game {
  // now: the clock, in ms. Tests pass their own.
  constructor({ input, sfx, haptics = null, now = () => performance.now() }) {
    this.now = now;
    this.predictor = new Predictor(); // online: heads drawn ahead of the server, see prediction.js
    this.lastPing = -Infinity;
    this.trailAge = new Map(); // player id -> snapshots since the server last drew trail for them
    this.input = input;
    this.sfx = sfx;
    this.haptics = haptics;
    this.onMatchEnd = null; // called with { won } when a match that has a "me" ends
    this.renderer = new Renderer(ARENA.w, ARENA.h);
    this.listeners = new Set();

    this.state = 'idle';
    this.mode = 'local';
    this.paused = false;
    this.setup = null; // local match: { players, botLevel, powerups, length }
    this.match = null;
    this.round = null;
    this.view = null; // what the renderer draws: a Round, or a snapshot shaped like one
    this.hud = { names: [], colors: [], scores: [], live: null, target: 0, lead: 2, roundNo: 1 };
    this.acc = 0;
    this.timer = 0;
    this.count = 0; // countdown number on screen, 0 for none
    this.banner = null; // { winner } between rounds
    this.result = null; // { champion, rounds } when the match is over

    this.send = null; // online: function that sends a message to the server
    this.myIndex = -1; // online: this device's player, or -1 when watching
    this.lastDir = 0;
    this.draw = null;

    this.ui = this.snapshot();
  }

  // ---------- What the components see ----------

  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getUi = () => this.ui;

  publish() {
    this.ui = this.snapshot();
    for (const fn of this.listeners) fn();
  }

  snapshot() {
    const { hud, state, view } = this;
    const live = state === 'playing' || state === 'countdown' ? hud.live : null;
    let padOwners = [];
    if (this.mode === 'online') padOwners = this.myIndex >= 0 ? [this.myIndex] : [];
    else if (this.setup)
      padOwners = this.setup.players
        .map((p, i) => (p.human ? i : -1))
        .filter((i) => i >= 0)
        .slice(0, MAX_PADS);
    return {
      state,
      mode: this.mode,
      paused: this.paused,
      roundNo: hud.roundNo,
      target: hud.target,
      lead: hud.lead,
      count: this.count,
      banner: this.banner,
      result: this.result,
      padOwners,
      players: hud.names.map((name, i) => ({
        index: i,
        name,
        color: hud.colors[i],
        score: hud.scores[i] + (live ? live[i] || 0 : 0),
        out: state === 'playing' && !!view && !!view.players[i] && !view.players[i].alive,
        gone: !!hud.gone && hud.gone.has(i), // left the online match; their line is out for good
      })),
    };
  }

  // ---------- Local match ----------

  // setup: { players: [{ name, color, human, keys }], botLevel, powerups, target, lead }
  startLocal(setup) {
    if (setup.players.length < 2) return;
    this.setup = setup;
    this.mode = 'local';
    this.match = new Match(setup.players.length, setup.target, setup.lead);
    this.hud = {
      names: setup.players.map((p) => p.name),
      colors: setup.players.map((p) => p.color),
      scores: this.match.scores,
      live: null,
      target: this.match.target,
      lead: this.match.lead,
      roundNo: 1,
    };
    this.startRound();
  }

  rematch() {
    if (this.setup) this.startLocal(this.setup);
  }

  startRound() {
    const { setup, renderer, sfx } = this;
    renderer.reset(this.hud.colors);
    const draw = renderer.hooks();
    this.round = new Round({
      w: ARENA.w,
      h: ARENA.h,
      players: setup.players.map((p) => ({ bot: p.human ? null : setup.botLevel })),
      rng: makeRng((Math.random() * 2 ** 32) >>> 0),
      powerups: setup.powerups,
      hooks: {
        segment: draw.segment,
        death: (p) => {
          draw.death(p);
          sfx.death();
          if (setup.players[p.id].human) this.haptics?.knockout();
          this.publish();
        },
        pickup: (p, it) => {
          draw.pickup(p, it);
          sfx.pickup();
        },
        clear: () => {
          draw.clear();
          sfx.clear();
        },
      },
    });
    this.view = this.round;
    this.hud.live = this.round.points;
    this.hud.roundNo = this.match.roundNo + 1;
    this.state = 'countdown';
    this.paused = false;
    this.timer = COUNTDOWN_SECONDS;
    this.count = 0;
    this.acc = 0;
    this.banner = null;
    this.result = null;
    this.publish();
  }

  canPause() {
    return this.mode === 'local' && ['countdown', 'playing', 'roundEnd'].includes(this.state);
  }

  pause() {
    if (!this.canPause() || this.paused) return;
    this.paused = true;
    this.publish();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.publish();
  }

  // Back to the menu (or, online, back to the room).
  stop() {
    this.state = 'idle';
    this.paused = false;
    this.round = null;
    this.view = null;
    this.count = 0;
    this.banner = null;
    this.result = null;
    this.publish();
  }

  stepLocal(dt) {
    const { input, setup, round } = this;
    if (this.state === 'countdown') {
      this.timer -= dt;
      this.showCount(this.timer);
      if (this.timer <= 0) {
        this.count = 0;
        this.state = 'playing';
        this.sfx.go();
        this.publish();
      }
    } else if (this.state === 'playing') {
      const humans = setup.players.filter((p) => p.human).length;
      const touch = humans === 1 ? input.touchDir() : 0; // half-screen touch only makes sense for one player
      setup.players.forEach((p, i) => {
        if (p.human) round.players[i].input = input.keys(p.keys) || input.padDir(i) || touch;
      });
      this.acc += dt;
      while (this.acc >= DT && !round.over) {
        round.step();
        this.acc -= DT;
      }
      if (round.over) {
        this.match.applyRound(round.points);
        this.finishRound(round.winner, this.match.winner(), this.match.roundNo);
      }
    } else if (this.state === 'roundEnd') {
      this.timer -= dt;
      if (this.timer <= 0) this.startRound();
    }
  }

  // ---------- Online match (messages from the server) ----------

  onlineRound(m, you) {
    this.mode = 'online';
    this.myIndex = m.order.indexOf(you);
    this.lastDir = 0;
    this.predictor.reset();
    this.trailAge.clear();
    this.hud = {
      names: m.names,
      colors: m.colors.map((c) => PALETTE[c].hex),
      scores: m.scores,
      live: m.order.map(() => 0),
      target: m.target,
      lead: m.lead ?? 2, // a server from before this setting always played to a lead of 2
      roundNo: m.roundNo,
      gone: new Set(m.gone || []),
    };
    this.renderer.reset(this.hud.colors);
    this.draw = this.renderer.hooks();
    this.view = { players: [], items: [], wrap: 0 };
    for (const seg of m.segs) this.draw.segment(...decodeSegment(seg)); // trails drawn before we joined
    this.state = 'countdown';
    this.count = 0;
    this.paused = false;
    this.banner = null;
    this.result = null;
    this.publish();
  }

  onlineSnapshot(m) {
    const { view, draw, sfx } = this;
    if (this.mode !== 'online' || !view || this.state === 'idle' || this.state === 'matchEnd')
      return;
    if (m.p.length !== this.hud.names.length) return; // not this round's players: ignored
    const snap = decodeSnapshot(m);
    const first = view.players.length === 0;
    view.players = snap.players;
    view.items = snap.items;
    view.wrap = snap.wrap;
    this.hud.live = snap.points;

    const serverMs = snap.step * DT * 1000;
    this.predictor.addSnapshot(
      snap.players,
      this.myIndex,
      snap.wrap,
      !snap.countingDown,
      this.now(),
      serverMs,
    );
    const drew = new Set(snap.segments.map(([player]) => player.id));
    for (const p of snap.players) {
      this.trailAge.set(p.id, drew.has(p.id) ? 0 : (this.trailAge.get(p.id) ?? 0) + 1);
    }

    for (const seg of snap.segments) draw.segment(...seg);
    let died = false;
    for (const e of snap.events) {
      if (e.type === 'death') {
        draw.death(e.player);
        sfx.death();
        if (e.player.id === this.myIndex) this.haptics?.knockout();
        died = true;
      } else if (e.type === 'pickup') {
        draw.pickup(e.player, e.item);
        sfx.pickup();
      } else {
        draw.clear();
        sfx.clear();
      }
    }

    if (snap.countingDown) {
      this.state = 'countdown';
      this.showCount(snap.countdown);
    } else if (this.state === 'countdown') {
      this.state = 'playing';
      this.count = 0;
      sfx.go();
      this.publish();
      return;
    } else if (this.state === 'roundEnd') {
      return; // a late snapshot must not undo the round banner
    }
    if (died || first) this.publish();
  }

  // A player left the match and their line is out of the game for good.
  onlineGone(m) {
    if (this.mode !== 'online' || !this.hud.gone || m.i >= this.hud.names.length) return;
    this.hud.gone.add(m.i);
    this.publish();
  }

  onlineRoundEnd(m) {
    if (this.mode !== 'online' || this.state === 'idle') return;
    if (m.scores.length !== this.hud.names.length) return; // not this match's players
    this.hud.scores = m.scores;
    this.finishRound(m.winner, m.champion, m.rounds);
  }

  sendInput() {
    if (this.myIndex < 0 || !this.send) return;
    const { input } = this;
    const dir =
      input.keys(ONLINE_KEYS[0]) ||
      input.keys(ONLINE_KEYS[1]) ||
      input.padDir(this.myIndex) ||
      input.touchDir();
    if (dir === this.lastDir) return;
    this.lastDir = dir;
    this.predictor.addInput(dir, this.now());
    this.send({ t: 'input', d: dir });
  }

  // The round trip to the server is measured with a ping every couple of seconds.
  sendPing() {
    const now = this.now();
    if (!this.send || now - this.lastPing < PING_EVERY_MS) return;
    this.lastPing = now;
    this.send({ t: 'ping', c: now });
  }

  onlinePong(m) {
    this.predictor.addRttSample(this.now() - m.c);
  }

  // Every living head drawn at the same moment: ours where it will be once our
  // input reaches the server, the others moved on by the same time. Empty to
  // draw them where the server last saw them. See prediction.js.
  predictedHeads() {
    if (this.mode !== 'online' || this.state !== 'playing' || !this.view) return [];
    return this.predictor.predictAll(this.now()).flatMap((guess) => {
      const p = this.view.players[guess.id];
      if (!p || !p.alive) return [];
      // No trail lately means a gap or the ghost effect: then the way there stays empty too.
      return [{ ...guess, r: p.r, trail: this.trailAge.get(guess.id) <= 1 }];
    });
  }

  // Our own predicted head only, or null.
  predictedHead() {
    return this.predictedHeads().find((h) => h.id === this.myIndex) || null;
  }

  // ---------- Shared ----------

  showCount(left) {
    const n = Math.ceil(left / COUNT_STEP);
    if (n === this.count || n <= 0) return;
    this.count = n;
    this.sfx.tick();
    this.publish();
  }

  // Round is over. winner and champion are player indexes, or -1.
  finishRound(winner, champion, rounds) {
    this.count = 0;
    if (champion >= 0) {
      this.state = 'matchEnd';
      this.result = { champion, rounds };
      this.sfx.win();
      const me = this.myPlayer();
      if (me >= 0 && this.onMatchEnd) this.onMatchEnd({ won: champion === me });
    } else {
      this.state = 'roundEnd';
      this.timer = ROUND_BREAK_SECONDS;
      this.banner = { winner };
      this.sfx.round();
    }
    this.publish();
  }

  // The one player this device plays as, or -1: online that is our seat, locally
  // it is the human when there is exactly one (with two on a device, nobody is "me").
  myPlayer() {
    if (this.mode === 'online') return this.myIndex;
    const humans = this.setup.players.map((p, i) => (p.human ? i : -1)).filter((i) => i >= 0);
    return humans.length === 1 ? humans[0] : -1;
  }

  // True when the key is one a player steers with, so the page should not scroll on it.
  isSteeringKey(code) {
    if (this.mode === 'online') return ONLINE_KEYS.flat().includes(code);
    return !!this.setup && this.setup.players.some((p) => p.human && p.keys.includes(code));
  }

  // Called once per animation frame while the game screen is showing.
  frame(dt) {
    if (this.state === 'idle') return;
    if (this.mode === 'online') {
      this.sendInput();
      this.sendPing();
    } else if (!this.paused) this.stepLocal(dt);
    this.renderer.draw(this.view, {
      dt: this.paused ? 0 : dt,
      intro: this.state === 'countdown',
      names: this.hud.names,
      predicted: this.predictedHeads(),
    });
  }
}
