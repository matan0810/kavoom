# KAVOOM

A line game for the browser. Every player leaves a trail, and touching a trail or a wall
knocks you out. 2 to 6 players on one device or online, with bots, power-ups, Hebrew
and English.

**Play:** https://kavoom.onrender.com

## Run locally

Requires Node 22 or later.

```
npm install
npm start          # http://localhost:8080
npm test
```

The server serves the site and runs the online rooms (WebSocket at `/ws`).

## Branches and releases

| Branch | Role |
| --- | --- |
| `dev` | Day-to-day work. Tests run on every push. |
| `main` | What is live. Every push here is a release. |

To release:

1. On `dev`: `npm run bump -- minor` (`patch` for fixes, `major` for breaking changes).
2. Commit as `Release vX.Y.Z`, then merge `dev` into `main`.
3. GitHub tags the commit and publishes a release from `CHANGELOG.md`, and Render
   deploys it within a minute or two.

The version number is shown in the game menu.

## Deploy (Render, free)

`render.yaml` defines one free web service in the Frankfurt region.

1. On render.com: New → Blueprint, pick this repository, Apply.
2. Render follows `main` and deploys every release on its own.

A service's region is fixed when it is created. To move regions, delete the service and
create it again from the Blueprint.

On the free plan the server sleeps after 15 minutes without traffic, and the first visit
after that takes about a minute. If the static site is hosted somewhere else, set the
server address in `SERVER_URL` in `js/config.js` and the site's origin in the server's
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
- [SECURITY.md](SECURITY.md): what the server stores and how it is protected

## License

No license has been chosen yet, so all rights are reserved by the repository owner.

The Heebo and Secular One fonts come from Google Fonts under the SIL Open Font License.
The ws library is under the MIT license.
