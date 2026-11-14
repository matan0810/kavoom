# KAVOOM: working procedure

KAVOOM is an original browser line game (each player leaves a trail; touching a trail
or a wall knocks you out). Local play for 2 to 6 on one device, online rooms through a
small Node server, bots, power-ups, Hebrew and English. Live at https://kavoom.onrender.com.

This file is binding. Follow it on every task, in every session.

## 1. Ground rules

- The owner writes in Hebrew. Answer in Hebrew.
- Everything in the repository is in English: docs, code comments, commit messages.
  The only Hebrew is the Hebrew UI text in `src/i18n/strings.js`.
- Keep the UI minimal. A new feature earns a control only if it cannot be a default.
- `main` is production. **Nothing reaches `main` until the owner says to release**
  ("תעלה גרסה", "release", or the like). A request to fix or build something is not
  a request to release it.
- Never rewrite published history: no force push, no rebase of `dev` or `main`.
- No model names or IDs in commits, docs or code.

## 2. Branches

| Branch | Role | Who writes |
| --- | --- | --- |
| `dev` | Integration. Every task lands here. CI runs every check on every push. | Claude |
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
   - `npm run lint` and `npm run format:check` pass (run `npm run format` to fix the layout).
   - `npm test` passes.
   - New logic gets a test: simulation in `tests/sim.test.js`, rooms in
     `tests/room.test.js`, HTTP or WebSocket behaviour in `tests/server.test.js`.
   - Any UI change is checked in a real browser (Playwright is preinstalled in cloud
     sessions): run `npm run build && npm run e2e` (add to `tests/e2e/smoke.cjs` for new
     screens or flows), and also look at screenshots: desktop 1280×800 and a 390px phone,
     Hebrew and English, no console errors or CSP violations.
   - Online changes are tested with two browser contexts in the same room.
5. **Record.** Add a line under `## [Unreleased]` in `CHANGELOG.md` for every change
   a player or the owner would notice, under Added, Changed, Fixed, Removed or Security.
6. **Commit and push to `dev`.**
7. **Report** to the owner in Hebrew: what changed, what was tested and how, what was
   not tested, and anything they need to do. Say plainly that it is on `dev` and not live.

### Definition of done

Lint and format clean, tests green, browser checked when UI changed, CHANGELOG updated, DESIGN.md updated when
behaviour changed, pushed to `dev`, CI green, owner told.

### Commits

- Imperative subject under 72 characters: `Add room passwords`, `Fix wall check at high speed`.
- A blank line and a short body when the reason is not obvious.
- One topic per commit. Release commits are exactly `Release vX.Y.Z`.

### What CI runs

`.github/workflows/checks.yml`, on every push to `dev`, every pull request, and again on
`main` before a release is tagged:

| Job | What it proves |
| --- | --- |
| Lint, format, audit, unit tests | `npm audit` (high and up), `npm run lint`, `npm run format:check`, `npm test` |
| Browser tests | `npm run e2e` in Chromium: desktop, phone, online with two players, offline |
| Build and start the way Render does | `render.yaml`'s build and start commands work with `NODE_ENV=production` |

A release is tagged only if all three pass. A new check belongs in `checks.yml`, so `dev`
and `main` can never drift apart.

## 4. Versions

Semantic versioning, `MAJOR.MINOR.PATCH`:

| Bump | When | Example |
| --- | --- | --- |
| `patch` | Fixes only, nothing new for players | a crash, a layout bug, a security fix |
| `minor` | Anything new or changed that players notice | a new power-up, a setting, a language |
| `major` | A break with the past | saved settings reset, online protocol incompatible with old pages |

The version lives in three places, kept in step by `npm run bump` and checked by a test:
`package.json`, `package-lock.json` and `VERSION` in `shared/config.js` (shown in the menu).

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
- [ ] The `Release` workflow on `main` succeeded (all three check jobs, then the tag) and https://github.com/matan0810/kavoom/releases
      shows `vX.Y.Z` with the CHANGELOG text.
- [ ] Render has deployed. Cloud sessions cannot reach the live site, so ask the owner
      to open it and confirm the menu shows `vX.Y.Z`.
- [ ] Tell the owner: version, link to the release page, what is in it.

### Changes with nothing for players

Docs, workflows and Render config can reach `main` without a version bump, still only on
the owner's order: fast-forward `main` to `dev` as above and skip `npm run bump`. The
`Release` workflow sees the version is already tagged and does nothing; Render restarts
the server, which ends any online match in progress.

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
index.html, vite.config.js    Vite entry page and build settings
public/                       copied as they are: favicon.svg, icons/, manifest.webmanifest, sw.js
eslint.config.js, .prettierrc.json   lint rules and code layout, enforced in CI
shared/config.js              constants, VERSION, palette, power-ups, SERVER_URL
shared/protocol.js            the online wire format: server encodes, browser decodes
shared/sim/                   pure simulation (no DOM, no timers): round, grid, bot, match, motion
src/main.jsx, src/App.jsx     React entry and top component
src/engine/                   no React: game.js (match state machine), renderer.js, input.js,
                              audio.js, net.js, backButton.js, prediction.js, haptics.js
src/state/, src/hooks/        saved settings + context; hooks that connect components to the engine
src/i18n/strings.js           Hebrew and English strings
src/components/               ui/ (shared controls), menu/, game/, SettingsDialog.jsx
src/styles/                   base.css, menu.css, game.css (logical CSS properties: RTL and LTR share rules)
dist/                         build output, not in git; this is what the server serves
server/server.js              static files from dist/, WebSocket rooms, security limits
server/room.js                one room: lobby, match, broadcast (no sockets, unit tested)
scripts/bump.mjs              version bump for a release
scripts/release-notes.mjs     CHANGELOG section for the GitHub release
tests/                        node --test: sim, room, server, engine, back button, layout, settings
tests/e2e/                    browser smoke test (npm run e2e), not part of npm test
.github/workflows/            checks.yml (every check, shared), ci.yml (dev and pull requests),
                              release.yml (checks, then tag and release on main)
render.yaml                   Render service: free plan, Frankfurt, builds and deploys main
DESIGN.md, CHANGELOG.md, SECURITY.md, README.md, LICENSE (MIT)
```

- `shared/sim/` must stay free of DOM and timers: the same code runs the local game, the
  menu demo and the online server.
- `src/engine/` must stay free of React. The match runs there; components only read
  `game.ui` (through `useGameUi`) and call engine methods.
- Code layout is whatever Prettier produces; do not hand-format against it. Comments say
  why, not what.
- One component per file, named like the file. A component that grows past about 150 lines
  should be split.

## 9. Commands

- `npm run build`: build the site into `dist/` (needed before `npm start`)
- `npm start`: server on http://localhost:8080 (`PORT` to change)
- `npm run dev`: Vite dev server with instant reload on http://localhost:5173; run
  `npm start` beside it for online rooms
- `npm test`: builds, then runs every test; must pass before any push
- `npm run lint`: ESLint; must pass before any push (CI runs it)
- `npm run format`: Prettier rewrites the files; `npm run format:check` only checks (CI runs it)
- `npm run e2e`: browser smoke test (needs a prior `npm run build`; Playwright is a dev
  dependency pinned to the version preinstalled in cloud sessions, so do not upgrade it alone)
- `npm run bump -- patch|minor|major`: prepare a release

## 10. Security rules

- Only files in `PUBLIC_FILES` / `PUBLIC_DIRS` inside `dist/` are served (`server/server.js`),
  checked after the path is resolved. A new public file means adding it there and to the server test.
- Validate every value from a client against a closed list; clamp every number.
- Render player text as React text (`{name}`), never with `dangerouslySetInnerHTML`.
- No inline scripts or styles in `index.html`; the CSP forbids them. In components, the
  `style` prop is fine (React sets it through the DOM, which the CSP allows). A new external host
  (font, CDN) needs a CSP change in `server/server.js` and a reason.
- No secrets in the repository. Configuration that varies goes in Render environment variables.
- Any change to the server's limits or headers gets a line under `Security` in the CHANGELOG
  and an update to `SECURITY.md`.
