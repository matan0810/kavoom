// Saved settings: whatever is in storage, the game gets only valid values.

import test from 'node:test';
import assert from 'node:assert/strict';

function setEnv({ stored, languages = ['en-US'], zone = 'Europe/London' } = {}) {
  Object.defineProperty(globalThis, 'navigator', { value: { languages, language: languages[0] }, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: () => (stored === undefined ? null : typeof stored === 'string' ? stored : JSON.stringify(stored)),
      setItem: (k, v) => { setEnv.saved = v; },
    },
    configurable: true,
  });
  const real = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function () { return { resolvedOptions: () => ({ timeZone: zone }) }; };
  return () => { Intl.DateTimeFormat = real; };
}

const { loadSettings, saveSettings } = await import('../src/state/settings.js');
const withEnv = (opts, fn) => {
  const restore = setEnv(opts);
  try {
    return fn();
  } finally {
    restore();
  }
};

test('defaults: English outside Israel, Hebrew for a Hebrew browser or an Israeli clock', () => {
  assert.equal(withEnv({}, loadSettings).lang, 'en');
  assert.equal(withEnv({ languages: ['he-IL', 'en'] }, loadSettings).lang, 'he');
  assert.equal(withEnv({ languages: ['iw'] }, loadSettings).lang, 'he');
  assert.equal(withEnv({ zone: 'Asia/Jerusalem' }, loadSettings).lang, 'he');
});

test('default players: one human, two bots, three off, six different colours', () => {
  const s = withEnv({}, loadSettings);
  assert.deepEqual(s.players.map((p) => p.mode), ['human', 'bot', 'bot', 'off', 'off', 'off']);
  assert.equal(new Set(s.players.map((p) => p.color)).size, 6);
});

test('a good saved value is kept', () => {
  const s = withEnv({ stored: { lang: 'he', length: 'long', botLevel: 'hard', volume: 0.25, online: { name: 'Dana', color: 3 } } }, loadSettings);
  assert.equal(s.lang, 'he');
  assert.equal(s.length, 'long');
  assert.equal(s.botLevel, 'hard');
  assert.equal(s.volume, 0.25);
  assert.deepEqual(s.online, { name: 'Dana', color: 3 });
});

test('bad saved values are replaced by defaults or clamped', () => {
  const s = withEnv({
    stored: {
      lang: 'fr', tab: '<script>', length: 'huge', pads: 7, volume: 5,
      players: [{ mode: 'admin', name: 'x'.repeat(50), color: 99, keys: ['KeyA'] }],
      online: { name: 'y'.repeat(50), color: -1 },
    },
  }, loadSettings);
  assert.equal(s.lang, 'en');
  assert.equal(s.tab, 'local');
  assert.equal(s.length, 'normal');
  assert.equal(s.pads, 'auto');
  assert.equal(s.volume, 1);
  assert.equal(s.players[0].mode, 'human');
  assert.equal(s.players[0].name.length, 10);
  assert.equal(s.players[0].color, 0);
  assert.equal(s.players[0].keys.length, 2);
  assert.equal(s.online.name.length, 10);
  assert.equal(s.online.color, 0);
});

test('two players saved with the same colour fall back to the default colours', () => {
  const s = withEnv({ stored: { players: [{ color: 4 }, { color: 4 }] } }, loadSettings);
  assert.equal(new Set(s.players.map((p) => p.color)).size, 6);
});

test('broken or missing storage gives the defaults', () => {
  assert.equal(withEnv({ stored: 'not json{' }, loadSettings).length, 'normal');
  assert.equal(withEnv({}, loadSettings).players.length, 6);
});

test('saving writes JSON that loads back the same', () => {
  const restore = setEnv();
  try {
    const s = loadSettings();
    s.length = 'long';
    saveSettings(s);
    restore();
    const back = withEnv({ stored: setEnv.saved }, loadSettings);
    assert.equal(back.length, 'long');
  } finally {
    restore();
  }
});
