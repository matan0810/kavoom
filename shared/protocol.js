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

import { FX_KEYS, POWERUPS } from './config.js';

const NO_EFFECTS = Object.freeze(Object.fromEntries(FX_KEYS.map((k) => [k, 0])));

// One decimal is enough for drawing and keeps the messages short.
export const round1 = (v) => Math.round(v * 10) / 10;
const round3 = (v) => Math.round(v * 1000) / 1000;

// ---------- server side ----------

export const encodeEvent = {
  death: (player) => ['d', player.id, round1(player.x), round1(player.y)],
  pickup: (player, item) => ['k', player.id, round1(item.x), round1(item.y), POWERUPS.indexOf(item.def)],
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
    it: round.items.map((it) => [POWERUPS.indexOf(it.def), round1(it.x), round1(it.y), round1(it.life)]),
    wr: round1(round.wrap),
    g: segments,
    e: events,
    pts: round.points,
  };
}

// ---------- browser side ----------

function decodePlayer([x, y, angle, alive, r, effects], id) {
  const fx = effects ? Object.fromEntries(FX_KEYS.map((k, i) => [k, effects[i]])) : NO_EFFECTS;
  return { id, x, y, angle, alive: !!alive, r, fx };
}

function decodeEvent([kind, id, x, y, powerup]) {
  if (kind === 'd') return { type: 'death', player: { id, x, y } };
  if (kind === 'k') return { type: 'pickup', player: { id }, item: { x, y, def: POWERUPS[powerup] } };
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
  };
}
