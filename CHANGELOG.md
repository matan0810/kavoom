# Changelog

All player-facing changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and versions follow
[Semantic Versioning](https://semver.org/): fixes are patch, features are minor,
breaking changes are major.

## [Unreleased]

## [1.3.0] - 2026-11-15

### Added
- Online rooms have an Invite friends button: on phones it opens the share sheet (WhatsApp, Messages and so on), elsewhere it copies the link.
- Quick game: one tap puts you in a public room with whoever else is looking for a game. It starts by itself ten seconds after a second player arrives, and you can add bots and start sooner.
- The host can lock a room's door so nobody new can join, and can remove a player from the lobby.
- Your record on this device (wins, matches, best winning streak) is shown at the bottom of the menu. It counts online matches and matches against bots.
- Phones that support it vibrate briefly when you are knocked out. It follows the Shake and vibration setting.
- The game is kept on your device after the first visit: it opens at once, can be added to the home screen, and one-device play works with no internet.
- While the server is waking up, the online tab says so and keeps trying for a minute and a half instead of failing after five seconds.

### Changed
- Create room is now called Room for friends, next to the new Quick game button.
- Online steering responds at once. Your own line is now drawn where it will be when your key press reaches the server, instead of one round trip late. The server still decides every knockout.

### Fixed
- Sound on iPhones: audio is now switched on from the first touch, as Safari requires.
- Key names in the menu (Space, Shift, Ctrl, Alt) now follow the chosen language instead of always being Hebrew.
- Space, Esc, Enter and Tab can no longer be picked as steering keys, where they clashed with pause.
- Online: when the server closes a room, you are returned to the join form instead of a lobby that no longer exists.
- The screen stays awake again after switching away from the game and back.
- Esc opens the game menu in online matches too.
- Dialogs keep keyboard focus inside them and hand it back when they close.
- Online: after a reconnect (for example a phone moving from Wi-Fi to mobile data), the old connection timing out no longer handed your line to a bot.

### Security
- One address gets 30 attempts a minute to create or join a room, so room codes cannot be guessed in bulk.
- A connection that stops reading is closed once 1 MB of game data is waiting for it, so it cannot exhaust the server's memory.
- Names can no longer contain invisible or text-reordering characters used to imitate another player.
- The content policy now names the site's own WebSocket address (needed by older Safari) and a same-origin resource policy header was added.
- The content policy allows a service worker from the site itself only (worker-src).

## [1.2.0] - 2026-11-14

### Added
- The Back button (and the phone's back gesture) now steps back inside the game: it closes an open dialog, opens the game menu during a match, returns from a finished online match to the room, and leaves a room's lobby. It no longer throws you out of the site in the middle of a game.

### Changed
- Phone layout redesigned. On an upright phone the arena is turned to stand tall and fills the screen instead of sitting in a small strip; steering is unchanged, since left and right are relative to your line.
- On small screens the game shows one strip of scores and a single menu button (resume, sound and display, leave) instead of three small buttons.
- Phone menu: bigger buttons and colour dots, one row per player, settings that fill the row, and Start pinned to the bottom of the screen. Key bindings are hidden on touch screens.
- Dialog buttons stack into full-width buttons on phones.
- Player name fields show the colour's name as a placeholder until a name is typed.
- The room code is removed from the address bar once you have joined.
- The page is now a React app built with Vite; the server serves the built files and caches them properly, so repeat visits load faster.

## [1.1.0] - 2026-11-14

### Security
- Fixed a crash where a malformed URL (such as `/js/%E0`) took the server down.
- Fixed a path traversal where `/js/../server/room.js` exposed server code.
- Security headers (CSP, nosniff, no framing) on every response.
- Online connections are accepted only from the game's own site.
- Limits: 20 connections per address, 1000 in total, and lobby members idle for 30 minutes are disconnected.
- An error in one room closes only that room, not the whole server.

### Added
- Site icon (favicon) and a home screen icon for phones.
- The version number is shown in the menu.
- Default language: Hebrew for browsers that prefer Hebrew or clocks set to Israel, English for everyone else.

### Changed
- The Render service is set to the Frankfurt region, closer to Israel.
- Documentation is in English.

## [1.0.0] - 2026-11-13

First release on the web.

- Line game for 2 to 6 players on one device, with bots at three levels and nine power-ups.
- Online rooms with a code, a host, bots and reconnects.
- Touch buttons for phones.
- Twelve colours to choose from, Hebrew and English.
- Leaving a match asks first, and sound and display settings are available during play.
