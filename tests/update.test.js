import test from 'node:test';
import assert from 'node:assert/strict';
import { isNewer, liveVersion } from '../src/state/update.js';

test('the live version is read only from a plain answer', () => {
  assert.equal(liveVersion('{"version":"1.7.0"}'), '1.7.0');
  for (const body of [
    '',
    'null',
    '<html>waking up</html>',
    '{"version":1}',
    '{"version":"1.7"}',
    '{"version":"1.7.0; rm"}',
  ]) {
    assert.equal(liveVersion(body), null, body);
  }
});

test('only a newer live version counts', () => {
  assert.equal(isNewer('1.7.0', '1.6.0'), true);
  assert.equal(isNewer('1.10.0', '1.9.3'), true, 'numbers, not text');
  assert.equal(isNewer('2.0.0', '1.99.99'), true);
  assert.equal(isNewer('1.7.0', '1.7.0'), false);
  assert.equal(isNewer('1.6.0', '1.7.0'), false, 'an old server during a deploy');
  assert.equal(isNewer(null, '1.7.0'), false);
  assert.equal(isNewer('1.7.0', 'dev'), false);
});
