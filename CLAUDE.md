# KAVOOM: working procedure

KAVOOM (the same name in Hebrew; repository `matan0810/kavoom`) is an original browser line
game: each player leaves a trail, and touching a trail or a wall knocks you out. Local play
for 2 to 6 on one device, online rooms through a small Node server, bots, power-ups, Hebrew
and English. Live at https://kavoom.onrender.com.

This file is binding. Follow it on every task, in every session. Sections 1 to 12 are the
working method from `matan0810/project-template`, the same in every project; section 13 is
the only place for this project's own facts.

## 1. Ground rules

- The owner writes in Hebrew. Answer in Hebrew.
- Everything in the repository is in English: docs, code comments, commit messages. The only
  Hebrew is interface text and user data.
- **Single source of truth.** Every fact lives in one place, and everywhere else links to it:
  planned work in the issues, the version in `package.json`, changes in `CHANGELOG.md`, rules
  and numbers in `DESIGN.md`, what is stored and which hosts are used in `SECURITY.md`. Never
  copy one into another. Shared values in code (a constant, a shape, a colour) are defined once
  and imported.
- Keep it simple. A new feature earns a control only if it cannot be a default.
- `main` is production. **Nothing reaches `main` until the owner says to release**
  ("תעלה גרסה", "תמזג", "release", or the like). A request to fix or build something is not
  a request to release it.
- Never rewrite published history: no force push, no rebase of `dev` or `main`.
- No model names or IDs in commits, docs or code. No secrets in the repository.

## 2. Working with the owner

- **Decisions are the owner's.** Look, wording, scope and what counts as a feature: when a
  request leaves one of these open, ask before building. Offer two to four options with a
  recommendation, not a survey.
- **Ideas first, then building.** When asked for ideas (features, names, statistics, a logo),
  present a numbered list, each with what it is and why, checked against the real data where
  that applies, and build only what the owner picks.
- **Show, don't describe, a visual choice.** For a look decision, render the options and send
  screenshots before touching the product.
- **Say when you were wrong.** If a number, a claim or an earlier recommendation turns out
  wrong, say so plainly in the report and correct it.
- **The owner often works from a phone.** Instructions for them are steps in a browser
  (a settings page, a workflow run), with the exact link, never terminal commands.
- **Report** after every task, in Hebrew: what changed, how it was tested, what was not
  tested, what the owner must do by hand, and whether it is on `dev` or live. Never call
  something live without having checked the deploy.

## 3. Branches

| Branch         | Role                                                                             | Who writes                      |
| -------------- | -------------------------------------------------------------------------------- | ------------------------------- |
| `dev`          | Integration. Every task lands here. CI runs every check on every push.           | Claude                          |
| `main`         | Production. Every push deploys and, with a new version, tags a release.          | Claude, only on a release order |
| `dependabot/*` | Dependency updates.                                                              | Dependabot                      |
| other          | A session's own working branch. Fast-forwarded into `dev`; otherwise disposable. | Claude                          |

`main` is always an ancestor of `dev`: work flows `dev` → `main` by fast-forward only.

Start every session with:

```
git fetch origin dev main
git checkout dev                 # or the session's working branch, reset to origin/dev
git pull --ff-only origin dev
git log --oneline -5 origin/main
git log --oneline origin/main..origin/dev   # what is waiting for the next release
```

If `main` has commits that `dev` lacks, stop and tell the owner.

## 4. Doing a task

1. **Understand.** Restate the request in one or two lines; ask if it is the owner's call
   (section 2).
2. **Plan.** For anything bigger than a small fix, outline the change and the files it
   touches. Update `DESIGN.md` when a rule, number or behaviour changes.
3. **Build** on `dev` (or a working branch based on it), in small commits that each leave
   the checks green.
4. **Test.** All of these, every time:
   - `npm run check` passes (lint, format, unit tests; types once the code is TypeScript,
     see section 13).
   - New logic gets a unit test next to it. Logic that reads real data is tested against
     the real data, not only against a sample.
   - A bug fix starts with a test that fails without the fix.
   - Any UI change is checked in a real browser: `npm run build && npm run e2e` (extend the
     smoke test for new screens and flows), and screenshots are looked at: desktop 1280×800
     and a 390px phone, every language, no page errors, no sideways scroll.
   - Browser tests wait for a condition, never for a fixed time, and fail in seconds, not
     after a long default timeout.
5. **Record.** A line under `## [Unreleased]` in `CHANGELOG.md` for every change a user or
   the owner would notice (Added, Changed, Fixed, Removed, Security). Update `README.md` when
   setup, commands or layout change, `SECURITY.md` when what is stored or which hosts are
   used changes.
6. **Push to `dev`.** From a working branch: push it, then `git push origin HEAD:dev`
   (a fast-forward; if `dev` moved, merge `origin/dev` first).
7. **Check CI on `dev`**, fix it if it fails, then report (section 2).

### Deferred work and ideas

Postponed work and ideas are GitHub issues, not TODO comments or lists in docs: one issue
per topic, with what was found and the options. Close it when the work ships, with the
version.

### Definition of done

Checks green, browser checked when the UI changed, CHANGELOG updated, pushed to `dev`, CI on
`dev` green, owner told.

### Commits

- Imperative subject under 72 characters: `Add room passwords`, `Fix menu on phones`.
- A blank line and a short body when the reason is not obvious.
- One topic per commit. Release commits are exactly `Release vX.Y.Z`.

## 5. Code

- TypeScript in strict mode (this project is still JavaScript; see section 13). No `any`, no
  non-null assertions, no casts of outside data: everything from outside (files, storage,
  addresses, the network, the user) is parsed and checked, and a bad value falls back to a
  safe default.
- Code layout is whatever Prettier produces. Comments say why, not what.
- Logic lives in plain modules with no UI (pure, testable); components only display.
  One component per file, named like the file; split one that grows past about 150 lines.
- Styles use shared design tokens and logical properties (`inline-start`, not `left`), so
  right-to-left works without special cases.
- Every text a user reads is in the strings file, in every language; a test checks that
  each language has every key.
- Accessible by default: real `<button>`s and `<a>`s, a visible label or an `aria-label`,
  every screen has its own address (this project's exception: section 13).
- No new runtime dependency without a reason in the commit body.

## 6. Security baseline

- Text from data or users is rendered as text, never as HTML.
- A Content Security Policy allows only the project's own files: no inline scripts, no
  outside hosts unless listed in `SECURITY.md` with a reason.
- Every value from a client is checked against a closed list; every length and number is
  capped. Every admin endpoint checks authorization first and has a test that it refuses.
- Files a user downloads are safe: CSV cells that start like a formula are escaped; file
  names cannot climb folders or hide their type.
- Secrets live in the hosting platform's secret store, never in the repository.
- Supply chain: `ignore-scripts=true` in `.npmrc`, `npm ci` from the lockfile, `npm audit`
  blocks high advisories in runtime dependencies.
- CI: read-only permissions by default, more only for the job that needs it; checkouts do
  not keep the token (`persist-credentials: false`); no untrusted text in shell commands.
- `SECURITY.md` keeps the threat model: each threat, its answer and the test that proves it,
  plus the known limits that were accepted.

## 7. What CI runs

One reusable workflow, `.github/workflows/checks.yml`, called on every push to `dev` (and
working branches), every pull request, and again on `main` before a deploy, so `dev` and
production can never drift apart. A new check belongs there.

| Job                                 | What it proves                                                             |
| ----------------------------------- | -------------------------------------------------------------------------- |
| Lint, format, audit, unit tests     | `npm audit --omit=dev --audit-level=high`, `npm run check`                 |
| Browser tests                       | `npm run e2e`: desktop and phone, every language, online, offline          |
| Build and start the way Render does | `render.yaml`'s build and start commands, with `NODE_ENV=production`       |

## 8. Versions

Semantic versioning, `MAJOR.MINOR.PATCH`:

| Bump    | When                                              |
| ------- | ------------------------------------------------- |
| `patch` | Fixes only, or new data                           |
| `minor` | Anything new or changed that users notice         |
| `major` | A break with the past (old addresses, saved data) |

The version lives in `package.json` and `package-lock.json`, kept in step by `npm run bump`
and checked by a test, and is shown in the interface.

## 9. Releasing (only on the owner's order)

A release is a push to `main` whose version has no tag yet. Once the new version is live,
the Tag workflow tags the commit `vX.Y.Z` and publishes a GitHub release with the version's
CHANGELOG section. Tags are created only by that workflow; never push one by hand.

**Before:** CI on `dev` is green; `## [Unreleased]` describes everything in
`git log origin/main..origin/dev`, plus any lines marked live without a version (if it is
empty there is nothing to release: say so); pick the bump by section 8 and tell the owner
which one and why.

**Release:**

```
npm run bump -- patch|minor|major     # version files + CHANGELOG section dated today
npm run check
git commit -am "Release vX.Y.Z"
git push origin HEAD:dev              # wait for CI on dev to pass
git push origin dev:main              # must fast-forward; if refused, stop and report
```

**After:** the deploy run passed every job; the releases page shows `vX.Y.Z` as latest; the
live interface shows `vX.Y.Z` (ask the owner if the session cannot reach it); tell the owner
the version, the release link, what is in it and what to check by hand.

**Without a version.** Docs, workflows and tooling reach `main` without a bump, on the
owner's order: fast-forward and skip `npm run bump`. If the owner wants a change users see to
go live without a version, mark its CHANGELOG line
`_(Live since YYYY-MM-DD, published without a version at the owner's request.)_`; it stays
under Unreleased until the next release, where `npm run bump` drops the mark. So the
CHANGELOG alone always tells what is live.

## 10. Something is wrong in production

- _Rollback first:_ the owner re-runs the deploy of the previous release from the Actions
  tab (or the host's rollback), from a phone.
- _Hotfix:_ fix on `dev` with a test that reproduces the bug, a `Fixed` line in the
  CHANGELOG, then ask the owner for a `patch` release.
- _Undo a release:_ `git revert` on `dev`, then a `patch` release. Never reset or
  force-push.

## 11. Dependency updates

Dependabot opens at most two grouped pull requests a month against `dev` (npm, GitHub
Actions). Security updates target the default branch: never merge them from GitHub; merge
into `dev` locally like any update. For each: read its changelog, merge into `dev`, run
`npm run check` and `npm run e2e`, push, note it in the CHANGELOG if users notice. An update
that breaks the build gets an `ignore` in `dependabot.yml` with the reason, and the owner is
told. Tools pinned to the cloud sessions' versions (Playwright) are never upgraded alone.

## 12. The documents

| File           | Holds                                                       |
| -------------- | ----------------------------------------------------------- |
| `CLAUDE.md`    | How work is done (this file)                                |
| `README.md`    | What it is, how to run it, the layout; links to open issues |
| `DESIGN.md`    | Rules, numbers and behaviour: what the product does and why |
| `CHANGELOG.md` | Every change users notice, by version                       |
| `SECURITY.md`  | What is stored, which hosts, threats and answers, settings  |

## 13. This project

- **Stack:** React 19 and Vite, in **JavaScript**, not TypeScript: the owner chose to keep it
  for now, and the move is issue #4. ESLint and Prettier, `node:test` for unit tests,
  Playwright (Chromium) for the browser test. Node 22 (`.nvmrc`). Runtime dependencies:
  react, react-dom, ws, and the two `@fontsource` fonts.
- **Hosting:** one free web service on Render, Frankfurt (`render.yaml`, from a Blueprint).
  The Node server serves the built site from `dist/` and runs the online rooms over
  WebSocket. Render deploys `main` only after the checks on the commit pass (its Auto-Deploy
  setting "After CI Checks Pass"); `release.yml` runs those checks. The Tag workflow
  (`tag.yml`, every half hour or by hand from the Actions tab) tags a version once
  https://kavoom.onrender.com/version serves it. Rollback (section 10) is the Render
  dashboard: the service, Events, roll back to the previous deploy. The free server sleeps
  after 15 idle minutes; why its waking page stays is in `DESIGN.md`.
- **Commands:** `npm run dev` (Vite with instant reload; run `npm start` beside it for online
  rooms), `npm run build`, `npm start` (the server on http://localhost:8080, `PORT` to
  change), `npm run check`, `npm run format`, `npm run build && npm run e2e`,
  `npm run bump -- patch|minor|major`.
- **Layout:**

  ```
  index.html, vite.config.js   Vite entry page and build settings (the version comes from package.json)
  public/                      copied as they are: favicon.svg, icons/, manifest.webmanifest, sw.js
  shared/config.js             constants: arena, physics, palette, power-ups, SERVER_URL
  shared/protocol.js           the online wire format: server encodes, browser decodes and checks
  shared/sim/                  pure simulation (no DOM, no timers): round, grid, bot, match, motion
  src/main.jsx, src/App.jsx    React entry and top component
  src/engine/                  no React: game.js (match state machine), renderer.js, input.js,
                               audio.js, net.js, backButton.js, prediction.js, haptics.js
  src/state/, src/hooks/       saved settings, record and seat, and hooks to the engine
  src/i18n/strings.js          Hebrew and English strings
  src/components/              ui/ (shared controls), menu/, game/, SettingsDialog, RulesDialog
  src/styles/                  base.css, menu.css, game.css (tokens on :root, logical properties)
  server/server.js             static files from dist/, WebSocket rooms, security limits, /version
  server/room.js               one room: lobby, match, broadcast (no sockets, unit tested)
  scripts/                     changelog.mjs (tested helpers), bump.mjs, release-plan.mjs,
                               release-history.json (past releases and their commits)
  tests/                       node --test; tests/e2e/ the browser test
  .github/                     checks.yml, ci.yml, release.yml, tag.yml, dependabot.yml
  ```

- **Rules only this project has:**
  - `shared/sim/` stays free of DOM and timers: the same code runs the local game, the menu
    demo and the online server. `src/engine/` stays free of React: components only read
    `game.ui` (through `useGameUi`) and call engine methods.
  - Online, the server is the only referee; the browser sends input and draws what it is
    told, predicting heads only for display (`DESIGN.md`, section 10).
  - The server serves only `PUBLIC_FILES` / `PUBLIC_DIRS` inside `dist/`, checked after the
    path is resolved; a new public file means adding it there and to the server test. Any
    change to the server's limits or headers gets a `Security` line in the CHANGELOG and an
    update to `SECURITY.md`.
  - In components the `style` prop is fine (React sets it through the DOM, which the policy
    allows); `index.html` has no inline script or style.
  - "Every screen has its own address" does not apply: the game is one screen whose menu and
    match are states, and a room's code leaves the address once joined (the device remembers
    the seat instead). An invite link carries the code.
  - Cloud sessions cannot reach the live site or push tags; the owner confirms the live
    version.
