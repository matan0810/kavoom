# KAVOOM: design

An original browser game in the "lines" genre. Every player is a line that keeps moving
forward and leaves a trail. Touching a wall or any trail knocks you out. The last one
alive takes the round.

## 1. Scope

| In | Out |
| --- | --- |
| 2 to 6 players on one device | Accounts and shared high scores |
| Online rooms, each player on their own device | Map editor |
| Bots at three levels | Client-side prediction for online play |
| Power-ups, with an off switch | |
| Touch controls for phones | |
| Hebrew (RTL) and English | |
| Keys bound by `event.code`, so the keyboard layout does not matter | |

## 2. Code layout

```
index.html               the screens
css/style.css            styles (tokens on :root, logical properties for RTL and LTR)
favicon.svg, icons/, manifest.webmanifest
js/config.js             constants: version, arena, physics, palette, keys, power-ups
js/sim/grid.js           occupancy grid for collisions
js/sim/round.js          one round: movement, collisions, gaps, power-ups, round points
js/sim/bot.js            computer player decisions
js/sim/match.js          cumulative score, target and win condition
js/render.js             canvas drawing, particles and effects
js/input.js              keyboard and touch
js/audio.js              WebAudio sound effects
js/net.js                WebSocket client with automatic rejoin
js/i18n.js               Hebrew and English strings
js/main.js               menu, game loop, state machine, local and online modes
server/server.js         static files + WebSocket rooms + security limits
server/room.js           one online room (no sockets, unit tested)
scripts/                 release helpers
tests/                   node --test: simulation, rooms, server
```

The key rule: `js/sim/` is pure. No DOM, canvas or clock. It takes a seeded random
generator and reports outward through hooks (`segment`, `death`, `pickup`, `clear`).
The same code runs the local game, the menu demo and the online server, and it is
tested in Node.

## 3. Simulation

### 3.1 Time and space
- Fixed logical arena of 1120×720 units. The canvas scales to the window; the logic does not.
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
- Target: 5, 10 or 15 points times (N-1), by match length.
- The match ends when someone reaches the target with a lead of at least 2. Otherwise play continues.

```
menu → countdown (3, 2, 1) → playing → round end → countdown ...
                                                └→ match end → rematch / menu
```

- During the countdown each player sees their start point, a direction arrow and their name.
- Space pauses a local game and skips the round-end pause. Esc pauses. Switching tabs pauses.
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
- One human on the device: two large thumb buttons, beside the arena in landscape and
  below it in portrait.
- Several humans on one touch screen: a pair of buttons in each player's colour, up to four.
- Buttons appear automatically on touch devices and can be forced on or off in settings.
- Full screen (with a landscape lock where the browser allows it) and a screen wake lock.

## 8. Drawing

- Trails accumulate on an offscreen canvas at double resolution; heads, power-ups,
  particles and effect rings are drawn over it every frame.
- Knockout: a particle burst in the player's colour, an expanding ring and a short screen shake.
- Clear: a short white flash. Open walls: a moving dashed border.
- `prefers-reduced-motion` or the screen shake setting: no shake, and no menu demo
  animation with reduced motion.

## 9. Interface

- One dark look on purpose: ink-blue ground, an arena with a faint dot grid, and twelve
  saturated, distinct player colours. Display face Secular One, body face Heebo.
- Menu: a live bot demo on top, a bar with mode (one device / online), version, sound
  and display settings, and language. Below it, players on one side and settings on the other.
- Game: the scoreboard beside the arena (above it on narrow screens), updated on every knockout.
- Colours: tapping the dot in a player's row opens the picker. On one device a taken
  colour swaps with its owner; online it is blocked.
- Language: Hebrew for browsers that prefer Hebrew or clocks set to Israel, English
  otherwise. A choice made in the menu is remembered.
- Settings are stored in `localStorage` inside try/catch, and the game works without it.

## 10. Online

An authoritative server, the usual model for online games. Clients send only their
input (left, straight, right); the server runs the simulation and broadcasts the state.
Nobody can cheat from the browser, and everyone sees the same game.

- Rooms: a 4-letter code. The share link carries the code in the URL hash. Up to 6
  players, bots included.
- Host: the creator. Only the host changes settings, adds bots and starts. If the host
  leaves, the role passes on.
- Broadcast: 60 JSON snapshots a second with heads, power-ups, new trail segments
  (consecutive pieces of one line merged), events (knockout, pickup, clear) and points.
- Joining mid-round replays every trail segment so far. The newcomer watches until the
  match ends and plays in the next one.
- A dropped player keeps their seat during a match while a medium bot steers; the client
  retries six times with a token. In the lobby a drop frees the seat.
- No client-side prediction: input lag equals the round trip to the server, so the
  server should be close to the players (Render, Frankfurt).

## 11. Tests

`npm test` (node --test):
- Simulation: walls, open walls, opponent trails, head-on collisions, no self-collision
  at any speed and width, gaps, ghost, scoring, power-up targets, reversed keys, pickups,
  match target and 2-point lead, determinism with a seed, bot survival.
- Rooms: joining, colours, limits, host rights, input, a full match with bots, reconnects.
- Server: security headers, malformed URLs, only public files served, path traversal,
  WebSocket origin check, junk and oversized messages, per-address connection cap.
- Version: `js/config.js` matches `package.json`.

UI changes are also checked in a real browser (Playwright): desktop and phone, Hebrew
and English, no console errors.
