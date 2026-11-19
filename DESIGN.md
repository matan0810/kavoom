# KAVOOM: design

An original browser game in the "lines" genre. Every player is a line that keeps moving
forward and leaves a trail. Touching a wall or any trail knocks you out. The last one
alive takes the round.

## 1. Scope

| In | Out |
| --- | --- |
| 2 to 6 players on one device | Accounts and shared high scores |
| Online rooms, each player on their own device | Map editor |
| Bots at three levels | Predicting other players' lines online |
| Power-ups, with an off switch | |
| Touch controls for phones | |
| Hebrew (RTL) and English | |
| Keys bound by `event.code`, so the keyboard layout does not matter | |

## 2. Code layout

The browser side is a React app, built by Vite into `dist/`. The Node server serves
`dist/` and runs the online rooms. The simulation is shared by both.

```
index.html               Vite entry page (loads src/main.jsx)
public/                  files copied as they are: favicon.svg, icons/, manifest.webmanifest,
                         sw.js (service worker: offline copy of the game)
shared/config.js         constants: version, arena, physics, palette, keys, power-ups
shared/protocol.js       the online wire format (server encodes, browser decodes)
shared/sim/grid.js       occupancy grid for collisions
shared/sim/round.js      one round: movement, collisions, gaps, power-ups, round points
shared/sim/bot.js        computer player decisions
shared/sim/match.js      cumulative score, target and win condition
shared/sim/motion.js     how a head moves; shared by the round and the prediction
src/main.jsx             mounts the app
src/App.jsx              picks the screen (menu or game), owns the online room
src/engine/              plain JavaScript, no React:
  game.js                  match state machine for local and online play
  prediction.js            online: our own head drawn ahead of the server
  haptics.js               vibration on knockout
  renderer.js              canvas drawing, particles and effects
  input.js, audio.js       keyboard and touch state, WebAudio sound effects
  net.js                   WebSocket client with automatic rejoin
  backButton.js            browser Back button handling
  index.js                 the single game, input and sound objects
src/state/               saved settings, the player's record, and the settings context
src/hooks/               useGameUi, useOnlineRoom, useBackLayer, useAnimationFrame, useMediaQuery,
                         useWakeLock
src/i18n/strings.js      Hebrew and English strings
src/components/ui/       Segmented, Swatches, SettingRow, Dialog
src/components/menu/     MenuScreen, Hero, TopBar, LocalPane, PlayerSlot, MatchSettings,
                         OnlinePane, JoinForm, RoomLobby
src/components/game/     GameScreen, GameHud, Scoreboard, Arena, TouchPads, GameDialogs
src/components/SettingsDialog.jsx
src/styles/              base.css, menu.css, game.css (tokens on :root, logical properties)
server/server.js         static files from dist/ + WebSocket rooms + security limits
server/room.js           one online room (no sockets, unit tested)
scripts/                 release helpers
tests/                   node --test: simulation, rooms, server
```

Two rules hold the structure together:

- `shared/sim/` is pure. No DOM, canvas or clock. It takes a seeded random generator
  and reports outward through hooks (`segment`, `death`, `pickup`, `clear`). The same
  code runs the local game, the menu demo and the online server, and it is tested in Node.
- The match does not live in React. `src/engine/game.js` runs it at 120 steps a second
  and draws straight to the canvas. Whenever something a person can read changes (state,
  scores, countdown number, round banner) it publishes a small `ui` object, and the
  components re-render from that. Components call methods on the engine (`pause`,
  `startRound`, `stop`); they never touch the simulation.

### Why React and Vite

The first version was one 1000-line `main.js` that built the page by hand with
`document.createElement`. React was chosen for the rewrite because each piece of the
screen becomes a small file that reads like the HTML it produces, it is the most widely
taught and documented UI library, and it needs no server-side changes: the build output
is static files. Vite is the standard React build tool and adds one command
(`npm run build`). Heavier options were rejected: a framework such as Next.js would
replace the hand-written WebSocket server for no gain, and TypeScript would add a second
thing to learn at the same time.

## 3. Simulation

### 3.1 Time and space
- Fixed logical arena of 1120×720 units. The canvas scales to the window; the logic does not.
- When the room for the arena is clearly taller than wide (an upright phone), the arena is
  drawn turned 90 degrees so it fills the screen. Only the picture turns: steering is relative
  to each line, and names and power-up icons are drawn upright.
- Fixed step of 1/120 s with an accumulator, so results do not depend on frame rate.
- A frame longer than 100 ms (background tab) is clamped, so there is no jump of dozens of steps.

### 3.2 Movement
| Parameter | Base value |
| --- | --- |
| Speed | 105 units/s |
| Turn rate | 2.85 rad/s (turn radius about 37) |
| Line radius | 3 (width 6) |

Each player's input is -1, 0 or 1. The angle is updated, then the position. When a
power-up changes speed, the turn rate is multiplied by the square root of the speed
factor so steering stays manageable.

### 3.3 Collisions
- A grid with one cell per arena unit: `owner` (who painted it) and `stamp` (which step).
- Every step stamps a disc of the line radius at the new position. Taken cells are not overwritten.
- The check samples points on a 150° arc in front of the head, at radius + 0.8. The
  number of points grows with the radius (about one every 1.2 units), so a thin line
  cannot slip between the samples of a thick head.
- A player's own cells painted fewer than K steps ago are ignored, where K comes from
  the current speed and radius (a distance of two radii plus 4).
- Step order: everyone moves and is checked against last step's grid, and only then
  everyone stamps. A head-on collision knocks out both players, not whoever happens to
  be first in the list.
- Wall: the head centre gets closer to an edge than its radius.

### 3.4 Trail gaps
Measured in distance, not time, so speed does not change their size: after 170 to 520
units of drawing comes a gap of 24 units. During a gap nothing is drawn or stamped,
but the head still dies if it touches a trail.

### 3.5 Round start
Random positions at least 110 from the walls and 150 from other players. Random heading,
as long as there are at least 260 free units to the wall in that direction.

## 4. Power-ups

A circle of radius 15 on the arena. Its ring colour shows who it affects.

| Power-up | Affects | Effect | Duration |
| --- | --- | --- | --- |
| Turbo | self (green) | speed ×1.6 | 5 s |
| Slow | self | speed ×0.6 | 6 s |
| Thin line | self | width ×0.5 | 8 s |
| Ghost | self | no trail and no trail collisions; walls still kill | 3.5 s |
| Turbo for rivals | rivals (red) | speed ×1.6 | 4 s |
| Thick line for rivals | rivals | width ×2 | 7 s |
| Reversed keys | rivals | left and right swap | 5 s |
| Clear | everyone (blue) | erases all trails | instant |
| Open walls | everyone | leaving one edge brings you back on the opposite one | 8 s |

- First spawn after 3 to 5 s, then every 4 to 8 s. At most 4 on the arena.
- A power-up disappears after 14 s and blinks for its last 2.
- Never spawns closer than 45 to a wall or 70 to a head.
- Picking up an active effect again resets its timer; effects do not stack. Turbo and slow cancel out.
- Each active effect draws a ring around the head that shrinks as time runs out.

## 5. Scoring and match flow

- On every knockout, everyone still alive gets a point. The round winner ends with N-1.
- If the last players die in the same step, nobody gets the final point and the round is a draw.
- Target: 5, 10 or 15 points times (N-1), by match length (short, normal, long). Each knockout
  pays a point to everyone still alive, so a round holds N(N-1)/2 points, and this keeps a
  match at about the same number of rounds for any N: with bots, a normal match is about 17
  rounds and 8 to 9 minutes for 2 to 6 players. The menu shows the resulting number on each
  choice. "Other" is a typed target, 1 to 300, that does not scale.
- Win by 2 (on by default): the match ends when someone reaches the target with a lead of at
  least 2. Turned off, a lead of 1 is enough. Players level at the top always play on.

```
menu → countdown (3, 2, 1) → playing → round end → countdown ...
                                                └→ match end → rematch / menu
```

- During the countdown each player sees their start point, a direction arrow and their name.
- Space pauses a local game and skips the round-end pause. Esc and the Back button pause. Switching tabs pauses.
- Leaving a match always asks first, and the game is frozen while it asks.

## 6. Bots

On each decision a bot tests nine paths: three moves (left, straight, right) for a first
leg of 45 units, then three moves for the rest. Each path is scored by its free run to
an obstacle (trail or wall, with a side safety margin). A move scores 0.7 of its best
follow-up plus 0.3 of the average, so bots prefer moves that keep several ways out. On
a tie a bot keeps its current move, then goes straight.

| Level | Look-ahead | Decides every | Extras |
| --- | --- | --- | --- |
| Easy | 70 | 14 steps | occasional mistakes, ignores power-ups |
| Medium | 120 | 8 steps | heads for power-ups when the way is clear |
| Hard | 190 | 4 steps | also avoids the space in front of rival heads |

When the way is clear a bot wanders with an occasional gentle turn. Reversed keys
confuse bots for a time that depends on their level.

## 7. Input

Default keys (left / right), by physical key position:

| Player | Keys |
| --- | --- |
| 1 | ← → |
| 2 | A D |
| 3 | J L |
| 4 | V N |
| 5 | 1 Q |
| 6 | 9 0 |

Any key can be rebound in the menu: click the key, then press the new one. A key that is
already taken swaps with its owner.

Touch:
- One human on the device: two large thumb buttons, on both sides of the arena in landscape
  and below it in portrait. Touching the left or right half of the arena steers too.
- Several humans on one touch screen: a pair of buttons in each player's colour, up to four.
- Buttons appear automatically on touch devices and can be forced on or off in settings.
- Full screen, and a screen wake lock that is taken again when the tab comes back.
- Space, Esc, Enter and Tab cannot be bound as steering keys.

## 8. Drawing

- Trails accumulate on an offscreen canvas with as many pixels per arena unit as the screen,
  so copying it each frame is one to one; heads, power-ups, particles and effect rings are
  drawn over it every frame.
- Canvas pixels per CSS pixel: at most 2, and on touch screens at most what keeps the arena
  near 600,000 pixels (never below 1). Measured on an emulated phone with a quarter of the CPU
  speed: a fixed double-resolution trail layer and full density ran at 20 frames a second;
  with both changes, about 40.
- Knockout: a particle burst in the player's colour, an expanding ring and a short screen shake.
- Clear: a short white flash. Open walls: a moving dashed border.
- `prefers-reduced-motion` or the screen shake setting: no shake, and no menu demo
  animation with reduced motion.

## 9. Interface

- One dark look on purpose: ink-blue ground, an arena with a faint dot grid, and twelve
  saturated, distinct player colours. Display face Secular One, body face Heebo.
- Menu: a live bot demo on top, a bar with mode (one device / online), version, sound
  and display settings, and language. Below it, players on one side and settings on the other.
- Game: the scoreboard beside the arena, updated on every knockout. On small screens and
  touch devices it is one strip above the arena with a single menu button, which opens the
  game menu (resume, sound and display, leave).
- Phone menu: one column, one row per player, key bindings hidden, controls at least 46px
  tall, and Start pinned to the bottom of the screen.
- Back button: every dialog, the game screen and an online room own one browser history
  entry, stacked in that order whatever order they open in. Back closes the top one: a dialog closes, a room's lobby is left, a finished online
  match returns to the room. During a match Back opens the game menu and the match stays.
  On the bare menu Back leaves the site as usual.
- Colours: tapping the dot in a player's row opens the picker. On one device a taken
  colour swaps with its owner; online it is blocked.
- Language: Hebrew for browsers that prefer Hebrew or clocks set to Israel, English
  otherwise. A choice made in the menu is remembered.
- Settings are stored in `localStorage` inside try/catch, and the game works without it.
- Record: matches, wins and winning streaks are kept in `localStorage` and shown as one line
  under the menu. A match counts when the device has one clear player: any online match, or a
  local match with exactly one human.
- A knockout of this device's player vibrates the phone for 120 ms where the browser supports
  it, under the same setting as the screen shake.

### Installed copy

`public/sw.js` is a service worker that saves the page and its files on the device. The page
is taken from the network when it answers within 2.5 seconds (so a release shows on the next
visit) and from the saved copy otherwise; hashed files in `assets/` always come from the
saved copy. A page is saved only if it really is the game (it has the app's root element and
script), so the host's waking-up page never replaces it. Local play therefore works offline. Fonts come from Google and fall back to the
system font offline. Online play is never cached.

The free server sleeps after 15 idle minutes. A first visit to a sleeping server shows
Render's own "application loading" page for about a minute; Render serves it before our code
runs, so it cannot be changed. This is accepted on purpose: the fixes (a paid plan, moving the
page to a static site at a new address, or pinging the server awake) cost money, need manual
steps or work around the free plan. Returning visitors are not affected: they get the saved copy. The page pings `/healthz` when it opens, and
connecting to a room retries for 90 seconds with a "waking up" message.

## 10. Online

An authoritative server, the usual model for online games. Clients send only their
input (left, straight, right); the server runs the simulation and broadcasts the state.
Nobody can cheat from the browser, and everyone sees the same game.

- Rooms: a 4-letter code. The share link carries the code in the URL hash (removed from
  the address once joined). Up to 6 players, bots included.
- Quick game: joins the fullest public lobby that has a seat, or opens a new public room.
  A public room starts by itself 10 seconds after a second person is in it, and cannot be
  locked. A room made with "Room for friends" is private: reachable only by its code.
- The host can lock the door (no newcomers; a dropped player still returns with their
  token), can remove a bot or a person from the lobby, and can rename a bot there.
- Host: the creator. Only the host changes settings, adds bots and starts. If the host
  leaves, the role passes on.
- Broadcast: 60 JSON snapshots a second with heads, power-ups, new trail segments
  (consecutive pieces of one line merged), events (knockout, pickup, clear) and points.
- Joining mid-round replays every trail segment so far. The newcomer watches until the
  match ends and plays in the next one.
- Seats survive drops. A player whose connection drops is shown as away and keeps the seat
  for 60 seconds in the lobby, and for the whole match during one (a medium bot steers their
  line meanwhile). The host keeps the role for 30 seconds away; after that it passes to the
  person who has been in the room longest, who keeps it when the old host returns.
- Coming back: the device remembers its seat (room code and token) in `localStorage` for 10
  minutes. Opening the game with a remembered seat goes straight back to it; the online tab
  also offers "Back to room", and joining with that room's code takes back the same seat.
  Leaving on purpose, being removed, or the room being gone forgets it.
- Reconnecting: after a drop the client retries with growing waits (0.5 s up to 5 s) for two
  minutes, and at once when the page is shown again or the network returns. On return to the
  page it also pings the server and reconnects if nothing answers within 3 seconds (a phone
  can wake up holding a dead connection).
- A room with no connected person freezes its match, and is closed after 60 seconds, or at
  once when no person holds a seat at all.
- Prediction of your own head: a key press takes one round trip to come back from the
  server, so the server's position for your line is always old. The browser measures the
  round trip with a ping every two seconds, takes the newest server position, and replays
  your own recent input on top of it for one round trip (at most 250 ms), using the same
  movement code as the simulation (`shared/sim/motion.js`). Your head and the short stretch
  behind it are drawn there; the stretch is redrawn every frame and replaced by the real
  trail as it arrives. Snapshots carry the server's step count, so the timing follows the
  server's clock and not the uneven arrival of messages.
- The other players' heads are moved on by the same time, so every head shows the same
  moment and a close call looks the way the server judges it. Their input is unknown, so
  each keeps turning the way its last two server positions show (a full turn or straight);
  the next message corrects a change of mind. Measured through 140 ms of round trip with
  uneven delivery, another player's head used to stand still in about a third of the frames
  and jump in others; predicted, it moves evenly in every frame.
- Trails, power-ups and knockouts are drawn exactly as the server sends them; the server
  stays the only referee, and should be close to the players (Render, Frankfurt).

## 11. Tests

`npm test` (node --test) builds the site first, then runs:
- Simulation: walls, open walls, opponent trails, head-on collisions, no self-collision
  at any speed and width, gaps, ghost, scoring, power-up targets, reversed keys, pickups,
  match target and 2-point lead, determinism with a seed, bot survival.
- Rooms: joining, colours, limits, host rights, input, a full match with bots, reconnects.
- Server: security headers, the built page with no inline code, malformed URLs, only public
  files served, path traversal, WebSocket origin check, junk and oversized messages,
  per-address connection cap.
- Engine (`tests/engine.test.js`): the match state machine without a browser: countdown,
  pause, steering, whole matches between bots, rematch, and the online round, snapshot,
  knockout and match-end messages.
- Back button (`tests/backbutton.test.js`): against a fake browser history: one entry per
  layer, Back closes the top layer, no double Back, sticky game layer, Forward undone.
- Service worker (`tests/sw.test.js`): in a sandbox with a fake network and cache: what is
  saved, the waking-up page never replacing the game, releases, no network.
- Prediction (`tests/prediction.test.js`): the head moves exactly as in the round; with a
  simulated 120 ms connection the predicted head stays within a line's width of the truth;
  other players keep their turn, all heads move on by the same time.
- Protocol (`tests/protocol.test.js`): a snapshot survives encode, JSON and decode.
- Layout and renderer: when the arena turns upright, and that the turn is a pure rotation.
- Settings: bad saved values are replaced or clamped, language detection.
- Version: `shared/config.js` matches `package.json`.

`npm run e2e` is a browser smoke test (Playwright, Chromium): desktop and phone, Hebrew and
English, the tall arena and big buttons, the Back button in every situation, an online match
between a desktop host and a phone guest (invite, lock, remove), and offline play from the
saved copy. It checks for console errors and CSP violations. It is a separate command from
`npm test` because it needs a browser; CI runs both, plus a production build and start, on
every push and before every release. Safari and Firefox are not covered; a real phone is
checked by hand after a release.