# Security

What there is to protect, what the game stores and talks to, and how each threat is answered.
Update it whenever any of these change (CLAUDE.md, section 4).

## What is stored

**On the server:** nothing lasting. There are no accounts and no database. An online player's
name, colour and seat token live in server memory only while their room is open. The server
records no IP addresses; it counts connections per address in memory, to cap them. While
people play it logs one line a minute with counts only: rooms, players, CPU, late ticks.

**On a device** (`localStorage`, each read back is parsed and checked, never cast; a bad value
means the default):

| Key                  | What                                                        | Checked in               |
| -------------------- | ----------------------------------------------------------- | ------------------------ |
| `kavoom.settings.v1` | Language, players, keys, colours, match and sound settings  | `src/state/settings.js`  |
| `kavoom.stats.v1`    | Matches, wins and streaks on this device                    | `src/state/stats.js`     |
| `kavoom.session.v1`  | The online room and seat token to return to, for 10 minutes | `src/state/session.js`   |

The service worker (`public/sw.js`) keeps a copy of the game's own files in the cache
`kavoom-v1`, and nothing else; it saves a page only if it really is the game.

## Hosts

The game talks to no host but its own: pages, scripts, styles and fonts come from the site,
and online play is a WebSocket to the same address. The fonts are bundled (`@fontsource`),
not loaded from Google. The Content Security Policy (`server/server.js`) enforces it, and the
browser test fails if any request leaves the site. A new host needs a reason, a change to the
policy and a line here.

## Threats and what answers them

| Threat                                     | Answer                                                                                                                                      | Checked by                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Script injection (XSS)                     | Player text is rendered as React text; the policy allows only the site's own files and no inline code; Trusted Types allow only `/sw.js`    | server test (headers), e2e (no violations)       |
| Fake names that imitate another player     | Names lose control, invisible and text-reordering characters and angle brackets; ten characters at most                                      | room test (`cleanName`)                          |
| Server files or source code read over HTTP | Only `PUBLIC_FILES` / `PUBLIC_DIRS` in `dist/` are served, checked after the path is resolved; malformed paths are a 400                     | server test (traversal, encoded paths)           |
| A forged or broken message from a client   | Every value checked against a closed list, every number clamped, unknown messages ignored; 2 KB and 200 messages a second per connection    | room and server tests                            |
| A broken or hostile message from the server | Every message's shape is checked in the browser and a bad one is dropped                                                                    | protocol test (all of a real match's messages)   |
| Cheating from the browser                  | The server runs the game; the browser only sends left, right or straight                                                                    | room test (input values)                         |
| Guessing room codes                        | 30 create or join attempts a minute per address; the host can lock the door                                                                 | server test                                      |
| Taking over someone's seat                 | A seat comes back only with its random token, and the old connection then loses it                                                         | room and server tests                            |
| Another site using our rooms               | WebSockets only from the game's own origin (plus `ALLOWED_ORIGINS`)                                                                         | server test                                      |
| Exhausting the server                      | At most 200 rooms, 1000 connections, 20 per address; slow readers closed at 1 MB queued; idle lobby members dropped after 30 minutes         | server tests                                     |
| One room's error taking the server down    | Errors are caught per message and per room; a failing room closes alone                                                                    | server test (malformed input keeps it up)        |
| Tampered saved data on a device            | Parsed and checked; a bad value means the default                                                                                          | settings, stats and session tests                |
| The host's waking page replacing the game  | The service worker saves only a page that is the game                                                                                      | service worker test                              |
| A compromised dependency                   | Few runtime dependencies; no install scripts (`.npmrc`); `npm ci` from the lockfile; `npm audit` blocks high advisories in runtime ones     | repo test, CI                                    |
| A compromised workflow step                | Read-only permissions by default, `contents: write` only in the Tag job; checkouts keep no token                                           | repo test                                        |
| A forged release                           | Releases only from the Tag workflow, once the live site serves the version; version, commit and date checked before any shell sees them    | changelog test                                   |

**Files a user downloads:** none. The game offers no file to download, so there are no CSV
cells or file names to make safe; if one is added, CLAUDE.md section 6 applies.

## Known limits, accepted

- The per-address caps rely on the `X-Forwarded-For` header, which can be forged. The
  server-wide caps still apply.
- Rooms have no password: anyone with the code can join until the host locks the door. Public
  rooms (quick game) are open to anyone by design.
- Protection against large denial-of-service attacks depends on Render's infrastructure.
- Trusted Types work in Chromium-based browsers; Safari and Firefox ignore them and rely on
  the rest of the policy.

## Repository settings

Set by the owner on GitHub, from Settings of `matan0810/kavoom`: Dependabot alerts and
security updates, secret scanning with push protection, CodeQL default setup (Code security
and analysis); a ruleset blocking force pushes and deletion on `main` and `dev` (Rules,
Rulesets); read-only workflow permissions (Actions, General, Workflow permissions).

## Reporting a problem

Use the repository's Security tab (Report a vulnerability), not a public issue.
