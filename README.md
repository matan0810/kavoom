# KAVOOM

A line game for the browser. Every player leaves a trail, and touching a trail or a wall
knocks you out. 2 to 6 players on one device or online, with bots, power-ups, Hebrew
and English.

**Play:** https://kavoom.onrender.com

## Run locally

Requires Node 22 or later.

```
npm install
npm run build      # React app -> dist/
npm start          # http://localhost:8080
npm run check      # lint, format and every unit test (builds the site first)
npm run format     # Prettier rewrites the files
npm run e2e        # browser smoke test; needs a prior build
```

The browser side is a React app built with Vite. The Node server serves the built files
from `dist/` and runs the online rooms (WebSocket at `/ws`).

While working on the page, `npm run dev` gives instant reload on http://localhost:5173
(keep `npm start` running beside it for online play).

## Branches and releases

| Branch | Role |
| --- | --- |
| `dev` | Day-to-day work. Lint, unit tests, browser tests and a production build run on every push. |
| `main` | What is live. Render deploys it once the checks on the commit pass. |

How work and releases are done is in [CLAUDE.md](CLAUDE.md): `npm run bump`, a
`Release vX.Y.Z` commit, a fast-forward of `main`, and the Tag workflow publishing the
GitHub release once https://kavoom.onrender.com/version serves the new version. The version
lives in `package.json` and is shown in the game menu.

**Open work and ideas** are the repository's
[open issues](https://github.com/matan0810/kavoom/issues).

## Deploy (Render, free)

`render.yaml` defines one free web service in the Frankfurt region.

1. On render.com: New → Blueprint, pick this repository, Apply.
2. Render follows `main`. In the service's settings, set Auto-Deploy to "After CI Checks
   Pass", so a commit whose checks fail is never deployed.

The build command is `npm ci --include=dev && npm run build`. If the service was created by
hand rather than from the Blueprint, set that build command in its settings.

A service's region is fixed when it is created. To move regions, delete the service and
create it again from the Blueprint.

On the free plan the server sleeps after 15 minutes without traffic, and the first visit
after that takes about a minute. If the static site is hosted somewhere else, set the
server address in `SERVER_URL` in `shared/config.js` (and add its host to the content policy) and the site's origin in the server's
`ALLOWED_ORIGINS` environment variable.

## Keys (one device)

| Player | Left / Right |
| --- | --- |
| 1 | ← → |
| 2 | A D |
| 3 | J L |
| 4 | V N |
| 5 | 1 Q |
| 6 | 9 0 |

Any key can be rebound in the menu. Space pauses. Online: ← → or A D, and touch buttons
on phones.

## More

- [DESIGN.md](DESIGN.md): full game design
- [CHANGELOG.md](CHANGELOG.md): what changed in each version
- [SECURITY.md](SECURITY.md): what is stored, which hosts, threats and their answers
- [CLAUDE.md](CLAUDE.md): how work is done

## License

[MIT](LICENSE).

The Heebo and Secular One fonts ship with the game (`@fontsource`), under the SIL Open Font
License.
The ws library, React and Vite are under the MIT license.
