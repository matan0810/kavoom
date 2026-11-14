// One online room: lobby, then a match that the server simulates and broadcasts.
// No sockets here. Each member has a send(string) function, so the room can be
// tested with plain arrays standing in for connections.

import { randomUUID } from 'node:crypto';
import { ARENA, DT, LENGTHS, PALETTE, BOT_LEVELS, MAX_PLAYERS, makeRng } from '../shared/config.js';
import { encodeEvent, encodeSnapshot, round1 } from '../shared/protocol.js';
import { Round } from '../shared/sim/round.js';
import { Match } from '../shared/sim/match.js';

const COUNTDOWN = 2.4;
const ROUND_PAUSE = 3;
const MAX_STEPS_PER_TICK = 8;
const SETTINGS = { length: Object.keys(LENGTHS), powerups: ['on', 'off'], botLevel: Object.keys(BOT_LEVELS) };

// Control characters, angle brackets, and the invisible characters that can
// reorder or hide text (so a name cannot be made to look like another one).
const UNSAFE_IN_NAME = /[\u0000-\u001f\u007f-\u009f<>\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;
const NAME_LENGTH = 10;

export function cleanName(name) {
  const text = typeof name === 'string' ? name : '';
  // Array.from counts whole characters, so an emoji is never cut in half.
  const s = Array.from(text.replace(UNSAFE_IN_NAME, '').trim()).slice(0, NAME_LENGTH).join('').trim();
  return s || 'Player';
}

export class Room {
  constructor(code, seed = (Math.random() * 2 ** 32) >>> 0) {
    this.code = code;
    this.rng = makeRng(seed);
    this.members = [];
    this.nextId = 1;
    this.hostId = 0;
    this.settings = { length: 'normal', powerups: 'on', botLevel: 'medium' };
    this.state = 'lobby'; // 'lobby' | 'match'
    this.phase = null; // 'countdown' | 'playing' | 'roundEnd'
    this.emptyFor = 0;
    this.order = [];
    this.match = null;
    this.round = null;
  }

  // ---------- membership ----------

  freeColor(pref) {
    const taken = new Set(this.members.map((m) => m.color));
    if (Number.isInteger(pref) && pref >= 0 && pref < PALETTE.length && !taken.has(pref)) return pref;
    for (let i = 0; i < PALETTE.length; i++) if (!taken.has(i)) return i;
    return 0;
  }

  add(name, color, send) {
    if (this.members.length >= MAX_PLAYERS) return null;
    const m = {
      id: this.nextId++,
      name: cleanName(name),
      color: this.freeColor(color),
      bot: false,
      connected: true,
      token: randomUUID(),
      send,
      input: 0,
    };
    this.members.push(m);
    this.pickHost();
    m.send(JSON.stringify({ t: 'joined', code: this.code, you: m.id, token: m.token }));
    this.broadcast(this.info());
    if (this.state === 'match') m.send(JSON.stringify(this.roundMsg(true)));
    return m;
  }

  addBot() {
    if (this.members.length >= MAX_PLAYERS) return;
    const n = this.members.filter((m) => m.bot).length + 1;
    this.members.push({ id: this.nextId++, name: `BOT ${n}`, color: this.freeColor(-1), bot: true, connected: true, token: null, send: null, input: 0 });
  }

  remove(id) {
    const m = this.members.find((x) => x.id === id);
    if (!m) return;
    m.connected = false;
    m.send = null;
    this.members = this.members.filter((x) => x !== m);
    this.pickHost();
    this.broadcast(this.info());
  }

  // A dropped connection. In the lobby the seat is freed; during a match it is
  // kept and a bot steers the line until the player comes back.
  // `send` is the connection that dropped. If the member has since come back on
  // a newer connection, the old one closing must not throw them out.
  disconnect(id, send) {
    const m = this.members.find((x) => x.id === id);
    if (!m || (send && m.send !== send)) return;
    if (this.state === 'lobby') return this.remove(id);
    m.connected = false;
    m.send = null;
    m.input = 0;
    this.pickHost();
    this.broadcast(this.info());
  }

  reconnect(token, send) {
    const m = this.members.find((x) => x.token === token && !x.bot);
    if (!m) return null;
    m.connected = true;
    m.send = send;
    m.input = 0;
    this.pickHost();
    m.send(JSON.stringify({ t: 'joined', code: this.code, you: m.id, token: m.token }));
    this.broadcast(this.info());
    if (this.state === 'match') m.send(JSON.stringify(this.roundMsg(true)));
    return m;
  }

  humans() {
    return this.members.filter((m) => !m.bot && m.connected);
  }

  pickHost() {
    const host = this.members.find((m) => m.id === this.hostId);
    if (host && host.connected && !host.bot) return;
    const next = this.humans()[0];
    this.hostId = next ? next.id : 0;
  }

  info() {
    return {
      t: 'room',
      code: this.code,
      host: this.hostId,
      state: this.state,
      settings: this.settings,
      members: this.members.map((m) => ({ id: m.id, name: m.name, color: m.color, bot: m.bot, on: m.connected })),
    };
  }

  broadcast(msg) {
    const s = JSON.stringify(msg);
    for (const m of this.members) if (m.send) m.send(s);
  }

  // ---------- messages from clients ----------

  handle(id, msg) {
    const m = this.members.find((x) => x.id === id);
    if (!m) return;
    const host = id === this.hostId;
    const lobby = this.state === 'lobby';
    switch (msg.t) {
      case 'input':
        m.input = msg.d === 1 ? 1 : msg.d === -1 ? -1 : 0;
        return;
      case 'name':
        m.name = cleanName(msg.name);
        break;
      case 'color':
        if (this.freeColor(msg.color) !== msg.color) return;
        m.color = msg.color;
        break;
      case 'set':
        if (!host || !lobby || !Object.hasOwn(SETTINGS, msg.key) || !SETTINGS[msg.key].includes(msg.val)) return;
        this.settings[msg.key] = msg.val;
        break;
      case 'addBot':
        if (!host || !lobby) return;
        this.addBot();
        break;
      case 'removeBot': {
        const bot = this.members.find((x) => x.id === msg.id && x.bot);
        if (!host || !lobby || !bot) return;
        this.members = this.members.filter((x) => x !== bot);
        break;
      }
      case 'start':
        if (!host || !lobby || this.members.length < 2) return;
        this.start();
        return;
      case 'leave':
        this.remove(id);
        return;
      default:
        return;
    }
    this.broadcast(this.info());
  }

  // ---------- match ----------

  start() {
    this.order = this.members.map((m) => ({ id: m.id, name: m.name, color: m.color, bot: m.bot, m }));
    this.match = new Match(this.order.length, LENGTHS[this.settings.length]);
    this.state = 'match';
    this.broadcast(this.info());
    this.startRound();
  }

  startRound() {
    this.pending = [];
    this.events = [];
    this.segLog = [];
    this.round = new Round({
      w: ARENA.w,
      h: ARENA.h,
      players: this.order.map((e) => ({ bot: e.bot ? this.settings.botLevel : null })),
      rng: this.rng,
      powerups: this.settings.powerups === 'on',
      hooks: {
        segment: (p, x0, y0, x1, y1, r) => this.addSegment(p.id, round1(x0), round1(y0), round1(x1), round1(y1), r),
        death: (p) => this.events.push(encodeEvent.death(p)),
        pickup: (p, it) => this.events.push(encodeEvent.pickup(p, it)),
        clear: () => {
          this.events.push(encodeEvent.clear());
          this.pending = [];
          this.segLog = [];
        },
      },
    });
    this.phase = 'countdown';
    this.timer = COUNTDOWN;
    this.acc = 0;
    this.ticks = 0;
    this.broadcast(this.roundMsg(false));
    this.broadcast(this.snapshot());
  }

  // Consecutive pieces of the same line are merged into one segment per snapshot.
  addSegment(id, x0, y0, x1, y1, r) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const s = this.pending[i];
      if (s[0] !== id) continue;
      if (s[3] === x0 && s[4] === y0 && s[5] === r) {
        s[3] = x1;
        s[4] = y1;
        return;
      }
      break;
    }
    this.pending.push([id, x0, y0, x1, y1, r]);
  }

  roundMsg(withLog) {
    return {
      t: 'round',
      order: this.order.map((e) => e.id),
      names: this.order.map((e) => e.name),
      colors: this.order.map((e) => e.color),
      scores: this.match.scores,
      target: this.match.target,
      roundNo: this.match.roundNo + 1,
      segs: withLog ? this.segLog : [],
    };
  }

  // Everything that changed since the last snapshot. The segments move to the
  // round's log, which is replayed to anyone who joins mid-round.
  snapshot() {
    const msg = encodeSnapshot(this.round, {
      countingDown: this.phase === 'countdown',
      countdown: this.timer,
      segments: this.pending,
      events: this.events,
    });
    for (const s of this.pending) this.segLog.push(s);
    this.pending = [];
    this.events = [];
    return msg;
  }

  tick(dt) {
    this.emptyFor = this.humans().length ? 0 : this.emptyFor + dt;
    if (this.state !== 'match') return;
    this.ticks++;
    if (this.phase === 'countdown') {
      this.timer -= dt;
      if (this.timer <= 0) this.phase = 'playing';
      if (this.ticks % 6 === 0 || this.phase === 'playing') this.broadcast(this.snapshot());
    } else if (this.phase === 'playing') {
      const r = this.round;
      this.order.forEach((e, i) => {
        if (e.bot) return;
        const p = r.players[i];
        if (e.m.connected) {
          p.bot = null;
          p.input = e.m.input;
        } else {
          p.bot = BOT_LEVELS.medium; // stand-in while the player is away
        }
      });
      this.acc += dt;
      let n = 0;
      while (this.acc >= DT && n < MAX_STEPS_PER_TICK && !r.over) {
        r.step();
        this.acc -= DT;
        n++;
      }
      if (n === MAX_STEPS_PER_TICK) this.acc = 0;
      this.broadcast(this.snapshot());
      if (r.over) this.endRound();
    } else if (this.phase === 'roundEnd') {
      this.timer -= dt;
      if (this.timer <= 0) this.startRound();
    }
  }

  endRound() {
    this.match.applyRound(this.round.points);
    const champion = this.match.winner();
    this.broadcast({ t: 'roundEnd', winner: this.round.winner, scores: this.match.scores, champion, rounds: this.match.roundNo });
    if (champion < 0) {
      this.phase = 'roundEnd';
      this.timer = ROUND_PAUSE;
      return;
    }
    this.state = 'lobby';
    this.phase = null;
    this.members = this.members.filter((m) => m.connected);
    this.pickHost();
    this.broadcast(this.info());
  }
}
