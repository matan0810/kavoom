// The online wire format for a running round, in one place.
//
// The server sends 60 snapshots a second to every player, so the messages are
// short arrays rather than objects with names. This file is the only one that
// knows which position means what: the server calls the encode functions, the
// browser calls the decode functions, and tests/protocol.test.js checks that
// one undoes the other.
//
//   snapshot  { t: 's', ph, cd, p, it, wr, g, e, pts }
//     ph   'c' during the countdown, 'p' while playing
//     cd   seconds left in the countdown
//     p    one entry per player:   [x, y, angle, alive, radius, effects | 0]
//     it   one entry per power-up: [index in POWERUPS, x, y, seconds left]
//     wr   seconds of "open walls" left
//     g    new trail segments:     [player, x0, y0, x1, y1, radius]
//     e    events since the last snapshot: ['d', player, x, y]  knockout
//                                          ['k', player, x, y, index in POWERUPS]  pickup
//                                          ['c']  all trails cleared
//     pts  points earned so far this round, per player
//     n    simulation steps so far this round: the server's clock (120 steps a second)

import {
  FX_KEYS,
  LENGTH_CHOICES,
  MAX_PLAYERS,
  PALETTE,
  POWERUPS,
  TARGET_LIMITS,
} from './config.js';

const NO_EFFECTS = Object.freeze(Object.fromEntries(FX_KEYS.map((k) => [k, 0])));

// One decimal is enough for drawing and keeps the messages short.
export const round1 = (v) => Math.round(v * 10) / 10;
const round3 = (v) => Math.round(v * 1000) / 1000;

// ---------- server side ----------

export const encodeEvent = {
  death: (player) => ['d', player.id, round1(player.x), round1(player.y)],
  pickup: (player, item) => [
    'k',
    player.id,
    round1(item.x),
    round1(item.y),
    POWERUPS.indexOf(item.def),
  ],
  clear: () => ['c'],
};

function encodePlayer(p) {
  const active = FX_KEYS.some((k) => p.fx[k] > 0);
  const effects = active ? FX_KEYS.map((k) => round1(p.fx[k])) : 0;
  return [round1(p.x), round1(p.y), round3(p.angle), p.alive ? 1 : 0, p.r, effects];
}

// round: the Round being played. segments and events: what happened since the last snapshot.
export function encodeSnapshot(round, { countingDown, countdown, segments, events }) {
  return {
    t: 's',
    ph: countingDown ? 'c' : 'p',
    cd: round1(Math.max(0, countdown)),
    p: round.players.map(encodePlayer),
    it: round.items.map((it) => [
      POWERUPS.indexOf(it.def),
      round1(it.x),
      round1(it.y),
      round1(it.life),
    ]),
    wr: round1(round.wrap),
    g: segments,
    e: events,
    pts: round.points,
    n: round.stepN,
  };
}

// ---------- browser side ----------

function decodePlayer([x, y, angle, alive, r, effects], id) {
  const fx = effects ? Object.fromEntries(FX_KEYS.map((k, i) => [k, effects[i]])) : NO_EFFECTS;
  return { id, x, y, angle, alive: !!alive, r, fx };
}

function decodeEvent([kind, id, x, y, powerup]) {
  if (kind === 'd') return { type: 'death', player: { id, x, y } };
  if (kind === 'k')
    return { type: 'pickup', player: { id }, item: { x, y, def: POWERUPS[powerup] } };
  return { type: 'clear' };
}

// A trail segment as the arguments of the renderer's segment hook.
export function decodeSegment([id, x0, y0, x1, y1, r]) {
  return [{ id }, x0, y0, x1, y1, r];
}

export function decodeSnapshot(m) {
  return {
    countingDown: m.ph === 'c',
    countdown: m.cd,
    players: m.p.map(decodePlayer),
    items: m.it.map(([powerup, x, y, life]) => ({ def: POWERUPS[powerup], x, y, life })),
    wrap: m.wr,
    segments: m.g.map(decodeSegment),
    events: m.e.map(decodeEvent),
    points: m.pts,
    step: m.n,
  };
}

// ---------- checking what the browser receives ----------
//
// The browser trusts nothing it is sent (CLAUDE.md, section 5): every message from the
// server is checked for its shape before it is used, and a message that fails is dropped,
// so a broken or hostile message cannot crash the page. tests/protocol.test.js checks that
// every message a real match sends passes.

const isInt = (v, min = -Infinity, max = Infinity) => Number.isInteger(v) && v >= min && v <= max;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v, max) => typeof v === 'string' && v.length <= max;
const isBool = (v) => typeof v === 'boolean';
const listOf = (v, check, max = 10000) => Array.isArray(v) && v.length <= max && v.every(check);
const oneOf = (v, choices) => choices.includes(v);
const colour = (v) => isInt(v, 0, PALETTE.length - 1);
const name = (v) => isStr(v, 40); // ten characters, which emoji can make longer in code units
const segment = (s) => listOf(s, isNum, 6) && s.length === 6 && isInt(s[0], 0, MAX_PLAYERS - 1);
const code = (v) => typeof v === 'string' && /^[A-Z]{4}$/.test(v);

const SETTING_CHOICES = {
  length: LENGTH_CHOICES,
  winBy2: ['on', 'off'],
  powerups: ['on', 'off'],
  botLevel: ['easy', 'medium', 'hard'],
  locked: ['off', 'on'],
  leavers: ['bot', 'out'],
};

function settingsOk(s) {
  if (!s || typeof s !== 'object') return false;
  if (!isInt(s.target, TARGET_LIMITS.min, TARGET_LIMITS.max)) return false;
  return Object.entries(SETTING_CHOICES).every(([key, choices]) => oneOf(s[key], choices));
}

const member = (m) =>
  !!m && isInt(m.id, 1) && name(m.name) && colour(m.color) && isBool(m.bot) && isBool(m.on);

const playerState = (a) =>
  Array.isArray(a) &&
  a.length === 6 &&
  isNum(a[0]) &&
  isNum(a[1]) &&
  isNum(a[2]) &&
  oneOf(a[3], [0, 1]) &&
  isNum(a[4]) &&
  (a[5] === 0 || (listOf(a[5], isNum) && a[5].length === FX_KEYS.length));

const item = (a) =>
  Array.isArray(a) &&
  a.length === 4 &&
  isInt(a[0], 0, POWERUPS.length - 1) &&
  a.slice(1).every(isNum);

const event = (e) =>
  Array.isArray(e) &&
  ((e[0] === 'd' &&
    e.length === 4 &&
    isInt(e[1], 0, MAX_PLAYERS - 1) &&
    isNum(e[2]) &&
    isNum(e[3])) ||
    (e[0] === 'k' &&
      e.length === 5 &&
      isInt(e[1], 0, MAX_PLAYERS - 1) &&
      isNum(e[2]) &&
      isNum(e[3]) &&
      isInt(e[4], 0, POWERUPS.length - 1)) ||
    (e[0] === 'c' && e.length === 1));

const CHECKS = {
  joined: (m) => code(m.code) && isInt(m.you, 1) && isStr(m.token, 64) && m.token.length > 0,
  room: (m) =>
    code(m.code) &&
    isInt(m.host, 0) &&
    oneOf(m.state, ['lobby', 'match']) &&
    isBool(m.public) &&
    isInt(m.startsIn, 0, 60) &&
    settingsOk(m.settings) &&
    listOf(m.members, member, MAX_PLAYERS),
  round: (m) => {
    const n = Array.isArray(m.order) ? m.order.length : 0;
    return (
      n >= 1 &&
      n <= MAX_PLAYERS &&
      listOf(m.order, (v) => isInt(v, 1)) &&
      listOf(m.names, name) &&
      m.names.length === n &&
      listOf(m.colors, colour) &&
      m.colors.length === n &&
      listOf(m.scores, isNum) &&
      m.scores.length === n &&
      isInt(m.target, TARGET_LIMITS.min) &&
      (m.lead === undefined || oneOf(m.lead, [1, 2])) &&
      isInt(m.roundNo, 1) &&
      (m.gone === undefined || listOf(m.gone, (i) => isInt(i, 0, n - 1))) &&
      listOf(m.segs, segment, 200000)
    );
  },
  s: (m) =>
    oneOf(m.ph, ['c', 'p']) &&
    isNum(m.cd) &&
    listOf(m.p, playerState, MAX_PLAYERS) &&
    listOf(m.it, item, 50) &&
    isNum(m.wr) &&
    listOf(m.g, segment) &&
    listOf(m.e, event) &&
    listOf(m.pts, isNum, MAX_PLAYERS) &&
    (m.n === undefined || isInt(m.n, 0)),
  roundEnd: (m) =>
    isInt(m.winner, -1, MAX_PLAYERS - 1) &&
    listOf(m.scores, isNum, MAX_PLAYERS) &&
    isInt(m.champion, -1, MAX_PLAYERS - 1) &&
    isInt(m.rounds, 0),
  gone: (m) => isInt(m.i, 0, MAX_PLAYERS - 1),
  pong: (m) => isNum(m.c),
  error: (m) => isStr(m.code, 32),
};

// True when `m` is a message the browser knows, with every field the right shape.
export function checkServerMessage(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m) || !Object.hasOwn(CHECKS, m.t)) return false;
  try {
    return CHECKS[m.t](m) === true;
  } catch {
    return false;
  }
}
