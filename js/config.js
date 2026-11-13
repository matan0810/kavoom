// Shared constants. Everything here is plain data so the simulation can run in Node.

export const ARENA = { w: 1120, h: 720 };
export const SIM_HZ = 120;
export const DT = 1 / SIM_HZ;

export const BASE = {
  speed: 105,
  turn: 2.85,
  radius: 3,
  gapMin: 170,
  gapMax: 520,
  gapLen: 24,
};

// Twelve line colours to choose from. Players hold an index into this list.
export const PALETTE = [
  { hex: '#ff5a6e', he: 'אדום', en: 'Red' },
  { hex: '#ff9f43', he: 'כתום', en: 'Orange' },
  { hex: '#ffd23f', he: 'צהוב', en: 'Yellow' },
  { hex: '#b8e62e', he: 'ליים', en: 'Lime' },
  { hex: '#3ddc97', he: 'ירוק', en: 'Green' },
  { hex: '#4cc9f0', he: 'תכלת', en: 'Sky' },
  { hex: '#5b8cff', he: 'כחול', en: 'Blue' },
  { hex: '#b28dff', he: 'סגול', en: 'Violet' },
  { hex: '#ff8ad1', he: 'ורוד', en: 'Pink' },
  { hex: '#f3f1e7', he: 'לבן', en: 'White' },
  { hex: '#c9a27a', he: 'חול', en: 'Sand' },
  { hex: '#9aa3c7', he: 'אפור', en: 'Grey' },
];
export const DEFAULT_COLORS = [0, 2, 4, 5, 7, 8];
export const PLAYER_COLORS = DEFAULT_COLORS.map((i) => PALETTE[i].hex);

// Online play: leave empty to use the server that served the page (ws://host/ws).
// Set a full wss:// URL here if the static files are hosted somewhere else.
export const SERVER_URL = '';
export const FX_KEYS = ['fast', 'slow', 'thin', 'thick', 'ghost', 'reverse'];
export const MAX_PLAYERS = 6;

export const DEFAULT_KEYS = [
  ['ArrowLeft', 'ArrowRight'],
  ['KeyA', 'KeyD'],
  ['KeyJ', 'KeyL'],
  ['KeyV', 'KeyN'],
  ['Digit1', 'KeyQ'],
  ['Digit9', 'Digit0'],
];

export const POWERUP_RADIUS = 15;
export const POWERUP_LIFE = 14;
export const POWERUP_MAX = 4;

// target: who is affected. fx: which timed effect is set on them.
export const POWERUPS = [
  { id: 'fast', target: 'self', fx: 'fast', dur: 5, weight: 3, label: 'טורבו' },
  { id: 'slow', target: 'self', fx: 'slow', dur: 6, weight: 3, label: 'האטה' },
  { id: 'thin', target: 'self', fx: 'thin', dur: 8, weight: 3, label: 'קו דק' },
  { id: 'ghost', target: 'self', fx: 'ghost', dur: 3.5, weight: 2, label: 'רוח רפאים' },
  { id: 'fastOthers', target: 'others', fx: 'fast', dur: 4, weight: 3, label: 'טורבו ליריבים' },
  { id: 'thickOthers', target: 'others', fx: 'thick', dur: 7, weight: 3, label: 'קו עבה ליריבים' },
  { id: 'reverseOthers', target: 'others', fx: 'reverse', dur: 5, weight: 2, label: 'היפוך מקשים' },
  { id: 'clear', target: 'all', fx: null, dur: 0, weight: 2, label: 'ניקוי' },
  { id: 'wrap', target: 'all', fx: 'wrap', dur: 8, weight: 2, label: 'קירות פתוחים' },
];

export const FX_MULT = { fast: 1.6, slow: 0.6, thin: 0.5, thick: 2 };

export const TARGET_COLORS = { self: '#3ddc97', others: '#ff5a6e', all: '#4cc9f0' };

export const BOT_LEVELS = {
  easy: { look: 70, every: 14, mistake: 0.08, seek: false, heads: false, adapt: 99 },
  medium: { look: 120, every: 8, mistake: 0, seek: true, heads: false, adapt: 1.5 },
  hard: { look: 190, every: 4, mistake: 0, seek: true, heads: true, adapt: 0.4 },
};

export const LENGTHS = { short: 5, normal: 10, long: 15 };

// Small seedable PRNG (mulberry32).
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
