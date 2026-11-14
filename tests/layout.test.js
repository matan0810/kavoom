import test from 'node:test';
import assert from 'node:assert/strict';
import { fitArena } from '../src/engine/layout.js';

test('a wide box keeps the arena lying down and fills its width', () => {
  const r = fitArena(1000, 500);
  assert.equal(r.rotated, false);
  assert.equal(r.w, 777); // limited by height: 500 * 1120 / 720
  assert.ok(Math.abs(r.w / r.h - 1120 / 720) < 0.02);
});

test('an upright phone turns the arena and uses far more of the screen', () => {
  const r = fitArena(360, 560);
  assert.equal(r.rotated, true);
  assert.ok(Math.abs(r.h / r.w - 1120 / 720) < 0.02, 'stands up: taller than wide');
  const flatArea = 360 * (360 / (1120 / 720));
  assert.ok(r.w * r.h > flatArea * 2, 'at least twice the area of the lying-down arena');
  assert.ok(r.w <= 360 && r.h <= 560, 'fits inside the box');
});

test('a nearly square box does not flip the arena', () => {
  assert.equal(fitArena(700, 600).rotated, false);
  assert.equal(fitArena(600, 650).rotated, false);
  assert.equal(fitArena(600, 700).rotated, true); // a portrait tablet is tall enough to turn
});

test('a tiny box still gives a usable size', () => {
  const r = fitArena(10, 10);
  assert.ok(r.w >= 120 && r.h >= 120);
});
