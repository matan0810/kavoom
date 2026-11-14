# KAVOOM: notes for Claude

KAVOOM is an original browser line game (each player leaves a trail; touching a trail
or a wall knocks you out). Local play for 2 to 6 on one device, online rooms through a
small Node server, bots, power-ups, Hebrew and English. Live at https://kavoom.onrender.com.

The owner talks to you in Hebrew; answer in Hebrew. Keep the UI minimal.

## Branches and releases (strict)

- Work only on `dev`. Commit and push there.
- `main` is production. Render deploys every push to `main`, and a GitHub Action tags it
  and publishes a release. **Never push or merge to `main` unless the owner explicitly
  says to release** ("תעלה גרסה", "release", and similar).
- Every user-facing change gets a line under `## [Unreleased]` in `CHANGELOG.md` (Hebrew).
- To release, on `dev`:
  1. `npm run bump -- patch|minor|major` (patch = fixes, minor = features).
     It updates package.json, package-lock.json, `VERSION` in js/config.js and CHANGELOG.md.
  2. `npm test`, then commit as `Release vX.Y.Z` and push `dev`.
  3. `git checkout main && git merge --ff-only dev && git push origin main`, then back to `dev`.
  4. Tell the owner the version number and that Render deploys in a minute or two.
- Pushing tags and deleting branches is blocked from cloud sessions; the release
  workflow creates the tag, so neither is needed.

## Layout

```
index.html, css/style.css     page and styles (logical CSS properties: RTL and LTR share rules)
favicon.svg, icons/, manifest.webmanifest
js/config.js                  constants, VERSION, palette, power-ups
js/sim/                       pure simulation (no DOM): round.js, grid.js, bot.js, match.js
js/render.js, input.js, audio.js, net.js, i18n.js, main.js   browser side
server/server.js              static files + WebSocket rooms, security limits
server/room.js                one room: lobby, match, broadcast (no sockets, unit tested)
tests/                        node --test: sim, room, server
DESIGN.md                     full design spec (Hebrew)
```

`js/sim/` must stay free of DOM and timers: the same code runs the local game, the menu
demo and the online server.

## Commands

- `npm start`: server on http://localhost:8080 (PORT env to change)
- `npm test`: all tests; must pass before any push
- After UI changes, also check in a real browser (Playwright is preinstalled in cloud
  sessions): desktop and a 390px phone, Hebrew and English, no console errors.

## Security rules

- Only files listed in `PUBLIC_FILES` / `PUBLIC_DIRS` in server/server.js are served.
  Adding a new public file means adding it there and to the server test.
- Validate every value that comes from a client against a closed list.
- Render player names with `textContent`, never `innerHTML`.
- No inline scripts or styles in index.html (the CSP forbids them).
