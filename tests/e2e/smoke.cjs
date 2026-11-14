// Browser smoke test: drives the built site in a real Chromium, on a desktop and on an
// emulated phone, in Hebrew and English, locally and online with two players.
//
//   npm run build && npm run e2e
//
// Needs Playwright with a Chromium (preinstalled in cloud sessions). It is not part of
// `npm test`, so CI and the Render build do not download a browser. Safari and Firefox
// are not covered: only Chromium is installed in cloud sessions.

const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');

const settle = (p, ms = 350) => p.waitForTimeout(ms);
const text = (p, sel) => p.textContent(sel);
const historyDepth = (p) => p.evaluate(() => (history.state && history.state.kavoomDepth) || 0);

async function main() {
  const { startServer } = await import('../../server/server.js');
  const app = startServer({ port: 0, log: () => {} });
  await new Promise((r) => app.server.once('listening', r));
  const url = `http://localhost:${app.server.address().port}/`;
  const browser = await chromium.launch();
  const problems = [];
  const watch = (page, tag) => {
    page.on(
      'console',
      (m) => ['error', 'warning'].includes(m.type()) && problems.push(`${tag}: ${m.text()}`),
    );
    page.on('pageerror', (e) => problems.push(`${tag}: ${e.message}`));
  };
  const open = async (opts, tag) => {
    const page = await (await browser.newContext(opts)).newPage();
    watch(page, tag);
    return page;
  };
  const step = (name) => console.log(`ok  ${name}`);

  // ---------- Phone, Hebrew, one device ----------
  const phone = await open({ ...devices['iPhone 13'], locale: 'he-IL' }, 'phone-he');
  await phone.goto(url);
  await settle(phone, 600);
  assert.equal(await phone.evaluate(() => document.documentElement.dir), 'rtl');
  assert.ok(
    await phone.evaluate(
      () =>
        document.querySelector('.menu').scrollWidth <= document.querySelector('.menu').clientWidth,
    ),
    'menu has no sideways scroll',
  );
  const small = await phone.evaluate(() =>
    [...document.querySelectorAll('.btn, .seg button, .tabs button')]
      .filter((b) => b.offsetParent && b.getBoundingClientRect().height < 40)
      .map((b) => b.textContent),
  );
  assert.deepEqual(small, [], 'every menu button is a comfortable tap target');
  step('phone menu: fits the width, big buttons');

  await phone.click('.start-bar .btn');
  await settle(phone, 4500);
  const box = await phone.evaluate(() => {
    const c = document.querySelector('canvas.arena').getBoundingClientRect();
    return { w: c.width, h: c.height, vh: innerHeight, vw: innerWidth };
  });
  assert.ok(box.h > box.w, 'the arena stands up on an upright phone');
  assert.ok(
    box.h > box.vh * 0.55,
    `the arena uses most of the height (${Math.round(box.h)} of ${box.vh})`,
  );
  assert.equal(
    await phone.$$eval('.side-actions .btn', (n) => n.length),
    1,
    'one menu button on small screens',
  );
  assert.equal(await phone.$$eval('.padbtn', (n) => n.length), 2, 'two thumb buttons');
  assert.equal(await phone.evaluate(() => window.__kavoom.game.ui.state), 'playing');
  step('phone game: tall arena, one menu button, thumb pads');

  // Back button: pause dialog, then resume, then dialog and out to the menu.
  await phone.goBack();
  await settle(phone);
  assert.equal(await phone.evaluate(() => window.__kavoom.game.paused), true);
  assert.ok(await phone.$('.card'));
  await phone.goBack();
  await settle(phone);
  assert.equal(await phone.$('.card'), null, 'a second Back closes the dialog');
  assert.equal(
    await phone.evaluate(() => window.__kavoom.game.ui.state),
    'playing',
    'and the match is still on',
  );
  assert.equal(await phone.evaluate(() => location.pathname), '/', 'we never left the page');
  await phone.goBack();
  await settle(phone);
  await phone.click('.overlay-actions .btn:last-child'); // main menu
  await settle(phone);
  assert.equal(await phone.evaluate(() => window.__kavoom.game.ui.state), 'idle');
  assert.ok(await phone.$('.menu'));
  assert.equal(await historyDepth(phone), 0, 'no history entries left behind');
  step('phone: Back opens the game menu, closes it, never leaves the site');

  // Settings dialog on the menu closes with Back.
  await phone.click('.bar-end .btn');
  await settle(phone);
  assert.ok(await phone.$('.card'));
  await phone.goBack();
  await settle(phone);
  assert.equal(await phone.$('.card'), null);
  assert.ok(await phone.$('.menu'));
  step('menu: Back closes the settings dialog');

  // Colour picker and a second human on the phone.
  await phone.click('.slot:nth-child(2) .seg button:nth-child(2)');
  await phone.click('.start-bar .btn');
  await settle(phone, 600);
  assert.equal(await phone.$$eval('.pad', (n) => n.length), 2, 'one pair of buttons per human');
  step('phone: two humans get two pairs of buttons');

  // Landscape phone: pads on both sides of the arena.
  const land = await open({ ...devices['iPhone 13 landscape'], locale: 'en-US' }, 'phone-land');
  await land.goto(url);
  await land.click('.start-bar .btn');
  await settle(land, 800);
  const l = await land.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    return {
      arena: r('canvas.arena'),
      left: r('.padbtn:first-child'),
      right: r('.padbtn:last-child'),
    };
  });
  assert.ok(l.arena.width > l.arena.height, 'lying down in landscape');
  assert.ok(
    l.left.right <= l.arena.left + 2 && l.right.left >= l.arena.right - 2,
    'pads sit on both sides',
  );
  step('landscape phone: arena between two pads');

  // ---------- Desktop, both languages ----------
  for (const locale of ['he-IL', 'en-US']) {
    const d = await open({ viewport: { width: 1280, height: 800 }, locale }, `desktop-${locale}`);
    await d.goto(url);
    await settle(d, 500);
    await d.click('.start-bar .btn');
    await settle(d, 4200);
    assert.equal(
      await d.$$eval('.side-actions .btn', (n) => n.length),
      3,
      'rail with pause, settings, menu',
    );
    await d.keyboard.press('Space');
    await settle(d, 250);
    assert.equal(await d.evaluate(() => window.__kavoom.game.paused), true);
    await d.keyboard.press('Space');
    await settle(d, 250);
    assert.equal(await d.evaluate(() => window.__kavoom.game.paused), false);
    await d.keyboard.press('Escape');
    await settle(d, 250);
    assert.equal(await d.evaluate(() => window.__kavoom.game.paused), true, 'Esc pauses');
    step(`desktop ${locale}: rail, Space and Esc`);
  }

  // ---------- Online: a desktop host and a phone guest ----------
  const host = await open({ viewport: { width: 1280, height: 800 }, locale: 'en-US' }, 'host');
  await host.goto(url);
  await host.click('.tabs button:nth-child(2)');
  await host.fill('.menu-grid.online .field', 'Dana');
  await host.click('.btn.primary.big');
  await host.waitForSelector('.room-code');
  const code = (await text(host, '.room-code')).trim();
  assert.match(code, /^[A-Z]{4}$/);

  const guest = await open({ ...devices['iPhone 13'], locale: 'he-IL' }, 'guest');
  await guest.goto(`${url}#${code}`);
  await settle(guest, 500);
  assert.equal(await guest.inputValue('.field.code'), code, 'the shared link fills in the code');
  await guest.click('.join-row .btn');
  await guest.waitForSelector('.room-code');
  assert.equal(
    await guest.evaluate(() => location.hash),
    '',
    'the code leaves the address once joined',
  );
  assert.deepEqual(await host.$$eval('.member .who', (n) => n.map((x) => x.textContent)), [
    'Dana (You)',
    'שחקן',
  ]);
  step('online: create, join through the link, both see each other');

  await host.click('.room-actions .btn.primary');
  await guest.waitForSelector('.game');
  await settle(guest, 3500);
  assert.equal(await guest.evaluate(() => window.__kavoom.game.ui.state), 'playing');
  assert.equal(await guest.evaluate(() => window.__kavoom.game.myIndex), 1);
  assert.ok(
    await guest.evaluate(() => window.__kavoom.game.view.players.length === 2),
    'snapshots arrive',
  );
  step('online: both in the match, snapshots arriving');

  await guest.goBack(); // leave dialog
  await settle(guest);
  assert.match(await text(guest, '.card h2'), /לעזוב/);
  await guest.goBack();
  await settle(guest);
  assert.equal(await guest.$('.card'), null);
  assert.equal(
    await guest.evaluate(() => window.__kavoom.game.ui.state),
    'playing',
    'the match went on',
  );
  await guest.goBack();
  await settle(guest);
  await guest.click('.overlay-actions .btn:last-child'); // leave room
  await settle(guest, 500);
  assert.ok(await guest.$('.join-row'), 'back at the join form');
  assert.equal(await historyDepth(guest), 0);
  step('online: Back asks before leaving, then leaving returns to the join form');

  await host.click('.side-actions .btn:last-child');
  await host.click('.overlay-actions .btn:last-child');
  await settle(host, 400);
  await host.click('.btn.primary.big'); // a new room
  await host.waitForSelector('.room-code');
  await host.goBack();
  await settle(host, 400);
  assert.ok(await host.$('.join-row'), 'Back in a lobby leaves the room');
  step('online: Back in a lobby leaves the room');

  await browser.close();
  await app.close();
  assert.deepEqual(problems, [], 'no console errors, warnings or CSP violations');
  step('no console errors or CSP violations');
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
