// Client-side prediction for the heads in an online match.
//
// The problem: the server runs the game. A key press travels to the server,
// the server turns the line, and the picture travels back. Without help, the
// line answers one round trip late (often 60 to 150 ms), which feels heavy.
//
// The fix: the newest position from the server is already old, and it does not
// include our most recent key presses. So we take it and replay our own recent
// input on top, for exactly one round trip plus the time since it arrived. The
// result is where the server will have the head once our input lands, and that
// is what we draw.
//
// The other players' heads are moved forward by the same amount of time, so
// every head on the screen shows the same moment. Without that, our own head
// would be a round trip ahead of everyone else's, and in a close call we would
// see ourselves pass first while the server, rightly, saw the other player
// first. We do not know what the others are pressing, so each keeps turning
// the way its last two server positions show; when they change their mind, the
// next message corrects it. Moving every head on our own clock also keeps the
// picture smooth when messages arrive in bursts. Trails and knockouts are still
// exactly what the server says: the server stays the only referee.
//
// No DOM and no clock in here: every method is given the time, so tests can
// run it with a made-up clock.

import { ARENA, DT } from '../../shared/config.js';
import { moveHead, speedAndTurn } from '../../shared/sim/motion.js';

const MAX_LEAD_MS = 250; // beyond this the guess is too far ahead to trust
const MAX_STALE_MS = 150; // a server position older than this is not extrapolated further
const TICK_WAIT_MS = 1000 / 120; // input waits for the server's next tick: half a tick on average
const HISTORY_MS = 1000;
const CLOCK_SAMPLES = 120; // about two seconds of snapshots

export class Predictor {
  constructor() {
    this.rtt = 0; // smoothed round trip to the server in ms; 0 = not measured yet
    this.reset();
  }

  // A new round: forget the last one's input and positions, keep the measured round trip.
  reset() {
    this.inputs = [{ at: -Infinity, dir: 0 }]; // our key presses, oldest first
    this.me = -1; // our player, or -1 when only watching
    this.heads = new Map(); // player id -> newest server state, see addHead
    this.playingSince = null; // when the first "playing" state of this round arrived
    this.clockGaps = []; // recent (arrival time - server time) values; see serverTimeToLocal
  }

  // One measurement of the round trip, in ms.
  addRttSample(ms) {
    if (!(ms >= 0 && ms < 2000)) return;
    this.rtt = this.rtt ? this.rtt * 0.8 + ms * 0.2 : ms;
  }

  // We just sent this steering direction to the server.
  addInput(dir, now) {
    this.inputs.push({ at: now, dir });
    // Keep one entry older than the window: it says what was held when the window began.
    while (this.inputs.length > 1 && this.inputs[1].at < now - HISTORY_MS) this.inputs.shift();
  }

  // Messages do not arrive evenly: one comes a little late, the next a little
  // early. Timing the heads by arrival would make them stutter. The server
  // stamps each snapshot with its own clock instead, and the quickest recent
  // delivery tells us how that clock lines up with ours.
  serverTimeToLocal(serverMs, now) {
    this.clockGaps.push(now - serverMs);
    if (this.clockGaps.length > CLOCK_SAMPLES) this.clockGaps.shift();
    return serverMs + Math.min(...this.clockGaps);
  }

  // A snapshot arrived. players: everyone's state as decoded from it ({ id, x,
  // y, angle, alive, fx }). me: our player's id, or -1. openWalls: seconds of
  // open walls left. playing: false during the countdown. serverMs: the
  // server's clock for this snapshot (simulation time in ms).
  addSnapshot(players, me, openWalls, playing, now, serverMs) {
    this.me = me;
    if (!playing) this.playingSince = null;
    else if (this.playingSince === null) this.playingSince = now;
    const at = playing ? this.serverTimeToLocal(serverMs, now) : now;
    for (const p of players) {
      if (p.alive) this.addHead(p, openWalls, at, serverMs);
      else this.heads.delete(p.id);
    }
  }

  // For other players, which way they are turning is read from how their angle
  // changed since their last state: exactly as much as a full turn would, or not.
  addHead(p, openWalls, at, serverMs) {
    const before = this.heads.get(p.id);
    let input = before ? before.input : 0;
    if (before && serverMs > before.serverMs) {
      let turned = p.angle - before.head.angle;
      turned = Math.atan2(Math.sin(turned), Math.cos(turned)); // the short way round
      const full = speedAndTurn(p.fx).turn * ((serverMs - before.serverMs) / 1000);
      const way = Math.abs(turned) < full / 2 ? 0 : Math.sign(turned);
      input = p.fx.reverse > 0 ? -way : way; // moveHead flips reversed keys back
    }
    const head = { x: p.x, y: p.y, angle: p.angle };
    this.heads.set(p.id, { head, fx: p.fx, openWalls, input, at, serverMs });
  }

  inputAt(time) {
    let dir = 0;
    for (const entry of this.inputs) {
      if (entry.at > time) break;
      dir = entry.dir;
    }
    return dir;
  }

  // Where to draw each living head now: [{ id, x, y, angle, path }], or [] when
  // there is nothing to predict (no measurement yet, countdown). path is the
  // way from the server's position to the predicted one.
  predictAll(now) {
    if (this.playingSince === null || !this.rtt) return [];
    // Ease in over the first moments of a round, so heads do not jump at "go".
    const lead = Math.min(this.rtt + TICK_WAIT_MS, MAX_LEAD_MS, now - this.playingSince);
    return [...this.heads].map(([id, state]) => this.advance(id, state, lead, now));
  }

  // Our own head only, or null. See predictAll.
  predict(now) {
    return this.predictAll(now).find((h) => h.id === this.me) || null;
  }

  advance(id, { head: start, fx, openWalls, input, at }, lead, now) {
    const age = Math.min(now - at, MAX_STALE_MS);
    const from = at - lead; // our own input from this moment on is not in the server state yet
    const total = (lead + age) / 1000;
    const head = { ...start };
    const path = [[head.x, head.y]];
    for (let t = 0; t < total; t += DT) {
      const dt = Math.min(DT, total - t);
      const dir = id === this.me ? this.inputAt(from + t * 1000) : input;
      moveHead(head, dir, fx, dt, ARENA, openWalls > 0);
      path.push([head.x, head.y]);
    }
    return { id, ...head, path };
  }
}
