# Security

## What the server stores

Nothing. There are no accounts, no database and no logs with player data. An online
player's name and colour live in server memory only while the room is open. The server
does not record IP addresses. Each player's settings (language, keys, colours) are kept
only in their own browser.

## What is protected

- **Files:** the server serves only the built site in `dist/`: `index.html`, `favicon.svg`,
  `manifest.webmanifest` and the `assets/` and `icons/` folders, checked after the path is
  resolved. Server code, sources, tests and project files are never served.
- **Headers:** a Content-Security-Policy that allows scripts only from the site itself and
  connections only to the site's own address, no framing, `nosniff`, same-origin resource
  and opener policies, and HSTS behind HTTPS.
- **Online:** connections are accepted only from the game's own site (Origin check).
  Messages are capped at 2 KB and 200 per second, every value from a client is checked
  against a closed list, and names are stripped of control characters, angle brackets and
  invisible or text-reordering characters. The server runs the game, so a player cannot
  cheat from the browser.
- **Rooms:** one address gets 30 attempts a minute to create or join a room, so the
  four-letter codes cannot be guessed in bulk. A seat can be taken back only with the
  random token its player was given, and once it is, the old connection loses it.
- **Load:** at most 200 rooms, 1000 connections and 20 connections from one address.
  Connections that stop answering are closed, a connection that stops reading is closed
  once 1 MB is waiting for it, and lobby members idle for 30 minutes are disconnected.
- **Stability:** an error while handling a message or running a room does not take the
  server down.

## Known limits

- The per-address caps rely on the `X-Forwarded-For` header, which can be forged. The
  server-wide caps still apply.
- Rooms have no password. Anyone with the code can join until the host locks the door.
- Public rooms (quick game) are open to anyone by design.
- Protection against large denial-of-service attacks depends on Render's infrastructure.

## Reporting a problem

Use the repository's Security tab (Report a vulnerability), not a public issue.
