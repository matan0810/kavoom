// Where the arena goes on the screen.
//
// The arena is wider than it is tall. On a tall box (an upright phone) it is
// drawn turned 90 degrees so it fills the screen. Steering is relative to each
// line, so turning the picture changes nothing about how the game is played.

import { ARENA } from '../../shared/config.js';

const RATIO = ARENA.w / ARENA.h;
const MIN = 120;

// The largest arena that fits in a box of boxW x boxH pixels, lying down or standing up.
// Returns { w, h, rotated }: the size of the canvas on screen.
export function fitArena(boxW, boxH) {
  const flatW = Math.min(boxW, boxH * RATIO);
  const tallW = Math.min(boxW, boxH / RATIO);
  const flat = { w: flatW, h: flatW / RATIO, rotated: false };
  const tall = { w: tallW, h: tallW * RATIO, rotated: true };
  // Turn it only when that is clearly bigger, so a nearly square window does not flip back and forth.
  const best = tall.w * tall.h > flat.w * flat.h * 1.25 ? tall : flat;
  return {
    w: Math.max(MIN, Math.floor(best.w)),
    h: Math.max(MIN, Math.floor(best.h)),
    rotated: best.rotated,
  };
}
