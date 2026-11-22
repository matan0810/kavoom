# Changelog

All player-facing changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and versions follow
[Semantic Versioning](https://semver.org/): fixes are patch, features are minor,
breaking changes are major.

## [Unreleased]

### Added
- When a newer version is live than the saved copy on the device, the menu says so with a Reload button, instead of showing the old version until the next visit.

### Changed
- A new release is tagged on GitHub as soon as Render finishes deploying it, instead of waiting for a scheduled check that GitHub may delay for hours.

## [1.7.0] - 2026-11-22

### Changed
- GitHub releases are now tagged only once the live site serves the new version: a Tag workflow checks every half hour (or when started by hand from the Actions tab) and creates any release that is missing.
- The working procedure (CLAUDE.md) follows the project template: sections 1 to 12 are the shared method, and this project's facts are in section 13. SECURITY.md is now a table of threats, their answers and the tests that prove them.

- The fonts now ship with the game instead of loading from Google, so they also work offline and no player's browser contacts Google.

### Security
- The content policy no longer allows any outside host: styles and fonts come from the site itself.
- The game checks every message from the server before using it and drops a malformed one, so a broken or hostile message cannot crash the page.

- Trusted Types are enforced: the browser refuses to turn plain text into HTML or script addresses, and the game's one policy allows only its offline copy (sw.js).
## [1.6.0] - 2026-11-20

### Added
- A How to play dialog explains the rules in full: the aim, steering, gaps, scoring and winning, every power-up with its icon and duration, and online play. It opens from the ? button in the menu bar and from the game menu, and replaces the short list under the settings.

## [1.5.0] - 2026-11-19

### Added
- The host of an online room can rename a bot in the lobby: tap its name and type.
- While people play online, the server writes one health line a minute to its log in Render (rooms, players, CPU, and whether the game loop ran late), so a stalling server shows up. It holds counts only, nothing about players.
- The host of an online room chooses what happens when someone leaves mid-match: a bot plays on for them (as before, the default), or their line leaves the game. A line that leaves gives nobody a point, its score stays on the board marked as left, and if only one line is left the match ends.

### Fixed
- Online: the other players' lines no longer stutter and jump. They now move as smoothly as your own, even when messages from the server arrive unevenly.
- Online: a player whose connection drops keeps their seat for a minute, in the lobby too, instead of losing it at once.
- Online: the host keeps the role through a short drop (a locked phone); it passes to someone else only after half a minute away.
- Online: reloading the page or reopening the game puts you back in your seat in the room, instead of making a second you while the old one stays behind. Joining with the room's code does the same, and the online tab offers Back to room.
- Online: after a drop the game keeps trying to reconnect for two minutes instead of six seconds, and tries again at once when you return to the page or the network comes back.
- Online: when nobody is left in a room, the match waits instead of the bots playing on.
- After a reload in the middle of a match, the Back button opens the game menu again instead of leaving the room.
- The game draws about twice as fast on mid-range phones (measured on an emulated phone, from 20 to about 40 frames a second): the trail layer now matches the screen's resolution, and phones paint at most about half a million arena pixels.

- Online: all lines are now shown at the same moment. Before, your own line was drawn ahead of the others, so in a close call it looked like you passed first even when the server saw the other player first.
## [1.4.0] - 2026-11-15

### Added
- Match length shows the actual points for the players in the game (for example Normal · 20 with three players), and Other lets you type your own number of points to win.
- Win by 2 can be turned off: then the first player to reach the target wins (players level at the top still play on).

### Fixed
- If the server was asleep when the game was opened, its saved copy could be replaced by the host's "application loading" page. Only the real game page is saved now.

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
