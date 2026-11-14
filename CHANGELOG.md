# Changelog

All player-facing changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and versions follow
[Semantic Versioning](https://semver.org/): fixes are patch, features are minor,
breaking changes are major.

## [Unreleased]

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
