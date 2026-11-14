// The player's saved choices: language, players, keys, match options, sound.
// Kept in localStorage inside try/catch, so the game also works without it.

import {
  PALETTE,
  DEFAULT_COLORS,
  DEFAULT_KEYS,
  LENGTHS,
  MAX_PLAYERS,
} from '../../shared/config.js';

const STORE_KEY = 'kavoom.settings.v1';

// A shared link carries the room code in the hash: https://.../#ABCD
const linked = typeof location !== 'undefined' ? /^#([A-Za-z]{4})$/.exec(location.hash) : null;
export const LINKED_ROOM = linked ? linked[1].toUpperCase() : '';

// Hebrew for anyone whose browser prefers Hebrew or whose clock is set to Israel;
// English for everyone else. A language picked in the menu is remembered.
function detectLang() {
  const langs =
    navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || ''];
  if (langs.some((l) => /^(he|iw)\b/i.test(l))) return 'he';
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone === 'Asia/Jerusalem' || zone === 'Asia/Tel_Aviv') return 'he';
  } catch {
    /* no Intl: fall through */
  }
  return 'en';
}

function defaults() {
  return {
    lang: detectLang(),
    tab: 'local',
    players: DEFAULT_COLORS.map((color, i) => ({
      mode: i === 0 ? 'human' : i < 3 ? 'bot' : 'off',
      name: '', // empty = show the colour's name
      color,
      keys: [...DEFAULT_KEYS[i]],
    })),
    length: 'normal',
    botLevel: 'medium',
    powerups: 'on',
    sound: 'on',
    volume: 0.7,
    shake: 'on',
    pads: 'auto',
    online: { name: '', color: 0 },
  };
}

// Every saved value is checked against these closed lists before it is used.
const CHOICES = {
  lang: ['he', 'en'],
  tab: ['local', 'online'],
  length: Object.keys(LENGTHS),
  botLevel: ['easy', 'medium', 'hard'],
  powerups: ['on', 'off'],
  sound: ['on', 'off'],
  shake: ['on', 'off'],
  pads: ['auto', 'on', 'off'],
};
const validColor = (c) => Number.isInteger(c) && c >= 0 && c < PALETTE.length;

export function loadSettings() {
  const base = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved) {
      for (const k in CHOICES) if (CHOICES[k].includes(saved[k])) base[k] = saved[k];
      if (typeof saved.volume === 'number') base.volume = Math.min(1, Math.max(0, saved.volume));
      (saved.players || []).slice(0, MAX_PLAYERS).forEach((p, i) => {
        const slot = base.players[i];
        if (['human', 'bot', 'off'].includes(p.mode)) slot.mode = p.mode;
        if (typeof p.name === 'string') slot.name = p.name.slice(0, 10);
        if (validColor(p.color)) slot.color = p.color;
        if (
          Array.isArray(p.keys) &&
          p.keys.length === 2 &&
          p.keys.every((c) => typeof c === 'string')
        )
          slot.keys = p.keys;
      });
      if (new Set(base.players.map((p) => p.color)).size < MAX_PLAYERS)
        base.players.forEach((p, i) => (p.color = DEFAULT_COLORS[i]));
      if (saved.online) {
        if (typeof saved.online.name === 'string')
          base.online.name = saved.online.name.slice(0, 10);
        if (validColor(saved.online.color)) base.online.color = saved.online.color;
      }
    }
  } catch {
    /* storage unavailable: defaults are fine */
  }
  if (LINKED_ROOM) base.tab = 'online';
  return base;
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
