# KAVOOM: working procedure

KAVOOM is an original browser line game (each player leaves a trail; touching a trail
or a wall knocks you out). Local play for 2 to 6 on one device, online rooms through a
small Node server, bots, power-ups, Hebrew and English. Live at https://kavoom.onrender.com.

This file is binding. Follow it on every task, in every session.

## 1. Ground rules

- The owner writes in Hebrew. Answer in Hebrew.
- Everything in the repository is in English: docs, code comments, commit messages.
  The only Hebrew is the Hebrew UI text in `js/i18n.js`.
- Keep the UI minimal. A new feature earns a control only if it cannot be a default.
- `main` is production. **Nothing reaches `main` until the owner says to release**
  ("תעלה גרסה", "release", or the like). A request to fix or build something is not
  a request to release it.
- Never rewrite published history: no force push, no rebase of `dev` or `main`.
- No model names or IDs in commits, docs or code.

## 2. Branches

| Branch | Role | Who writes |
| --- | --- | --- |
| `dev` | Integration. Every task lands here. CI runs the tests on every push. | Claude |
| `main` | Production. Every push is a release: GitHub tags it and Render deploys it. | Claude, only on a release order |
| `dependabot/*` | Dependency updates opened against `dev`. | Dependabot |

Start every session with:

```
git fetch origin dev main
git checkout dev
git pull --ff-only origin dev
git log --oneline -5 origin/main
```

If `dev` is behind `main`, stop and tell the owner; that should never happen.

## 3. Doing a task

1. **Understand.** Restate the request in one or two lines. If something is
   genuinely the owner's decision (look, rules, scope), ask before building.
2. **Plan.** For anything bigger than a small fix, outline the change and the files
   it touches. Update `DESIGN.md` when a rule, number or behaviour changes.
3. **Build** on `dev`, in small commits that each leave the tests green.
4. **Test.** All of these, every time:
   - `npm test` passes.
   - New logic gets a test: simulation in `tests/sim.test.js`, rooms in
     `tests/room.test.js`, HTTP or WebSocket behaviour in `tests/server.test.js`.
   - Any UI change is checked in a real browser (Playwright is preinstalled in cloud
     sessions; run `npm start` and drive it): desktop 1280×800 and a 390px phone,
     Hebrew and English, no console errors or CSP violations. Look at the screenshots.
   - Online changes are tested with two browser contexts in the same room.
5. **Record.** Add a line under `## [Unreleased]` in `CHANGELOG.md` for every change
   a player or the owner would notice, under Added, Changed, Fixed, Removed or Security.
6. **Commit and push to `dev`.**
7. **Report** to the owner in Hebrew: what changed, what was tested and how, what was
   not tested, and anything they need to do. Say plainly that it is on `dev` and not live.

### Definition of done

Tests green, browser checked when UI changed, CHANGELOG updated, DESIGN.md updated when
behaviour changed, pushed to `dev`, CI green, owner told.

### Commits

- Imperative subject under 72 characters: `Add room passwords`, `Fix wall check at high speed`.
- A blank line and a short body when the reason is not obvious.
- One topic per commit. Release commits are exactly `Release vX.Y.Z`.

## 4. Versions

Semantic versioning, `MAJOR.MINOR.PATCH`:

| Bump | When | Example |
| --- | --- | --- |
| `patch` | Fixes only, nothing new for players | a crash, a layout bug, a security fix |
| `minor` | Anything new or changed that players notice | a new power-up, a setting, a language |
| `major` | A break with the past | saved settings reset, online protocol incompatible with old pages |

The version lives in three places, kept in step by `npm run bump` and checked by a test:
`package.json`, `package-lock.json` and `VERSION` in `js/config.js` (shown in the menu).

## 5. Releasing (only on the owner's order)

### Before
- [ ] `dev` is pushed and CI on `dev` is green (check the Actions runs).
- [ ] `## [Unreleased]` in `CHANGELOG.md` describes everything since the last release.
      If it is empty, there is nothing to release: tell the owner.
- [ ] Pick the bump by section 4 and tell the owner which one and why.

### Release
```
npm run bump -- patch|minor|major     # version files + CHANGELOG section with today's date
npm test
git commit -am "Release vX.Y.Z"
git push origin dev
git checkout main
git merge --ff-only dev               # must fast-forward; if it cannot, stop and report
git push origin main
git checkout dev
```

### After
- [ ] The `Release` workflow on `main` succeeded and https://github.com/matan0810/kavoom/releases
      shows `vX.Y.Z` with the CHANGELOG text.
- [ ] Render has deployed. Cloud sessions cannot reach the live site, so ask the owner
      to open it and confirm the menu shows `vX.Y.Z`.
- [ ] Tell the owner: version, link to the release page, what is in it.

Tags are created only by the `Release` workflow. Cloud sessions cannot push tags or
delete branches; never try to work around that.

## 6. Something is wrong in production

- **Rollback first, fix second.** In the Render dashboard the owner can open the service,
  go to Events, and roll back to the previous deploy. Suggest this when the live game is
  broken, before any fix.
- **Hotfix.** Fix on `dev` with a test that reproduces the bug, add a `Fixed` or `Security`
  line to the CHANGELOG, then ask the owner for a `patch` release. Do not push to `main`
  without that order, even for a hotfix.
- **Undo a release.** `git revert` the offending commits on `dev`, then a `patch` release.
  Never reset or force-push `main`.

## 7. Dependency updates

Dependabot opens monthly pull requests against `dev`. When the owner asks to handle them:
read the changelog of the update, merge into `dev` locally, run `npm test` (and a browser
check for anything that touches the client), push `dev`, and note it under `Changed` in the
CHANGELOG if it matters to players. Security updates are worth a `patch` release; say so.

## 8. Layout

```
index.html, css/style.css     page and styles (logical CSS properties: RTL and LTR share rules)
favicon.svg, icons/, manifest.webmanifest
js/config.js                  constants, VERSION, palette, power-ups, SERVER_URL
js/sim/                       pure simulation (no DOM, no timers): round, grid, bot, match
js/render.js, input.js, audio.js, net.js, i18n.js, main.js   browser side
server/server.js              static files, WebSocket rooms, security limits
server/room.js                one room: lobby, match, broadcast (no sockets, unit tested)
scripts/bump.mjs              version bump for a release
scripts/release-notes.mjs     CHANGELOG section for the GitHub release
tests/                        node --test: sim, room, server
.github/workflows/            ci.yml (tests on dev), release.yml (tag and release on main)
render.yaml                   Render service: free plan, Frankfurt, deploys main
DESIGN.md, CHANGELOG.md, SECURITY.md, README.md, LICENSE (MIT)
```

`js/sim/` must stay free of DOM and timers: the same code runs the local game, the menu
demo and the online server.

## 9. Commands

- `npm start`: server on http://localhost:8080 (`PORT` to change)
- `npm test`: every test; must pass before any push
- `npm run bump -- patch|minor|major`: prepare a release

## 10. Security rules

- Only files in `PUBLIC_FILES` / `PUBLIC_DIRS` in `server/server.js` are served, checked
  after the path is resolved. A new public file means adding it there and to the server test.
- Validate every value from a client against a closed list; clamp every number.
- Render player text with `textContent`, never `innerHTML`.
- No inline scripts or styles in `index.html`; the CSP forbids them. A new external host
  (font, CDN) needs a CSP change in `server/server.js` and a reason.
- No secrets in the repository. Configuration that varies goes in Render environment variables.
- Any change to the server's limits or headers gets a line under `Security` in the CHANGELOG
  and an update to `SECURITY.md`.
