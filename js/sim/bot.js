// Computer player. Looks ahead along nine candidate paths (three first moves,
// three follow-ups each) and picks the first move with the longest free run.

const DS = 3; // look-ahead sample spacing, in arena units
const ACTIONS = [-1, 0, 1];

function blocked(round, p, x, y, ang, r, minAge, cfg, ghost) {
  const { w, h } = round;
  const wallMargin = r + 4;
  if (round.wrap > 1.5) {
    x = ((x % w) + w) % w;
    y = ((y % h) + h) % h;
  } else if (x < wallMargin || y < wallMargin || x > w - wallMargin || y > h - wallMargin) {
    return true;
  }
  if (!ghost) {
    const g = round.grid;
    const id = p.id + 1;
    const s = round.stepN;
    const m = r + 3;
    const nx = -Math.sin(ang) * m;
    const ny = Math.cos(ang) * m;
    if (g.probe(x, y, id, s, minAge) || g.probe(x + nx, y + ny, id, s, minAge) || g.probe(x - nx, y - ny, id, s, minAge)) {
      return true;
    }
  }
  if (cfg.heads) {
    for (const o of round.players) {
      if (o === p || !o.alive) continue;
      const dx = o.x + Math.cos(o.angle) * 22 - x;
      const dy = o.y + Math.sin(o.angle) * 22 - y;
      if (dx * dx + dy * dy < 400) return true;
    }
  }
  return false;
}

function run(round, p, from, action, len, env) {
  let { x, y, ang } = from;
  const dAng = (action * p.turn * DS) / p.speed;
  for (let d = DS; d <= len; d += DS) {
    ang += dAng;
    x += Math.cos(ang) * DS;
    y += Math.sin(ang) * DS;
    if (blocked(round, p, x, y, ang, p.r, env.minAge, env.cfg, env.ghost)) {
      return { free: d - DS, hit: true };
    }
  }
  return { free: len, hit: false, x, y, ang };
}

function seekAction(round, p) {
  let best = null;
  let bestD = 260 * 260;
  for (const it of round.items) {
    if (it.def.id === 'fast') continue;
    const dx = it.x - p.x;
    const dy = it.y - p.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  if (!best) return null;
  let diff = Math.atan2(best.y - p.y, best.x - p.x) - p.angle;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  if (diff > 0.12) return 1;
  if (diff < -0.12) return -1;
  return 0;
}

export function botDecide(round, p) {
  const cfg = p.bot;
  const st = p.botState;
  const rng = round.rng;
  if (cfg.mistake && rng() < cfg.mistake) return st.action;

  const L = cfg.look;
  const L1 = Math.min(45, L * 0.5);
  const env = {
    cfg,
    ghost: p.fx.ghost > 0.6,
    minAge: Math.ceil((2 * p.r + 14) / (p.speed * round.dt)),
  };
  const from = { x: p.x, y: p.y, ang: p.angle };
  const scores = ACTIONS.map((a) => {
    const s1 = run(round, p, from, a, L1, env);
    if (s1.hit) return s1.free;
    // Best follow-up counts most; the others add a little, so the bot
    // prefers moves that keep several ways out.
    let best = 0;
    let sum = 0;
    for (const b of ACTIONS) {
      const free = run(round, p, s1, b, L - L1, env).free;
      sum += free;
      if (free > best) best = free;
    }
    return L1 + best * 0.7 + (sum / 3) * 0.3;
  });

  const max = Math.max(...scores);
  if (scores.every((s) => s >= L - 1)) {
    if (cfg.seek) {
      const a = seekAction(round, p);
      if (a !== null) return a;
    }
    if (round.stepN >= st.wanderUntil) {
      st.wander = rng() < 0.5 ? 0 : rng() < 0.5 ? -1 : 1;
      st.wanderUntil = round.stepN + 20 + Math.floor(rng() * 90);
    }
    return st.wander;
  }
  const ok = ACTIONS.filter((a, i) => scores[i] >= max - 1);
  if (ok.includes(st.action)) return st.action;
  if (ok.includes(0)) return 0;
  return ok[0];
}
