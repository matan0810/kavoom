import test from 'node:test';
import assert from 'node:assert/strict';

let stored = null;
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: () => stored,
    setItem: (k, v) => (stored = v),
    removeItem: () => (stored = null),
  },
  configurable: true,
});
const { SESSION_MAX_AGE_MS, clearSession, loadSession, saveSession } =
  await import('../src/state/session.js');

test('a seat is remembered, and forgotten on request', () => {
  saveSession({ code: 'ABCD', token: 'seat-1' }, 1000);
  assert.deepEqual(loadSession(2000), { code: 'ABCD', token: 'seat-1' });
  clearSession();
  assert.equal(loadSession(2000), null);
});

test('an old seat is not returned to', () => {
  saveSession({ code: 'ABCD', token: 'seat-1' }, 1000);
  assert.equal(loadSession(1000 + SESSION_MAX_AGE_MS + 1), null);
  assert.equal(loadSession(500), null, 'nor one from the future');
});

test('a broken or forged record is ignored', () => {
  for (const bad of [
    '{x',
    '"text"',
    '{"code":"abcd","token":"t","at":1}',
    '{"code":"ABCD","token":"","at":1}',
    `{"code":"ABCD","token":"${'x'.repeat(65)}","at":1}`,
    '{"code":"ABCD","token":"t"}',
  ]) {
    stored = bad;
    assert.equal(loadSession(2), null, bad);
  }
});
