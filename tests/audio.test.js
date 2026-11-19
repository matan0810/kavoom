// Sound is switched on only from a touch or key press: anything else is refused
// by browsers and makes them complain.

import test from 'node:test';
import assert from 'node:assert/strict';

let created = 0;
class FakeAudioContext {
  constructor() {
    created++;
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
  }
  resume() {
    return Promise.resolve();
  }
  createOscillator() {
    return {
      frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect: (g) => g,
      start() {},
      stop() {},
    };
  }
  createGain() {
    return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (d) => d };
  }
}
globalThis.window = { AudioContext: FakeAudioContext };
const { Sfx } = await import('../src/engine/audio.js');

test('no audio is switched on before the first touch, so a sound then stays silent', () => {
  const sfx = new Sfx();
  sfx.death();
  sfx.tick();
  assert.equal(created, 0);
});

test('after a touch, sounds play', () => {
  const sfx = new Sfx();
  sfx.unlock();
  assert.equal(created, 1);
  assert.doesNotThrow(() => sfx.death());
  sfx.unlock();
  assert.equal(created, 1, 'switched on once');
});
