// Service worker: keeps a copy of the game on the device, so it opens at once
// and "one device" play works with no connection at all.
//
// - The page itself ("/") is fetched from the network when the network answers
//   quickly, so a new release shows up on the next visit. If the network is
//   slow (the server is waking up) or gone, the saved copy is used.
// - Files in /assets/ have a hash of their content in the name and never
//   change, so the saved copy is always right.
// - Online play (/ws) and anything on another site are left alone.
// - While the free server is asleep, the host answers with its own "waking up"
//   page. That page is never saved over the game: only a page that really is
//   the game (it has the app's root element and its script) replaces the copy.

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

// The font files a stylesheet uses (woff2 only: every browser with a service worker reads it).
function fontsOf(css) {
  return [...css.matchAll(/url\(["']?(\/assets\/[^"')]+\.woff2)["']?\)/g)].map((m) => m[1]);
}

function isGamePage(html) {
  return html.includes('<div id="root">') && assetsOf(html).length > 0;
}

// Save a fresh page with everything it needs, and drop assets no page uses any more.
async function savePage(response, html) {
  const cache = await caches.open(CACHE);
  const linked = assetsOf(html);
  await cache.addAll([...EXTRAS, ...linked]);
  const fonts = [];
  for (const path of linked.filter((p) => p.endsWith('.css'))) {
    const css = await (await cache.match(path)).text();
    fonts.push(...fontsOf(css));
  }
  await cache.addAll(fonts);
  const assets = [...linked, ...fonts];
  await cache.put(PAGE, response);
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/assets/') && !assets.includes(path)) await cache.delete(request);
  }
}

// The network's answer for the page, and a promise that settles once it has
// been checked and, if it is the game, saved. The check fails for anything
// else, such as the host's waking-up page.
function fetchPage() {
  const network = fetch(PAGE, { cache: 'no-store' });
  const saved = network.then(async (response) => {
    const html = response.ok ? await response.clone().text() : '';
    if (!isGamePage(html)) throw new Error('not the game page');
    await savePage(response.clone(), html);
    return response;
  });
  return { network, saved };
}

// The fresh game page if it comes in time, the saved one otherwise. With no
// saved copy yet, whatever the network sent is shown, waking-up page included.
async function page() {
  const { network, saved: fresh } = fetchPage();
  const saved = await caches.match(PAGE);
  if (!saved) return fresh.catch(() => network);
  fresh.catch(() => {}); // a failure here just means we stay on the saved page
  const late = new Promise((resolve) => setTimeout(() => resolve(saved), PAGE_WAIT_MS));
  return Promise.race([fresh.catch(() => saved), late]);
}

async function savedFirst(request) {
  return (await caches.match(request)) || fetch(request);
}

self.addEventListener('install', (event) => {
  // If the server is still waking up, installing fails and is tried again on the next visit.
  event.waitUntil(fetchPage().saved.then(() => self.skipWaiting()));
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
