# Changelog

All player-facing changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and versions follow
[Semantic Versioning](https://semver.org/): fixes are patch, features are minor,
breaking changes are major.

## [Unreleased]

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
