// The match state machine, for both local and online play:
//   idle -> countdown -> playing -> roundEnd -> countdown ... -> matchEnd
// Local: this class runs the simulation. Online: the server runs it and this
// class draws the snapshots it sends.
//
// No React and no DOM in here. Components read `game.ui` (a small plain object
// that is replaced whenever something visible changes) through useGameUi(),
// and call the methods below.

import { ARENA, DT, PALETTE, POWERUPS, FX_KEYS, LENGTHS, makeRng } from '../../shared/config.js';
import { Round } from '../../shared/sim/round.js';
import { Match } from '../../shared/sim/match.js';
import { Renderer } from './renderer.js';

const ONLINE_KEYS = [['ArrowLeft', 'ArrowRight'], ['KeyA', 'KeyD']];
const NO_FX = Object.fromEntries(FX_KEYS.map((k) => [k, 0]));
const MAX_PADS = 4;

export class Game {
  constructor({ input, sfx }) {
    this.input = input;
    this.sfx = sfx;
    this.renderer = new Renderer(ARENA.w, ARENA.h);
    this.listeners = new Set();

    this.state = 'idle';
    this.mode = 'local';
    this.paused = false;
    this.setup = null; // local match: { players, botLevel, powerups, length }
    this.match = null;
    this.round = null;
    this.view = null; // what the renderer draws: a Round, or a snapshot shaped like one
    this.hud = { names: [], colors: [], scores: [], live: null, target: 0, roundNo: 1 };
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
    else if (this.setup) padOwners = this.setup.players.map((p, i) => (p.human ? i : -1)).filter((i) => i >= 0).slice(0, MAX_PADS);
    return {
      state,
      mode: this.mode,
      paused: this.paused,
      roundNo: hud.roundNo,
      target: hud.target,
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
      })),
    };
  }

  // ---------- Local match ----------

  // setup: { players: [{ name, color, human, keys }], botLevel, powerups, length }
  startLocal(setup) {
    if (setup.players.length < 2) return;
    this.setup = setup;
    this.mode = 'local';
    this.match = new Match(setup.players.length, LENGTHS[setup.length]);
    this.hud = {
      names: setup.players.map((p) => p.name),
      colors: setup.players.map((p) => p.color),
      scores: this.match.scores,
      live: null,
      target: this.match.target,
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
    this.timer = 2.4;
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
    this.hud = {
      names: m.names,
      colors: m.colors.map((c) => PALETTE[c].hex),
      scores: m.scores,
      live: m.order.map(() => 0),
      target: m.target,
      roundNo: m.roundNo,
    };
    this.renderer.reset(this.hud.colors);
    this.draw = this.renderer.hooks();
    this.view = { players: [], items: [], wrap: 0 };
    for (const g of m.segs) this.draw.segment({ id: g[0] }, g[1], g[2], g[3], g[4], g[5]);
    this.state = 'countdown';
    this.count = 0;
    this.paused = false;
    this.banner = null;
    this.result = null;
    this.publish();
  }

  onlineSnapshot(m) {
    const { view, draw, sfx } = this;
    if (this.mode !== 'online' || !view || this.state === 'idle' || this.state === 'matchEnd') return;
    const first = view.players.length === 0;
    view.players = m.p.map((a, id) => ({
      id, x: a[0], y: a[1], angle: a[2], alive: !!a[3], r: a[4],
      fx: a[5] ? Object.fromEntries(FX_KEYS.map((k, i) => [k, a[5][i]])) : NO_FX,
    }));
    view.items = m.it.map((a) => ({ def: POWERUPS[a[0]], x: a[1], y: a[2], life: a[3] }));
    view.wrap = m.wr;
    for (const g of m.g) draw.segment({ id: g[0] }, g[1], g[2], g[3], g[4], g[5]);
    let died = false;
    for (const e of m.e) {
      if (e[0] === 'd') {
        draw.death({ id: e[1], x: e[2], y: e[3] });
        sfx.death();
        died = true;
      } else if (e[0] === 'k') {
        draw.pickup({ id: e[1] }, { x: e[2], y: e[3], def: POWERUPS[e[4]] });
        sfx.pickup();
      } else if (e[0] === 'c') {
        draw.clear();
        sfx.clear();
      }
    }
    this.hud.live = m.pts;
    if (m.ph === 'c') {
      this.state = 'countdown';
      this.showCount(m.cd);
    } else if (this.state === 'countdown') {
      this.state = 'playing';
      this.count = 0;
      sfx.go();
      this.publish();
      return;
    } else if (this.state === 'roundEnd') {
      return;
    }
    if (died || first) this.publish();
  }

  onlineRoundEnd(m) {
    if (this.mode !== 'online' || this.state === 'idle') return;
    this.hud.scores = m.scores;
    this.finishRound(m.winner, m.champion, m.rounds);
  }

  sendInput() {
    if (this.myIndex < 0 || !this.send) return;
    const { input } = this;
    const dir = input.keys(ONLINE_KEYS[0]) || input.keys(ONLINE_KEYS[1]) || input.padDir(this.myIndex) || input.touchDir();
    if (dir === this.lastDir) return;
    this.lastDir = dir;
    this.send({ t: 'input', d: dir });
  }

  // ---------- Shared ----------

  showCount(left) {
    const n = Math.ceil(left / 0.8);
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
    } else {
      this.state = 'roundEnd';
      this.timer = 2.8;
      this.banner = { winner };
      this.sfx.round();
    }
    this.publish();
  }

  // True when the key is one a player steers with, so the page should not scroll on it.
  isSteeringKey(code) {
    if (this.mode === 'online') return ONLINE_KEYS.flat().includes(code);
    return !!this.setup && this.setup.players.some((p) => p.human && p.keys.includes(code));
  }

  // Called once per animation frame while the game screen is showing.
  frame(dt) {
    if (this.state === 'idle') return;
    if (this.mode === 'online') this.sendInput();
    else if (!this.paused) this.stepLocal(dt);
    this.renderer.draw(this.view, { dt: this.paused ? 0 : dt, intro: this.state === 'countdown', names: this.hud.names });
  }
}
