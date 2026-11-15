// The service worker (public/sw.js), run in a sandbox with a fake network and
// a fake cache, so its choices can be checked without a browser.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const ORIGIN = 'https://kavoom.test';
const SOURCE = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const EXTRAS = [
  '/favicon.svg',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

const gamePage = (asset) =>
  `<!doctype html><html><head><script type="module" crossorigin src="/assets/${asset}.js"></script></head><body><div id="root"></div></body></html>`;
// What the host sends while the free server sleeps: a page of its own.
const WAKING_PAGE =
  '<!doctype html><html><body><h1>APPLICATION LOADING</h1><script src="https://host.example/x.js"></script></body></html>';

function sandbox() {
  const routes = new Map(); // path -> body, or a function returning a Response
  const store = new Map(); // absolute URL -> Response
  const handlers = {};
  const abs = (r) => new URL(typeof r === 'string' ? r : r.url, ORIGIN).href;
  const fetch = async (r) => {
    const route = routes.get(new URL(abs(r)).pathname);
    if (route === undefined) throw new TypeError('network down');
    return typeof route === 'function' ? route() : new Response(route, { status: 200 });
  };
  const cache = {
    put: async (r, res) => void store.set(abs(r), res),
    addAll: async (list) => {
      for (const r of list) store.set(abs(r), await fetch(r));
    },
    keys: async () => [...store.keys()].map((url) => ({ url })),
    delete: async (r) => store.delete(abs(r)),
  };
  const caches = {
    open: async () => cache,
    keys: async () => ['kavoom-v1'],
    delete: async () => true,
    match: async (r) => store.get(abs(r))?.clone(),
  };
  const self = {
    location: new URL(ORIGIN),
    addEventListener: (type, fn) => (handlers[type] = fn),
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  vm.runInNewContext(SOURCE, { self, caches, fetch, URL, Response, setTimeout, Promise });
  for (const path of EXTRAS) routes.set(path, 'file');

  return {
    routes,
    stored: () => [...store.keys()].map((u) => new URL(u).pathname).sort(),
    savedPage: () => store.get(`${ORIGIN}/`)?.clone().text(),
    async install() {
      let done;
      handlers.install({ waitUntil: (p) => (done = p) });
      return done;
    },
    async open(path = '/') {
      let answer;
      handlers.fetch({
        request: { method: 'GET', url: ORIGIN + path, mode: 'navigate' },
        respondWith: (p) => (answer = p),
      });
      const res = await answer;
      await new Promise((r) => setTimeout(r, 10)); // let the background save finish
      return res.text();
    },
  };
}

test('installing saves the page, its script and the icons', async () => {
  const sw = sandbox();
  sw.routes.set('/', gamePage('one'));
  sw.routes.set('/assets/one.js', 'code');
  await sw.install();
  assert.deepEqual(sw.stored(), ['/', '/assets/one.js', ...EXTRAS].sort());
});

test('the waking-up page never replaces the saved game', async () => {
  const sw = sandbox();
  sw.routes.set('/', gamePage('one'));
  sw.routes.set('/assets/one.js', 'code');
  await sw.install();

  sw.routes.set('/', WAKING_PAGE); // the server went to sleep
  assert.equal(
    await sw.open(),
    gamePage('one'),
    'the player gets the game, not the waiting screen',
  );
  assert.equal(await sw.savedPage(), gamePage('one'));
  assert.ok(sw.stored().includes('/assets/one.js'), 'and its script is still saved');
});

test('installing while the server is waking up fails, so it is tried again later', async () => {
  const sw = sandbox();
  sw.routes.set('/', WAKING_PAGE);
  await assert.rejects(sw.install());
  assert.deepEqual(sw.stored(), []);
});

test('with nothing saved yet, the network answer is shown as it is', async () => {
  const sw = sandbox();
  sw.routes.set('/', WAKING_PAGE);
  assert.equal(await sw.open(), WAKING_PAGE);
});

test('a new release replaces the page and drops the old script', async () => {
  const sw = sandbox();
  sw.routes.set('/', gamePage('one'));
  sw.routes.set('/assets/one.js', 'old code');
  await sw.install();
  sw.routes.set('/', gamePage('two'));
  sw.routes.set('/assets/two.js', 'new code');
  assert.equal(await sw.open(), gamePage('two'));
  assert.ok(sw.stored().includes('/assets/two.js'));
  assert.ok(!sw.stored().includes('/assets/one.js'));
});

test('with no network at all, the saved game opens', async () => {
  const sw = sandbox();
  sw.routes.set('/', gamePage('one'));
  sw.routes.set('/assets/one.js', 'code');
  await sw.install();
  sw.routes.delete('/');
  assert.equal(await sw.open(), gamePage('one'));
});
