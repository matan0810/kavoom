// Service worker: keeps a copy of the game on the device, so it opens at once
// and "one device" play works with no connection at all.
//
// - The page itself ("/") is fetched from the network when the network answers
//   quickly, so a new release shows up on the next visit. If the network is
//   slow (the server is waking up) or gone, the saved copy is used.
// - Files in /assets/ have a hash of their content in the name and never
//   change, so the saved copy is always right.
// - Online play (/ws) and anything on another site are left alone.

const CACHE = 'kavoom-v1';
const PAGE = '/';
const EXTRAS = [
  '/favicon.svg',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];
const PAGE_WAIT_MS = 2500; // how long to wait for the network before showing the saved page

// The script and stylesheet a page links to.
function assetsOf(html) {
  return [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
}

// Save a fresh page with everything it needs, and drop assets no page uses any more.
async function savePage(response) {
  const cache = await caches.open(CACHE);
  const assets = assetsOf(await response.clone().text());
  await cache.addAll([...EXTRAS, ...assets]);
  await cache.put(PAGE, response);
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/assets/') && !assets.includes(path)) await cache.delete(request);
  }
}

async function fetchAndSavePage() {
  const response = await fetch(PAGE, { cache: 'no-store' });
  if (!response.ok) throw new Error(`page answered ${response.status}`);
  await savePage(response.clone());
  return response;
}

// The network's page if it comes in time, the saved one otherwise.
async function page() {
  const fresh = fetchAndSavePage();
  const saved = await caches.match(PAGE);
  if (!saved) return fresh;
  fresh.catch(() => {}); // a failure here just means we stay on the saved page
  const late = new Promise((resolve) => setTimeout(() => resolve(saved), PAGE_WAIT_MS));
  return Promise.race([fresh.catch(() => saved), late]);
}

async function savedFirst(request) {
  return (await caches.match(request)) || fetch(request);
}

self.addEventListener('install', (event) => {
  event.waitUntil(fetchAndSavePage().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' || url.pathname === PAGE) event.respondWith(page());
  else if (url.pathname.startsWith('/assets/') || EXTRAS.includes(url.pathname)) {
    event.respondWith(savedFirst(request));
  }
});
