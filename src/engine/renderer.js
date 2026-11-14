// Canvas drawing. Trails accumulate on an offscreen layer; heads, items and
// particles are redrawn on top every frame.

import { POWERUPS, POWERUP_RADIUS, TARGET_COLORS } from '../../shared/config.js';

const TRAIL_SCALE = 2;
const FX_DUR = {};
for (const d of POWERUPS) if (d.fx) FX_DUR[d.fx] = Math.max(FX_DUR[d.fx] || 0, d.dur);
const FX_COLOR = {
  fast: '#ffd23f',
  slow: '#4cc9f0',
  thin: '#3ddc97',
  thick: '#ff5a6e',
  ghost: '#e8ebff',
  reverse: '#ff5a6e',
};

const GLYPHS = {
  bolt: [
    [0.25, -1],
    [-0.6, 0.15],
    [-0.05, 0.15],
    [-0.25, 1],
    [0.6, -0.2],
    [0.05, -0.2],
  ],
  hourglass: [
    [-0.6, -0.9],
    [0.6, -0.9],
    [0.12, 0],
    [0.6, 0.9],
    [-0.6, 0.9],
    [-0.12, 0],
  ],
  star: [
    [0, -1],
    [0.22, -0.22],
    [1, 0],
    [0.22, 0.22],
    [0, 1],
    [-0.22, 0.22],
    [-1, 0],
    [-0.22, -0.22],
  ],
};

function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

function arrow(ctx, x0, x1, y) {
  const s = Math.sign(x1 - x0);
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.moveTo(x1 - s * 0.4, y - 0.3);
  ctx.lineTo(x1, y);
  ctx.lineTo(x1 - s * 0.4, y + 0.3);
  ctx.stroke();
}

function glyph(ctx, id) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (id) {
    case 'fast':
    case 'fastOthers':
      return poly(ctx, GLYPHS.bolt);
    case 'slow':
      return poly(ctx, GLYPHS.hourglass);
    case 'clear':
      return poly(ctx, GLYPHS.star);
    case 'thin':
    case 'thickOthers':
      ctx.lineWidth = id === 'thin' ? 0.22 : 0.8;
      ctx.beginPath();
      ctx.moveTo(0, -0.8);
      ctx.lineTo(0, 0.8);
      return ctx.stroke();
    case 'ghost':
      ctx.lineWidth = 0.24;
      ctx.setLineDash([0.4, 0.42]);
      ctx.beginPath();
      ctx.arc(0, 0, 0.75, 0, Math.PI * 2);
      ctx.stroke();
      return ctx.setLineDash([]);
    case 'reverseOthers':
      ctx.lineWidth = 0.24;
      arrow(ctx, -0.8, 0.8, -0.42);
      return arrow(ctx, 0.8, -0.8, 0.42);
    case 'wrap':
      ctx.lineWidth = 0.24;
      ctx.setLineDash([0.5, 0.36]);
      ctx.strokeRect(-0.75, -0.75, 1.5, 1.5);
      return ctx.setLineDash([]);
  }
}

export class Renderer {
  // The renderer exists before its canvas does: trails are kept on an offscreen
  // layer, and a component attaches the visible canvas once it is mounted.
  constructor(w, h, { calm = false } = {}) {
    this.canvas = null;
    this.ctx = null;
    this.rotated = false; // draw the arena turned 90 degrees, for tall screens
    this.w = w;
    this.h = h;
    this.calm = calm; // reduced motion: no shake
    this.colors = [];
    this.trail = document.createElement('canvas');
    this.trail.width = w * TRAIL_SCALE;
    this.trail.height = h * TRAIL_SCALE;
    this.tctx = this.trail.getContext('2d');
    this.tctx.setTransform(TRAIL_SCALE, 0, 0, TRAIL_SCALE, 0, 0);
    this.tctx.lineCap = 'round';
    this.reset([]);
  }

  attach(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
  }

  reset(colors) {
    this.colors = colors;
    this.tctx.clearRect(0, 0, this.w, this.h);
    this.particles = [];
    this.rings = [];
    this.shake = 0;
    this.flash = 0;
    this.clock = 0;
  }

  // Hooks for Round.
  hooks() {
    return {
      segment: (p, x0, y0, x1, y1, r) => {
        const c = this.tctx;
        c.strokeStyle = this.colors[p.id];
        c.lineWidth = r * 2;
        c.beginPath();
        c.moveTo(x0, y0);
        c.lineTo(x1, y1);
        c.stroke();
      },
      death: (p) => this.burst(p.x, p.y, this.colors[p.id], 28, true),
      pickup: (p, it) => this.burst(it.x, it.y, TARGET_COLORS[it.def.target], 12, false),
      clear: () => {
        this.tctx.clearRect(0, 0, this.w, this.h);
        this.flash = 1;
      },
    };
  }

  burst(x, y, color, n, big) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (big ? 60 : 40) + Math.random() * (big ? 200 : 90);
      const life = 0.35 + Math.random() * 0.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life,
        max: life,
        color,
      });
    }
    this.rings.push({ x, y, color, life: 0.5, max: 0.5, size: big ? 46 : 26 });
    if (big && !this.calm) this.shake = 0.28;
  }

  fit() {
    const cv = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.max(1, Math.round(cv.clientWidth * dpr));
    const ph = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (cv.width !== pw || cv.height !== ph) {
      cv.width = pw;
      cv.height = ph;
    }
  }

  // predicted: this device's own head drawn ahead of the server (see prediction.js),
  // as { id, x, y, angle, r, path, trail }, or null.
  draw(round, { dt = 0, intro = false, names = [], predicted = null } = {}) {
    if (!this.canvas) return;
    this.fit();
    const { ctx, w, h } = this;
    this.clock += dt;
    if (this.rotated) {
      // Arena x runs down the screen and arena y runs right to left: a pure
      // rotation, so left and right stay left and right for every line.
      const scale = this.canvas.width / h;
      ctx.setTransform(0, scale, -scale, 0, h * scale, 0);
    } else {
      const scale = this.canvas.width / w;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }

    ctx.fillStyle = '#0a0d1c';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    if (this.shake > 0) {
      const k = this.shake * 22;
      ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
      this.shake = Math.max(0, this.shake - dt);
    }

    ctx.fillStyle = '#1c2342';
    for (let y = 40; y < h; y += 40)
      for (let x = 40; x < w; x += 40) ctx.fillRect(x - 1, y - 1, 2, 2);

    ctx.drawImage(this.trail, 0, 0, w, h);

    if (round) {
      for (const it of round.items) this.drawItem(it);
      if (predicted && predicted.trail) this.drawPredictedTrail(predicted);
      for (const p of round.players) {
        if (!p.alive) continue;
        const mine = predicted && predicted.id === p.id;
        const head = mine ? { ...p, x: predicted.x, y: predicted.y, angle: predicted.angle } : p;
        this.drawHead(head, intro, names[p.id]);
      }
    }
    this.drawParticles(dt);
    ctx.restore();

    // Arena edge. Dashed and moving while the walls are open.
    const open = round && round.wrap > 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = open ? '#4cc9f0' : '#e8ebff';
    if (open) {
      ctx.setLineDash([14, 12]);
      ctx.lineDashOffset = -this.clock * 40;
      if (round.wrap < 1.5 && Math.floor(this.clock * 8) % 2) ctx.strokeStyle = '#e8ebff';
    }
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    ctx.setLineDash([]);

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(232,235,255,${this.flash * 0.5})`;
      ctx.fillRect(0, 0, w, h);
      this.flash = Math.max(0, this.flash - dt * 3);
    }
  }

  drawItem(it) {
    const { ctx } = this;
    if (it.life < 2 && Math.floor(it.life * 6) % 2 === 0) return;
    const pulse = 1 + Math.sin(this.clock * 4 + it.x) * 0.06;
    const color = TARGET_COLORS[it.def.target];
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.scale(pulse, pulse);
    if (this.rotated) ctx.rotate(-Math.PI / 2); // keep the icon upright
    ctx.beginPath();
    ctx.arc(0, 0, POWERUP_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#141930';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.scale(8, 8);
    ctx.fillStyle = ctx.strokeStyle = '#f4f5ff';
    glyph(ctx, it.def.id);
    ctx.restore();
  }

  // The stretch between the server's last position and the predicted head. It is
  // redrawn every frame and never kept: the real trail arrives from the server.
  drawPredictedTrail({ id, r, path }) {
    const { ctx } = this;
    ctx.strokeStyle = this.colors[id];
    ctx.lineWidth = r * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    path.forEach(([x, y], i) => {
      const [px, py] = path[i - 1] || [x, y];
      // A long jump is the head leaving one side and coming back on the other.
      const jumped = Math.abs(x - px) > 50 || Math.abs(y - py) > 50;
      if (i === 0 || jumped) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  drawHead(p, intro, name) {
    const { ctx } = this;
    const color = this.colors[p.id];
    const ghost = p.fx.ghost > 0;
    ctx.save();
    ctx.translate(p.x, p.y);

    if (intro) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.save();
      ctx.rotate(p.angle);
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(34, 0);
      ctx.moveTo(27, -6);
      ctx.lineTo(34, 0);
      ctx.lineTo(27, 6);
      ctx.stroke();
      ctx.restore();
      if (name) {
        ctx.font = '600 16px Heebo, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        // The name sits behind the head, away from the direction arrow.
        ctx.textBaseline = 'middle';
        ctx.save();
        if (this.rotated) {
          ctx.translate(-Math.cos(p.angle) * 22, -Math.sin(p.angle) * 30);
          ctx.rotate(-Math.PI / 2); // keep the text upright
        } else {
          ctx.translate(-Math.cos(p.angle) * 30, -Math.sin(p.angle) * 22);
        }
        ctx.fillText(name, 0, 0);
        ctx.restore();
      }
    }

    let ring = 9;
    for (const k in p.fx) {
      if (p.fx[k] <= 0) continue;
      ctx.beginPath();
      ctx.arc(
        0,
        0,
        ring,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * Math.min(1, p.fx[k] / FX_DUR[k]),
      );
      ctx.strokeStyle = FX_COLOR[k];
      ctx.lineWidth = 2;
      ctx.stroke();
      ring += 4;
    }

    const r = Math.max(p.r, 2.2) + 1.2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    if (ghost) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    ctx.restore();
  }

  drawParticles(dt) {
    const { ctx } = this;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i];
      q.life -= dt;
      if (q.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 1 - 2.5 * dt;
      q.vy *= 1 - 2.5 * dt;
      ctx.globalAlpha = q.life / q.max;
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const g = this.rings[i];
      g.life -= dt;
      if (g.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const t = 1 - g.life / g.max;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = g.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(g.x, g.y, 4 + t * g.size, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
