// How a line's head moves, on its own: no trails, no collisions.
//
// The round uses speedAndTurn for every player. The browser uses moveHead to
// predict its own head a moment ahead of the server (src/engine/prediction.js);
// tests/prediction.test.js checks that it moves exactly as the round does.

import { BASE, FX_MULT } from '../config.js';

// Speed (units/s) and turn rate (rad/s) under the active effects. The turn rate
// grows with the square root of the speed, so a fast line stays steerable.
export function speedAndTurn(fx) {
  const factor = (fx.fast > 0 ? FX_MULT.fast : 1) * (fx.slow > 0 ? FX_MULT.slow : 1);
  return { speed: BASE.speed * factor, turn: BASE.turn * Math.sqrt(factor) };
}

// Advance head ({ x, y, angle }) by dt seconds with the given input (-1, 0, 1).
// arena: { w, h }. With open walls the head comes back on the opposite side.
export function moveHead(head, input, fx, dt, arena, openWalls) {
  const { speed, turn } = speedAndTurn(fx);
  head.angle += (fx.reverse > 0 ? -input : input) * turn * dt;
  head.x += Math.cos(head.angle) * speed * dt;
  head.y += Math.sin(head.angle) * speed * dt;
  if (openWalls) {
    head.x = ((head.x % arena.w) + arena.w) % arena.w;
    head.y = ((head.y % arena.h) + arena.h) % arena.h;
  }
}
