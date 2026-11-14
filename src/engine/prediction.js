// Client-side prediction for this player's own head in an online match.
//
// The problem: the server runs the game. A key press travels to the server,
// the server turns the line, and the picture travels back. Without help, the
// line answers one round trip late (often 60 to 150 ms), which feels heavy.
//
// The fix: the newest position from the server is already old, and it does not
// include our most recent key presses. So we take it and replay our own recent
// input on top, for exactly one round trip plus the time since it arrived. The
// result is where the server will have the head once our input lands, and that
// is what we draw. Everything else (other players, trails, knockouts) is still
// drawn as the server says: the server stays the only referee.
//
// No DOM and no clock in here: every method is given the time, so tests can
// run it with a made-up clock.

import { ARENA, DT } from '../../shared/config.js';
import { moveHead } from '../../shared/sim/motion.js';

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
    this.base = null; // newest server state of our head: { head, fx, openWalls, at }
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
  // early. Timing the head by arrival would make it stutter. The server stamps
  // each position with its own clock instead, and the quickest recent delivery
  // tells us how that clock lines up with ours.
  serverTimeToLocal(serverMs, now) {
    this.clockGaps.push(now - serverMs);
    if (this.clockGaps.length > CLOCK_SAMPLES) this.clockGaps.shift();
    return serverMs + Math.min(...this.clockGaps);
  }

  // The server's newest word on our head. playing is false during the countdown.
  // serverMs is the server's clock for this position (simulation time in ms).
  addServerState(head, fx, openWalls, playing, now, serverMs) {
    const at = playing ? this.serverTimeToLocal(serverMs, now) : now;
    this.base = { head: { x: head.x, y: head.y, angle: head.angle }, fx, openWalls, at };
    if (!playing) this.playingSince = null;
    else if (this.playingSince === null) this.playingSince = now;
  }

  inputAt(time) {
    let dir = 0;
    for (const entry of this.inputs) {
      if (entry.at > time) break;
      dir = entry.dir;
    }
    return dir;
  }

  // Where to draw our head now: { x, y, angle, path }, or null when there is
  // nothing to predict (no measurement yet, countdown, no server state).
  // path is the way from the server's position to the predicted one.
  predict(now) {
    const { base } = this;
    if (!base || this.playingSince === null || !this.rtt) return null;
    // Ease in over the first moments of a round, so the head does not jump at "go".
    const lead = Math.min(this.rtt + TICK_WAIT_MS, MAX_LEAD_MS, now - this.playingSince);
    const age = Math.min(now - base.at, MAX_STALE_MS);
    const from = base.at - lead; // our input from this moment on is not in the server state yet
    const total = (lead + age) / 1000;

    const head = { ...base.head };
    const path = [[head.x, head.y]];
    for (let t = 0; t < total; t += DT) {
      const dt = Math.min(DT, total - t);
      moveHead(head, this.inputAt(from + t * 1000), base.fx, dt, ARENA, base.openWalls > 0);
      path.push([head.x, head.y]);
    }
    return { ...head, path };
  }
}
