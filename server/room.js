// One online room: lobby, then a match that the server simulates and broadcasts.
// No sockets here. Each member has a send(string) function, so the room can be
// tested with plain arrays standing in for connections.

import { randomUUID } from 'node:crypto';
import {
  ARENA,
  DT,
  LENGTH_CHOICES,
  DEFAULT_CUSTOM_TARGET,
  PALETTE,
  BOT_LEVELS,
  MAX_PLAYERS,
  clampTarget,
  leadFor,
  makeRng,
  matchTarget,
} from '../shared/config.js';
import { encodeEvent, encodeSnapshot, round1 } from '../shared/protocol.js';
import { Round } from '../shared/sim/round.js';
import { Match } from '../shared/sim/match.js';

const COUNTDOWN = 2.4;
const ROUND_PAUSE = 3;
const MAX_STEPS_PER_TICK = 8;
const SETTINGS = {
  length: LENGTH_CHOICES,
  winBy2: ['on', 'off'],
  powerups: ['on', 'off'],
  botLevel: Object.keys(BOT_LEVELS),
  locked: ['off', 'on'], // a locked room takes no new players
  leavers: ['bot', 'out'], // a player who leaves a match: a bot plays on, or the line leaves
};
const AUTO_START = 10; // seconds a public room waits once two people are in it
// A player whose connection drops keeps their seat this long, in the lobby too,
// so a locked phone or a change of network does not cost them their place.
export const SEAT_GRACE = 60;
// The host keeps the role this long while away, then it passes to someone present.
export const HOST_GRACE = 30;

// Control characters, angle brackets, and the invisible characters that can
// reorder or hide text (so a name cannot be made to look like another one).
const UNSAFE_IN_NAME =
  // eslint-disable-next-line no-control-regex -- control characters are exactly what this removes
  /[\u0000-\u001f\u007f-\u009f<>\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;
const NAME_LENGTH = 10;

export function cleanName(name) {
  const text = typeof name === 'string' ? name : '';
  // Array.from counts whole characters, so an emoji is never cut in half.
  const s = Array.from(text.replace(UNSAFE_IN_NAME, '').trim())
    .slice(0, NAME_LENGTH)
    .join('')
    .trim();
  return s || 'Player';
}

export class Room {
  // A public room is one that "quick game" puts strangers into. Nobody there is
  // waiting for a friend, so it starts by itself once two people are in.
  constructor(code, seed = (Math.random() * 2 ** 32) >>> 0, { isPublic = false } = {}) {
    this.code = code;
    this.public = isPublic;
    this.autoStart = null; // seconds until a public room starts, or null
    this.rng = makeRng(seed);
    this.members = [];
    this.nextId = 1;
    this.hostId = 0;
    this.settings = {
      length: 'normal',
      target: DEFAULT_CUSTOM_TARGET, // used when length is 'custom'
      winBy2: 'on',
      powerups: 'on',
      botLevel: 'medium',
      locked: 'off',
      leavers: 'bot',
    };
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
    if (Number.isInteger(pref) && pref >= 0 && pref < PALETTE.length && !taken.has(pref))
      return pref;
    for (let i = 0; i < PALETTE.length; i++) if (!taken.has(i)) return i;
    return 0;
  }

  // Why a newcomer cannot come in right now ('full' or 'locked'), or null if they can.
  refusal() {
    if (this.members.length >= MAX_PLAYERS) return 'full';
    if (this.settings.locked === 'on') return 'locked';
    return null;
  }

  add(name, color, send) {
    if (this.refusal()) return null;
    const m = {
      id: this.nextId++,
      name: cleanName(name),
      color: this.freeColor(color),
      bot: false,
      connected: true,
      away: 0, // seconds since the connection dropped; only counts while not connected
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
    this.members.push({
      id: this.nextId++,
      name: `BOT ${n}`,
      color: this.freeColor(-1),
      bot: true,
      connected: true,
      token: null,
      send: null,
      input: 0,
    });
  }

  remove(id) {
    const m = this.members.find((x) => x.id === id);
    if (!m) return;
    this.takeOut(m);
    m.connected = false;
    m.send = null;
    this.members = this.members.filter((x) => x !== m);
    this.pickHost();
    this.broadcast(this.info());
  }

  // A dropped connection. The seat is kept for SEAT_GRACE seconds, shown as
  // away; during a match a bot steers the line until the player comes back.
  // `send` is the connection that dropped. If the member has since come back on
  // a newer connection, the old one closing must not throw them out.
  disconnect(id, send) {
    const m = this.members.find((x) => x.id === id);
    if (!m || (send && m.send !== send)) return;
    m.connected = false;
    m.away = 0;
    m.send = null;
    m.input = 0;
    this.broadcast(this.info());
  }

  reconnect(token, send) {
    const m = this.members.find((x) => x.token === token && !x.bot);
    if (!m) return null;
    m.connected = true;
    m.away = 0;
    m.send = send;
    m.input = 0;
    this.pickHost();
    m.send(JSON.stringify({ t: 'joined', code: this.code, you: m.id, token: m.token }));
    this.broadcast(this.info());
    if (this.state === 'match') m.send(JSON.stringify(this.roundMsg(true)));
    return m;
  }

  // People who are here right now.
  humans() {
    return this.members.filter((m) => !m.bot && m.connected);
  }

  // True once no person holds a seat, not even one who is away: nobody can come back.
  abandoned() {
    return this.members.every((m) => m.bot);
  }

  // The host stays host through a short drop. After HOST_GRACE seconds away, or
  // once gone, the role passes to whoever has been in the room longest.
  pickHost() {
    const host = this.members.find((m) => m.id === this.hostId);
    if (host && !host.bot && (host.connected || host.away < HOST_GRACE)) return;
    const next = this.humans()[0];
    if (next) this.hostId = next.id;
    else if (!host) this.hostId = 0;
  }

  // Count time away, free the seats of those away too long (in the lobby), and
  // hand over the host role when its holder has been away too long.
  tickAway(dt) {
    let changed = false;
    for (const m of this.members) {
      if (m.bot || m.connected) continue;
      const before = m.away;
      m.away += dt;
      if (before < HOST_GRACE && m.away >= HOST_GRACE) changed = true;
      if (before < SEAT_GRACE && m.away >= SEAT_GRACE) this.takeOut(m); // gone for good
    }
    if (this.state === 'lobby') {
      const kept = this.members.filter((m) => m.bot || m.connected || m.away < SEAT_GRACE);
      if (kept.length !== this.members.length) {
        this.members = kept;
        changed = true;
      }
    }
    if (!changed) return;
    this.pickHost();
    this.broadcast(this.info());
  }

  info() {
    return {
      t: 'room',
      code: this.code,
      host: this.hostId,
      state: this.state,
      public: this.public,
      startsIn: this.autoStart === null ? 0 : Math.ceil(this.autoStart),
      settings: this.settings,
      members: this.members.map((m) => ({
        id: m.id,
        name: m.name,
        color: m.color,
        bot: m.bot,
        on: m.connected,
      })),
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
      case 'ping':
        // Echoed straight back: the browser measures the round trip with it.
        if (m.send) m.send(JSON.stringify({ t: 'pong', c: Number.isFinite(msg.c) ? msg.c : 0 }));
        return;
      case 'name':
        m.name = cleanName(msg.name);
        break;
      case 'color':
        if (this.freeColor(msg.color) !== msg.color) return;
        m.color = msg.color;
        break;
      case 'set':
        if (!host || !lobby) return;
        if (msg.key === 'target') {
          // The one number a host can type: any number is accepted, then clamped.
          if (!Number.isFinite(msg.val)) return;
          this.settings.target = clampTarget(msg.val);
        } else if (
          Object.hasOwn(SETTINGS, msg.key) &&
          SETTINGS[msg.key].includes(msg.val) &&
          !(msg.key === 'locked' && this.public)
        ) {
          this.settings[msg.key] = msg.val;
        } else return;
        break;
      case 'addBot':
        if (!host || !lobby) return;
        this.addBot();
        break;
      case 'renameBot': {
        const bot = this.members.find((x) => x.id === msg.id && x.bot);
        if (!host || !lobby || !bot) return;
        bot.name = cleanName(msg.name);
        break;
      }
      case 'removeBot': {
        const bot = this.members.find((x) => x.id === msg.id && x.bot);
        if (!host || !lobby || !bot) return;
        this.members = this.members.filter((x) => x !== bot);
        break;
      }
      case 'kick': {
        const target = this.members.find((x) => x.id === msg.id && !x.bot);
        if (!host || !lobby || !target || target === m) return;
        if (target.send) target.send(JSON.stringify({ t: 'error', code: 'kicked' }));
        this.remove(target.id);
        return;
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

  // A player left the match (on purpose, or away past the seat grace). With
  // "leavers: out" their line leaves the game: out of this round at once, with
  // no point for anyone, and out of every round after, its score kept on the
  // board. With "bot" (the default) a bot plays their line to the end.
  takeOut(m) {
    if (this.state !== 'match' || this.settings.leavers !== 'out') return;
    const i = this.order.findIndex((e) => e.m === m);
    if (i < 0 || this.order[i].out) return;
    this.order[i].out = true;
    if (this.round) this.round.retire(i);
    this.broadcast({ t: 'gone', i });
  }

  // The line with the most points, among those still in the game if any are.
  leader() {
    const lines = this.order.map((e, i) => i);
    const still = lines.filter((i) => !this.order[i].out);
    const pool = still.length ? still : lines;
    return pool.reduce((best, i) => (this.match.scores[i] > this.match.scores[best] ? i : best));
  }

  // Lines still in the game.
  activeLines() {
    return this.order.filter((e) => !e.out).length;
  }

  start() {
    this.order = this.members.map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color,
      bot: m.bot,
      m,
    }));
    const { length, target, winBy2 } = this.settings;
    const n = this.order.length;
    this.match = new Match(n, matchTarget(length, n, target), leadFor(winBy2));
    this.state = 'match';
    this.autoStart = null;
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
        segment: (p, x0, y0, x1, y1, r) =>
          this.addSegment(p.id, round1(x0), round1(y0), round1(x1), round1(y1), r),
        death: (p) => this.events.push(encodeEvent.death(p)),
        pickup: (p, it) => this.events.push(encodeEvent.pickup(p, it)),
        clear: () => {
          this.events.push(encodeEvent.clear());
          this.pending = [];
          this.segLog = [];
        },
      },
    });
    this.order.forEach((e, i) => e.out && this.round.retire(i, { silent: true }));
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
      lead: this.match.lead,
      roundNo: this.match.roundNo + 1,
      gone: this.order.flatMap((e, i) => (e.out ? [i] : [])),
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
    this.tickAway(dt);
    // With nobody here the match waits: bots do not play on to an empty room.
    if (this.state === 'match' && this.emptyFor > 0) return;
    if (this.state !== 'match') {
      if (this.public) this.tickAutoStart(dt);
      return;
    }
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
      // A snapshot every tick, 60 a second. Measured: at 30 the other players'
      // heads needed visible corrections in about one frame in ten, and the
      // server's CPU hardly changed.
      this.broadcast(this.snapshot());
      if (r.over) this.endRound();
    } else if (this.phase === 'roundEnd') {
      this.timer -= dt;
      if (this.timer <= 0) this.startRound();
    }
  }

  // Public lobby: count down while at least two people are here, and tell the
  // room each time the number of whole seconds left changes.
  tickAutoStart(dt) {
    const before = this.info().startsIn;
    if (this.humans().length < 2) this.autoStart = null;
    else this.autoStart = (this.autoStart ?? AUTO_START) - dt;
    if (this.autoStart !== null && this.autoStart <= 0) return this.start();
    if (this.info().startsIn !== before) this.broadcast(this.info());
  }

  endRound() {
    this.match.applyRound(this.round.points);
    let champion = this.match.winner();
    // Fewer than two lines left in the game: the match is over. The best of those
    // still in wins; if nobody is (only watchers stayed), the best of all.
    if (champion < 0 && this.activeLines() < 2) champion = this.leader();
    this.broadcast({
      t: 'roundEnd',
      winner: this.round.winner,
      scores: this.match.scores,
      champion,
      rounds: this.match.roundNo,
    });
    if (champion < 0) {
      this.phase = 'roundEnd';
      this.timer = ROUND_PAUSE;
      return;
    }
    this.state = 'lobby';
    this.phase = null;
    // Players away for longer than the grace leave on the next tick; the rest keep their seats.
    this.pickHost();
    this.broadcast(this.info());
  }
}
