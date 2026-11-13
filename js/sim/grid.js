// Occupancy grid: one cell per arena unit. owner is player index + 1 (0 = empty),
// stamp is the simulation step in which the cell was painted.

export class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.owner = new Uint8Array(w * h);
    this.stamp = new Int32Array(w * h);
  }

  clear() {
    this.owner.fill(0);
  }

  stampDisc(x, y, r, owner, step) {
    const { w, h } = this;
    const x0 = Math.max(0, Math.floor(x - r));
    const x1 = Math.min(w - 1, Math.ceil(x + r));
    const y0 = Math.max(0, Math.floor(y - r));
    const y1 = Math.min(h - 1, Math.ceil(y + r));
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) {
      const dy = cy + 0.5 - y;
      for (let cx = x0; cx <= x1; cx++) {
        const dx = cx + 0.5 - x;
        if (dx * dx + dy * dy > r2) continue;
        const i = cy * w + cx;
        if (this.owner[i] === 0) {
          this.owner[i] = owner;
          this.stamp[i] = step;
        }
      }
    }
  }

  // Returns the owner hit at (x, y), or 0. A player's own cells younger than
  // minAge steps are ignored so the head never collides with the trail it is laying.
  probe(x, y, self, step, minAge) {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return 0;
    const i = cy * this.w + cx;
    const o = this.owner[i];
    if (o === 0) return 0;
    if (o === self && step - this.stamp[i] < minAge) return 0;
    return o;
  }
}
