// The Back button logic, run against a small fake of the browser's history.
// Every dialog, the game screen and an online room own one history entry.

import test from 'node:test';
import assert from 'node:assert/strict';

const settle = () => new Promise((r) => setTimeout(r, 5));

// A browser history with a Back button, Forward button and popstate events.
function fakeBrowser(entries = [null]) {
  const stack = entries.map((state) => ({ state }));
  let index = stack.length - 1;
  const listeners = [];
  const fire = () => listeners.forEach((fn) => fn({ state: stack[index].state }));
  globalThis.history = {
    get state() { return stack[index].state; },
    pushState(state) { stack.splice(index + 1); stack.push({ state }); index++; },
    replaceState(state) { stack[index].state = state; },
    go(n) {
      const to = index + n;
      if (to < 0 || to >= stack.length) return;
      index = to;
      setTimeout(fire, 0); // popstate is asynchronous in a real browser
    },
  };
  globalThis.window = { addEventListener: (type, fn) => type === 'popstate' && listeners.push(fn) };
  return {
    back: () => globalThis.history.go(-1),
    forward: () => globalThis.history.go(1),
    get index() { return index; },
    get length() { return stack.length; },
  };
}

let n = 0;
async function load(entries) {
  const browser = fakeBrowser(entries);
  const mod = await import(`../src/engine/backButton.js?case=${n++}`); // fresh module state each time
  await settle();
  return { ...mod, browser };
}

test('an open layer owns one history entry, and closing it in code gives it back', async () => {
  const { addLayer, removeLayer, browser } = await load();
  const layer = addLayer(() => {});
  await settle();
  assert.equal(browser.length, 2);
  removeLayer(layer);
  await settle();
  assert.equal(browser.index, 0);
});

test('Back closes the top layer and calls its onBack once', async () => {
  const { addLayer, browser } = await load();
  let calls = 0;
  addLayer(() => calls++);
  await settle();
  browser.back();
  await settle();
  assert.equal(calls, 1);
  assert.equal(browser.index, 0, 'we are back on the page entry, not left the site');
});

test('closing a layer that Back already closed does not go back a second time', async () => {
  const { addLayer, removeLayer, browser } = await load();
  const bottom = addLayer(() => {});
  const top = addLayer(() => removeLayer(top)); // a dialog closes itself when told to
  await settle();
  assert.equal(browser.index, 2);
  browser.back();
  await settle();
  assert.equal(browser.index, 1, 'only the top layer went away');
  removeLayer(bottom);
  await settle();
  assert.equal(browser.index, 0);
});

test('two layers opened in the same moment take two Back presses', async () => {
  const { addLayer, removeLayer, browser } = await load();
  const order = [];
  const a = addLayer(() => (order.push('a'), removeLayer(a)));
  const b = addLayer(() => (order.push('b'), removeLayer(b)));
  await settle();
  assert.equal(browser.length, 3);
  browser.back();
  await settle();
  browser.back();
  await settle();
  assert.deepEqual(order, ['b', 'a']);
  assert.equal(browser.index, 0);
});

test('a layer closed in code does not trigger its own onBack', async () => {
  const { addLayer, removeLayer } = await load();
  let calls = 0;
  const layer = addLayer(() => calls++);
  await settle();
  removeLayer(layer);
  await settle();
  assert.equal(calls, 0);
});

test('a sticky layer (the game screen) stays open on Back and keeps its entry', async () => {
  const { addLayer, browser } = await load();
  let calls = 0;
  addLayer(() => calls++, true);
  await settle();
  browser.back();
  await settle();
  assert.equal(calls, 1);
  assert.equal(browser.index, 1, 'the entry was put back, so the next Back is caught too');
  browser.back();
  await settle();
  assert.equal(calls, 2);
});

test('a dialog over a sticky layer closes first, then the layer hears Back', async () => {
  const { addLayer, removeLayer, browser } = await load();
  const log = [];
  addLayer(() => log.push('game'), true);
  const dialog = addLayer(() => (log.push('dialog'), removeLayer(dialog)));
  await settle();
  browser.back();
  await settle();
  browser.back();
  await settle();
  assert.deepEqual(log, ['dialog', 'game']);
});

test('the Forward button is undone', async () => {
  const { addLayer, browser } = await load();
  let calls = 0;
  addLayer(() => calls++, true);
  await settle();
  browser.back();
  await settle();
  const before = browser.index;
  browser.forward();
  await settle();
  assert.equal(browser.index, before);
  assert.equal(calls, 1, 'Forward is not a Back');
});

test('entries left over from before a reload are walked back over', async () => {
  const { browser } = await load([null, { kavoomDepth: 1 }, { kavoomDepth: 2 }]);
  await settle();
  assert.equal(browser.index, 0);
});
