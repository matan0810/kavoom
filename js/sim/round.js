// One round: movement, collisions, trail gaps, power-ups and round points.
// Pure simulation: no DOM, no clock. Reports outward through optional hooks:
//   segment(player, x0, y0, x1, y1, r)   a piece of trail was laid
//   death(player)   pickup(player, item)   clear()   spawn(item)

import { BASE, DT, POWERUPS, POWERUP_RADIUS, POWERUP_LIFE, POWERUP_MAX, FX_MULT, BOT_LEVELS } from '../config.js';
import { Grid } from './grid.js';
import { botDecide } from './bot.js';

const ARC_HALF = (75 * Math.PI) / 180;
const WEIGHT_SUM = POWERUPS.reduce((s, d) => s + d.weight, 0);

export class Round {
  constructor({ w, h, players, rng, powerups = true, hooks = {} }) {
    this.w = w;
    this.h = h;
    this.dt = DT;
    this.rng = rng;
    this.hooks = hooks;
    this.powerups = powerups;
    this.grid = new Grid(w, h);
    this.stepN = 0;
    this.time = 0;
    this.wrap = 0;
    this.items = [];
    this.nextSpawn = 3 + rng() * 2;
    this.over = false;
    this.winner = -1;
    this.points = new Array(players.length).fill(0);
    this.players = players.map((cfg, id) => ({
      id,
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      angle: 0,
      alive: true,
      input: 0,
      speed: BASE.speed,
      turn: BASE.turn,
      r: BASE.radius,
      wrapped: false,
      fx: { fast: 0, slow: 0, thin: 0, thick: 0, ghost: 0, reverse: 0 },
      reverseAge: 0,
      toGap: this.gapDistance(),
      gapLeft: 0,
      bot: cfg.bot ? BOT_LEVELS[cfg.bot] : null,
      botState: { next: 0, action: 0, wander: 0, wanderUntil: 0 },
    }));
    this.aliveCount = this.players.length;
    this.place();
  }

  gapDistance() {
    return BASE.gapMin + this.rng() * (BASE.gapMax - BASE.gapMin);
  }

  // Random start positions, away from walls and from each other, not facing a near wall.
  place() {
    const { w, h, rng } = this;
    const m = Math.min(110, h * 0.3);
    const placed = [];
    for (const p of this.players) {
      for (let attempt = 0; attempt < 300; attempt++) {
        const x = m + rng() * (w - 2 * m);
        const y = m + rng() * (h - 2 * m);
        const a = rng() * Math.PI * 2;
        const strict = attempt < 200;
        if (strict) {
          if (placed.some((q) => Math.hypot(q.x - x, q.y - y) < 150)) continue;
          if (this.wallDistance(x, y, a) < 260) continue;
        }
        p.x = p.px = x;
        p.y = p.py = y;
        p.angle = a;
        break;
      }
      placed.push(p);
    }
  }

  wallDistance(x, y, a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const tx = c > 0 ? (this.w - x) / c : c < 0 ? -x / c : Infinity;
    const ty = s > 0 ? (this.h - y) / s : s < 0 ? -y / s : Infinity;
    return Math.min(tx, ty);
  }

  updateStats(p) {
    const f = p.fx;
    const sm = (f.fast > 0 ? FX_MULT.fast : 1) * (f.slow > 0 ? FX_MULT.slow : 1);
    p.speed = BASE.speed * sm;
    p.turn = BASE.turn * Math.sqrt(sm);
    p.r = BASE.radius * (f.thin > 0 ? FX_MULT.thin : 1) * (f.thick > 0 ? FX_MULT.thick : 1);
  }

  hitsTrail(p) {
    const d = p.r + 0.8;
    const n = Math.max(5, Math.ceil((2 * ARC_HALF * d) / 1.2));
    const minAge = Math.ceil((2 * p.r + 4) / (p.speed * DT));
    const self = p.id + 1;
    for (let k = 0; k < n; k++) {
      const a = p.angle - ARC_HALF + (2 * ARC_HALF * k) / (n - 1);
      if (this.grid.probe(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, self, this.stepN, minAge)) return true;
    }
    return false;
  }

  step() {
    if (this.over) return;
    const { w, h, hooks } = this;
    this.stepN++;
    this.time += DT;
    if (this.wrap > 0) this.wrap = Math.max(0, this.wrap - DT);

    const moved = [];
    const died = [];

    // 1. Everyone moves and is checked against the grid as it was last step.
    for (const p of this.players) {
      if (!p.alive) continue;
      const f = p.fx;
      for (const k in f) if (f[k] > 0) f[k] = Math.max(0, f[k] - DT);
      p.reverseAge = f.reverse > 0 ? p.reverseAge + DT : 0;
      this.updateStats(p);

      if (p.bot) {
        if (this.stepN >= p.botState.next) {
          p.botState.action = botDecide(this, p);
          p.botState.next = this.stepN + p.bot.every;
        }
        // A bot that has had time to adapt presses the opposite key on purpose.
        const adapted = f.reverse > 0 && p.reverseAge >= p.bot.adapt;
        p.input = adapted ? -p.botState.action : p.botState.action;
      }
      const input = f.reverse > 0 ? -p.input : p.input;

      p.angle += input * p.turn * DT;
      p.px = p.x;
      p.py = p.y;
      p.x += Math.cos(p.angle) * p.speed * DT;
      p.y += Math.sin(p.angle) * p.speed * DT;
      p.wrapped = false;
      moved.push(p);

      if (this.wrap > 0) {
        if (p.x < 0 || p.x >= w || p.y < 0 || p.y >= h) {
          p.x = ((p.x % w) + w) % w;
          p.y = ((p.y % h) + h) % h;
          p.wrapped = true;
        }
      } else if (p.x < p.r || p.y < p.r || p.x > w - p.r || p.y > h - p.r) {
        died.push(p);
        continue;
      }
      if (f.ghost <= 0 && this.hitsTrail(p)) died.push(p);
    }

    // 2. Everyone who moved lays trail, unless in a gap or ghosted.
    for (const p of moved) {
      if (p.fx.ghost > 0) continue;
      const dist = p.speed * DT;
      if (p.gapLeft > 0) {
        p.gapLeft -= dist;
        if (p.gapLeft <= 0) p.toGap = this.gapDistance();
        continue;
      }
      p.toGap -= dist;
      if (p.toGap <= 0) p.gapLeft = BASE.gapLen * Math.max(1, p.r / BASE.radius);
      this.grid.stampDisc(p.x, p.y, p.r, p.id + 1, this.stepN);
      if (hooks.segment) {
        if (p.wrapped) hooks.segment(p, p.x, p.y, p.x, p.y, p.r);
        else hooks.segment(p, p.px, p.py, p.x, p.y, p.r);
      }
    }

    // 3. Deaths and points: each death pays one point to everyone still alive.
    if (died.length) {
      for (const p of died) {
        p.alive = false;
        this.aliveCount--;
      }
      for (const p of this.players) if (p.alive) this.points[p.id] += died.length;
      if (hooks.death) for (const p of died) hooks.death(p);
      const n = this.players.length;
      if (this.aliveCount <= (n > 1 ? 1 : 0)) {
        this.over = true;
        const last = this.players.find((p) => p.alive);
        this.winner = last ? last.id : -1;
        return;
      }
    }

    if (this.powerups) this.stepItems();
  }

  stepItems() {
    const { items, hooks } = this;
    for (let i = items.length - 1; i >= 0; i--) {
      items[i].life -= DT;
      if (items[i].life <= 0) items.splice(i, 1);
    }
    this.nextSpawn -= DT;
    if (this.nextSpawn <= 0) {
      this.nextSpawn = 4 + this.rng() * 4;
      if (items.length < POWERUP_MAX) this.spawnItem();
    }
    for (const p of this.players) {
      if (!p.alive) continue;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        const reach = POWERUP_RADIUS + p.r;
        const dx = it.x - p.x;
        const dy = it.y - p.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        items.splice(i, 1);
        this.apply(it.def, p);
        if (hooks.pickup) hooks.pickup(p, it);
      }
    }
  }

  spawnItem() {
    const { w, h, rng } = this;
    let roll = rng() * WEIGHT_SUM;
    let def = POWERUPS[0];
    for (const d of POWERUPS) {
      roll -= d.weight;
      if (roll <= 0) {
        def = d;
        break;
      }
    }
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = 45 + rng() * (w - 90);
      const y = 45 + rng() * (h - 90);
      if (this.players.some((p) => p.alive && Math.hypot(p.x - x, p.y - y) < 70)) continue;
      const item = { def, x, y, life: POWERUP_LIFE };
      this.items.push(item);
      if (this.hooks.spawn) this.hooks.spawn(item);
      return item;
    }
    return null;
  }

  apply(def, picker) {
    if (def.id === 'clear') {
      this.grid.clear();
      if (this.hooks.clear) this.hooks.clear();
    } else if (def.id === 'wrap') {
      this.wrap = def.dur;
    } else if (def.target === 'self') {
      picker.fx[def.fx] = def.dur;
    } else {
      for (const p of this.players) if (p.alive && p !== picker) p.fx[def.fx] = def.dur;
    }
  }
}
