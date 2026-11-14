import test from 'node:test';
import assert from 'node:assert/strict';

let stored = null;
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => stored, setItem: (k, v) => (stored = v) },
  configurable: true,
});
const { loadStats, recordMatch, saveStats } = await import('../src/state/stats.js');

test('a new device has an empty record', () => {
  stored = null;
  assert.deepEqual(loadStats(), { matches: 0, wins: 0, streak: 0, best: 0 });
});

test('wins build a streak, a loss ends it, and the best streak is kept', () => {
  let s = loadStats();
  for (const won of [true, true, true, false, true]) s = recordMatch(s, won);
  assert.deepEqual(s, { matches: 5, wins: 4, streak: 1, best: 3 });
});

test('the record survives saving and loading', () => {
  const s = recordMatch(recordMatch(loadStats(), true), false);
  saveStats(s);
  assert.deepEqual(loadStats(), s);
});

test('a broken or impossible saved record starts over', () => {
  for (const bad of [
    '{nope',
    '"text"',
    '{"matches":-3}',
    '{"matches":2,"wins":9}',
    '{"matches":5,"wins":2,"streak":1,"best":4}',
  ]) {
    stored = bad;
    assert.deepEqual(loadStats(), { matches: 0, wins: 0, streak: 0, best: 0 }, bad);
  }
  stored = '{"matches":1.5,"wins":"x"}';
  assert.equal(loadStats().matches, 0);
});
