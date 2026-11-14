// The renderer's turn-the-arena mode, checked through the transform it applies.

import test from 'node:test';
import assert from 'node:assert/strict';

const calls = [];
const ctx = new Proxy(
  {},
  {
    get:
      (_, name) =>
      (...args) => {
        if (name === 'setTransform') calls.push(args);
      },
    set: () => true,
  },
);
globalThis.window = { devicePixelRatio: 1 };
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
const { Renderer } = await import('../src/engine/renderer.js');

function canvas(w, h) {
  return { width: 0, height: 0, clientWidth: w, clientHeight: h, getContext: () => ctx };
}
const apply = ([a, b, c, d, e, f], x, y) => [a * x + c * y + e, b * x + d * y + f];

test('a lying-down arena is a plain scale', () => {
  const r = new Renderer(1120, 720);
  r.attach(canvas(560, 360));
  calls.length = 0;
  r.draw(null);
  assert.deepEqual(calls[0], [0.5, 0, 0, 0.5, 0, 0]);
});

test('a standing arena is a pure rotation: corners land on corners, nothing is mirrored', () => {
  const r = new Renderer(1120, 720);
  r.rotated = true;
  r.attach(canvas(360, 560));
  calls.length = 0;
  r.draw(null);
  const m = calls[0];
  const [a, b, c, d] = m;
  assert.ok(a * d - b * c > 0, 'positive determinant: a rotation, not a mirror image');
  const corners = [
    [0, 0],
    [1120, 0],
    [0, 720],
    [1120, 720],
  ].map(([x, y]) => apply(m, x, y));
  for (const [x, y] of corners) {
    assert.ok(
      x > -0.001 && x < 360.001 && y > -0.001 && y < 560.001,
      `corner (${x}, ${y}) is on the canvas`,
    );
  }
  // Arena x runs down the screen: the arena's far end is at the bottom.
  assert.ok(apply(m, 1120, 0)[1] > apply(m, 0, 0)[1]);
});
