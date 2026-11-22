// Browser smoke test: drives the built site in a real Chromium, on a desktop and on an
// emulated phone, in Hebrew and English, locally and online with two players.
//
//   npm run build && npm run e2e
//
// Needs Playwright with a Chromium (preinstalled in cloud sessions). It is not part of
// `npm test`, so the Render build does not download a browser. Safari and Firefox are not
// covered: only Chromium is installed in cloud sessions.
//
// Every step waits for a condition on the page, never for a fixed time, and gives up after
// 5 seconds (CLAUDE.md, section 4). It also fails if any request leaves the site.

const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');

const STEP_TIMEOUT_MS = 5000;
const until = (page, fn, arg) => page.waitForFunction(fn, arg);
const shown = (page, selector) => page.waitForSelector(selector);
const hidden = (page, selector) => page.waitForSelector(selector, { state: 'detached' });
const paused = (page, value) => until(page, (v) => window.__kavoom.game.paused === v, value);
const state = (page, value) => until(page, (v) => window.__kavoom.game.ui.state === v, value);
const text = (p, sel) => p.textContent(sel);
const historyDepth = (p) => p.evaluate(() => (history.state && history.state.kavoomDepth) || 0);

async function main() {
  const { startServer } = await import('../../server/server.js');
  const app = startServer({ port: 0, log: () => {} });
  await new Promise((r) => app.server.once('listening', r));
  const url = `http://localhost:${app.server.address().port}/`;
  const browser = await chromium.launch();
  const problems = [];
  const origin = new URL(url).origin;
  const watch = (page, tag) => {
    page.on('request', (r) => {
      const at = r.url();
      if (!at.startsWith(`${origin}/`) && !at.startsWith('data:')) {
        problems.push(`${tag}: a request left the site: ${at}`);
      }
    });
    page.on(
      'console',
      (m) => ['error', 'warning'].includes(m.type()) && problems.push(`${tag}: ${m.text()}`),
    );
    page.on('pageerror', (e) => problems.push(`${tag}: ${e.message}`));
  };
  const open = async (opts, tag) => {
    const context = await browser.newContext(opts);
    context.setDefaultTimeout(STEP_TIMEOUT_MS);
    const page = await context.newPage();
    watch(page, tag);
    return page;
  };
  const step = (name) => console.log(`ok  ${name}`);

  // ---------- Phone, Hebrew, one device ----------
  const phone = await open({ ...devices['iPhone 13'], locale: 'he-IL' }, 'phone-he');
  await phone.goto(url);
  await shown(phone, '.menu .slot');
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
  // Trusted Types are enforced: the browser refuses HTML from a plain string.
  const refused = await phone.evaluate(() => {
    try {
      document.createElement('div').innerHTML = '<b>x</b>';
      return false;
    } catch {
      return true;
    }
  });
  assert.ok(refused, 'Trusted Types are on');
  problems.length = 0; // that refusal is reported as a violation, on purpose
  step('phone menu: fits the width, big buttons');

  await phone.click('.start-bar .btn');
  await phone.waitForFunction(() => window.__kavoom.game.ui.state === 'playing');
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
  await shown(phone, '.card');
  await paused(phone, true);
  await phone.goBack();
  await hidden(phone, '.card'); // a second Back closes the dialog
  assert.equal(
    await phone.evaluate(() => window.__kavoom.game.ui.state),
    'playing',
    'and the match is still on',
  );
  assert.equal(await phone.evaluate(() => location.pathname), '/', 'we never left the page');
  await phone.goBack();
  await shown(phone, '.card');
  await phone.click('.overlay-actions .btn:last-child'); // main menu
  await shown(phone, '.menu');
  await state(phone, 'idle');
  assert.equal(await historyDepth(phone), 0, 'no history entries left behind');
  step('phone: Back opens the game menu, closes it, never leaves the site');

  // Settings dialog on the menu closes with Back.
  await phone.click('.bar-end .btn:not(.help)');
  await shown(phone, '.card');
  await phone.goBack();
  await hidden(phone, '.card');
  assert.ok(await phone.$('.menu'));
  step('menu: Back closes the settings dialog');

  // The rules open from the "?" in the menu bar, start at the top, and close with Back.
  await phone.click('.bar .help');
  await shown(phone, '.rules');
  assert.equal(await text(phone, '.card h2'), 'איך משחקים');
  assert.equal(await phone.$$eval('.rules-powerups li', (n) => n.length), 9, 'all nine power-ups');
  assert.equal(await phone.evaluate(() => document.querySelector('.overlay').scrollTop), 0);
  const drawn = await phone.$eval('.pu-icon', (c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    return d.some((v, i) => i % 4 === 3 && v > 0);
  });
  assert.ok(drawn, 'the power-up icons are drawn');
  await phone.goBack();
  await hidden(phone, '.card');
  step('menu: the rules open from the ? button and close with Back');

  // Colour picker and a second human on the phone.
  await phone.click('.slot:nth-child(2) .seg button:nth-child(2)');
  await phone.click('.start-bar .btn');
  await until(phone, () => document.querySelectorAll('.pad').length === 2); // one pair per human
  step('phone: two humans get two pairs of buttons');

  // Landscape phone: pads on both sides of the arena.
  const land = await open({ ...devices['iPhone 13 landscape'], locale: 'en-US' }, 'phone-land');
  await land.goto(url);
  await land.click('.start-bar .btn');
  await shown(land, '.padbtn');
  await until(land, () => document.querySelector('canvas.arena').clientWidth > 200); // sized
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

  // ---------- Installed copy: the game opens and plays with no network ----------
  const offline = await open({ ...devices['iPhone 13'], locale: 'en-US' }, 'offline');
  await offline.goto(url);
  await offline.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 15000,
  });
  await offline.context().setOffline(true);
  await offline.reload();
  await offline.waitForSelector('.menu');
  await offline.click('.start-bar .btn');
  await offline.waitForFunction(() => window.__kavoom.game.ui.state === 'playing');
  assert.equal(await offline.evaluate(() => window.__kavoom.game.ui.state), 'playing');
  await offline.goBack();
  await shown(offline, '.card');
  await offline.click('.overlay-actions .btn:last-child');
  await offline.click('.tabs button:nth-child(2)');
  await offline.click('.btn.primary.big');
  await until(offline, () =>
    /No internet/.test(document.querySelector('.block [role=status]')?.textContent || ''),
  );
  // The fonts ship with the game, so they are there offline too.
  assert.ok(await offline.evaluate(() => document.fonts.check('16px Heebo')), 'Heebo offline');
  step('offline: the saved copy opens, a local match plays, online says there is no internet');
  problems.length = 0; // failed requests while offline are expected

  // ---------- Desktop, both languages ----------
  for (const locale of ['he-IL', 'en-US']) {
    const d = await open({ viewport: { width: 1280, height: 800 }, locale }, `desktop-${locale}`);
    await d.goto(url);
    await shown(d, '.menu .slot');
    await d.click('.start-bar .btn');
    await d.waitForFunction(() => window.__kavoom.game.ui.state === 'playing');
    assert.equal(
      await d.$$eval('.side-actions .btn', (n) => n.length),
      3,
      'rail with pause, settings, menu',
    );
    await d.keyboard.press('Space');
    await paused(d, true);
    await d.keyboard.press('Space');
    await paused(d, false);
    await d.keyboard.press('Escape');
    await paused(d, true); // Esc pauses
    await shown(d, '.card');
    // The game menu offers the rules too, and closing them goes back to the menu.
    await d.click(`.overlay-actions .btn:nth-child(3)`);
    await shown(d, '.rules');
    assert.equal(await d.$$eval('.rules-powerups li', (n) => n.length), 9);
    await d.click('.overlay-actions .btn.primary'); // close
    await hidden(d, '.rules');
    assert.ok(await d.$('.card'), 'back on the pause menu');
    assert.equal(await d.evaluate(() => window.__kavoom.game.paused), true, 'still paused');
    step(`desktop ${locale}: rail, Space and Esc`);
    if (locale === 'en-US') {
      // Match rules: a typed target and no win-by-2, shown in the hint and in the game.
      await d.click('.overlay-actions .btn:last-child'); // the pause dialog is open: main menu
      await d.click('.seg[aria-label="Match length"] button:nth-child(4)'); // Other
      await d.fill('.field.number', '3');
      await d.click('.seg[aria-label="Win by 2"] button:nth-child(2)'); // off
      assert.match(await text(d, '.start-bar .hint'), /first to 3\.$/);
      await d.click('.start-bar .btn');
      await shown(d, '.target');
      assert.equal(await text(d, '.target'), 'First to 3');
      assert.equal(await d.evaluate(() => window.__kavoom.game.match.lead), 1);
      step('desktop: a typed target and no win-by-2 reach the match');
    }
  }

  // ---------- Online: a desktop host and a phone guest ----------
  const host = await open({ viewport: { width: 1280, height: 800 }, locale: 'en-US' }, 'host');
  await host.goto(url);
  await host.click('.tabs button:nth-child(2)');
  await host.fill('.menu-grid.online .field', 'Dana');
  await host.click('.block > .btn:not(.primary)'); // room for friends
  await host.waitForSelector('.room-code');
  const code = (await text(host, '.room-code')).trim();
  assert.match(code, /^[A-Z]{4}$/);

  const guest = await open({ ...devices['iPhone 13'], locale: 'he-IL' }, 'guest');
  await guest.goto(`${url}#${code}`);
  await until(guest, (c) => document.querySelector('.field.code')?.value === c, code);
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

  // Invite button: the phone gets the share sheet, the desktop copies the link.
  await guest.evaluate(() => {
    navigator.share = (data) => ((window.__shared = data), Promise.resolve());
  });
  await guest.click('.tabs button:nth-child(1)'); // re-render so the button sees navigator.share
  await guest.click('.tabs button:nth-child(2)');
  await guest.click('.room-head .btn');
  const shared = await guest.evaluate(() => window.__shared);
  assert.equal(shared.url, `${url}#${code}`);
  assert.ok(shared.text.includes(code));
  step('online: the invite button shares a link with the room code');

  // The host adds a bot and names it; the guest sees the new name.
  await host.click('.room-actions .btn:nth-child(2)'); // add bot
  await host.fill('.member input.who', 'Robo');
  await host.press('.member input.who', 'Enter');
  await guest.waitForFunction(() =>
    [...document.querySelectorAll('.member .who')].some((n) => n.textContent === 'Robo'),
  );
  await host.click('.member:last-child .btn.small'); // and removes it again
  await guest.waitForFunction(() => document.querySelectorAll('.member').length === 2);
  step('online: the host can name a bot');

  // The host locks the door: a third player is turned away. Then removes and re-admits the guest.
  await host.click('.seg[aria-label="Room door"] button:nth-child(2)');
  const third = await open({ viewport: { width: 900, height: 700 }, locale: 'en-US' }, 'third');
  await third.goto(`${url}#${code}`);
  await third.click('.join-row .btn');
  await third.waitForFunction(() =>
    /locked/i.test(document.querySelector('[role=status]')?.textContent || ''),
  );
  assert.equal(await third.$('.room-code'), null);
  await host.click('.seg[aria-label="Room door"] button:nth-child(1)');
  await host.click('.member:nth-child(2) .btn.small'); // remove the guest
  await guest.waitForSelector('.join-row');
  assert.match(await text(guest, '.block [role=status]'), /המארח הוציא/);
  await guest.click('.join-row .btn');
  await guest.waitForSelector('.room-code');
  step('online: locked door turns newcomers away; the host can remove a player');

  // The host's match rules reach the guest, who can see but not change them.
  await host.click('.seg[aria-label="Match length"] button:nth-child(4)'); // Other
  await host.fill('.field.number', '9');
  await guest.waitForFunction(() => document.querySelector('.field.number')?.value === '9');
  assert.equal(await guest.$eval('.field.number', (n) => n.disabled), true);
  step('online: a custom target set by the host shows for the guest');

  await host.click('.room-actions .btn.primary');
  await guest.waitForSelector('.game');
  // Wait for "playing" rather than sleeping a fixed time: nobody steers here, so the
  // two lines can crash into each other soon after the start and end the round.
  await guest.waitForFunction(() => window.__kavoom.game.ui.state === 'playing');
  assert.equal(await guest.evaluate(() => window.__kavoom.game.myIndex), 1);
  assert.ok(
    await guest.evaluate(() => window.__kavoom.game.view.players.length === 2),
    'snapshots arrive',
  );
  step('online: both in the match, snapshots arriving');

  // The guest's page reloads mid-match (a phone that dropped the tab): back in the same seat.
  await guest.reload();
  await guest.waitForSelector('.game');
  await guest.waitForFunction(() => window.__kavoom.game.myIndex === 1);
  const seats = await host.evaluate(() => window.__kavoom.game.ui.players.length);
  assert.equal(seats, 2, 'no second player was made');
  step('online: a reload mid-match returns to the same seat');

  await guest.goBack(); // leave dialog
  await shown(guest, '.card');
  assert.match(await text(guest, '.card h2'), /לעזוב/);
  await guest.goBack();
  await hidden(guest, '.card');
  assert.notEqual(
    await guest.evaluate(() => window.__kavoom.game.ui.state),
    'idle',
    'the match went on',
  );
  await guest.goBack();
  await shown(guest, '.card');
  await guest.click('.overlay-actions .btn:last-child'); // leave room
  await shown(guest, '.join-row'); // back at the join form
  assert.equal(await historyDepth(guest), 0);
  step('online: Back asks before leaving, then leaving returns to the join form');

  await host.click('.side-actions .btn:last-child');
  await host.click('.overlay-actions .btn:last-child');
  await shown(host, '.join-row');
  await host.click('.btn.primary.big'); // quick game: a public room
  await host.waitForSelector('.room-code');
  // The host reloads in the lobby: same room, still the host.
  const lobbyCode = (await text(host, '.room-code')).trim();
  await host.reload();
  await host.waitForFunction(
    (c) => document.querySelector('.room-code')?.textContent.trim() === c,
    lobbyCode,
  );
  assert.equal(await host.$$eval('.member', (n) => n.length), 1, 'still alone, not twice');
  assert.match(await text(host, '.member .tag'), /Host/);
  step('online: a reload in the lobby returns to the room, still as host');
  assert.equal(
    await host.$('.setting .seg[aria-label="Room door"]'),
    null,
    'no lock on a public room',
  );
  await host.goBack();
  await shown(host, '.join-row'); // Back in a lobby leaves the room
  step('online: Back in a lobby leaves the room');

  // Leavers: the host picks "their line leaves", and a guest leaves mid-match.
  await host.click('.block > .btn:not(.primary)'); // room for friends
  await host.waitForSelector('.room-code');
  const leaveCode = (await text(host, '.room-code')).trim();
  const quitter = await open({ ...devices['iPhone 13'], locale: 'en-US' }, 'quitter');
  await quitter.goto(`${url}#${leaveCode}`);
  await quitter.click('.join-row .btn');
  await quitter.waitForSelector('.room-code');
  await host.click('.room-actions .btn:nth-child(2)'); // a bot, so two lines stay
  await host.click('.seg[aria-label="Someone leaves mid-match"] button:nth-child(2)');
  await quitter.waitForFunction(() =>
    document
      .querySelector('.seg[aria-label="Someone leaves mid-match"] [aria-pressed="true"]')
      ?.textContent.includes('leaves'),
  );
  await host.click('.room-actions .btn.primary');
  await quitter.waitForFunction(() => window.__kavoom.game.ui.state === 'playing');
  await quitter.goBack();
  await shown(quitter, '.card p');
  assert.match(await text(quitter, '.card p'), /Your line leaves the game/);
  await quitter.click('.overlay-actions .btn:last-child');
  await host.waitForFunction(() => document.querySelector('.scores li.gone'));
  assert.match(await text(host, '.scores li.gone .who'), /left/);
  step('online: with "their line leaves", a leaver is out and marked on the board');

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
