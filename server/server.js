// Game server: serves the static site and runs the online rooms over WebSocket.
//   node server/server.js        (PORT defaults to 8080)
//
// Environment:
//   PORT              port to listen on
//   ALLOWED_ORIGINS   extra page origins allowed to open a WebSocket, comma separated
//                     (only needed when the static site is hosted somewhere else)

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TICK_MS = 1000 / 60;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export const LIMITS = {
  rooms: 200, // open rooms on the server
  connections: 1000, // open WebSockets on the server
  perIp: 20, // open WebSockets from one address
  messagesPerSecond: 200, // per connection; more closes it
  idleLobbyMs: 30 * 60 * 1000, // a lobby member silent this long is disconnected
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

// Only these files and folders are ever served. Everything else (server code,
// package files, tests, .git) is a 404.
const PUBLIC_FILES = new Set(['index.html', 'favicon.svg', 'manifest.webmanifest']);
const PUBLIC_DIRS = ['js/', 'css/', 'icons/'];

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

function publicPath(urlPath) {
  let rel;
  try {
    rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.slice(1));
  } catch {
    return { status: 400 };
  }
  if (rel.includes('\0')) return { status: 400 };
  // Check the allowlist against the resolved path, so "js/../server/x.js" cannot slip through.
  const file = path.resolve(ROOT, rel);
  const clean = path.relative(ROOT, file).split(path.sep).join('/');
  const allowed = PUBLIC_FILES.has(clean) || PUBLIC_DIRS.some((d) => clean.startsWith(d));
  if (!allowed || !file.startsWith(ROOT + path.sep) || !TYPES[path.extname(file)]) return { status: 404 };
  return { file };
}

// Best effort: behind a proxy the first X-Forwarded-For entry is the client.
// It can be forged, which only lets an attacker dodge the per-address cap;
// the server-wide caps still hold.
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || '?';
}

function originAllowed(req, extra) {
  const origin = req.headers.origin;
  if (!origin) return false;
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  return host === req.headers.host || extra.includes(origin);
}

export function startServer({ port = 8080, allowedOrigins = [], log = console.log } = {}) {
  const rooms = new Map();
  const perIp = new Map();

  const newCode = () => {
    for (;;) {
      let code = '';
      for (let i = 0; i < 4; i++) code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
      if (!rooms.has(code)) return code;
    }
  };

  const server = http.createServer(async (req, res) => {
    try {
      const secure = req.headers['x-forwarded-proto'] === 'https';
      const headers = { ...SECURITY_HEADERS, ...(secure ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}) };
      if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405, headers).end();
      const urlPath = (req.url || '/').split('?')[0];
      if (urlPath === '/healthz') return res.writeHead(200, headers).end('ok');
      const { file, status } = publicPath(urlPath);
      if (!file) return res.writeHead(status, headers).end(status === 400 ? 'Bad request' : 'Not found');
      let body;
      try {
        body = await readFile(file);
      } catch {
        return res.writeHead(404, headers).end('Not found');
      }
      res.writeHead(200, { ...headers, 'Content-Type': TYPES[path.extname(file)], 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (e) {
      log('request failed:', e.message);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });

  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 2048,
    verifyClient: ({ req }, done) => {
      if (!originAllowed(req, allowedOrigins)) return done(false, 403);
      if (wss.clients.size >= LIMITS.connections) return done(false, 503);
      if ((perIp.get(clientIp(req)) || 0) >= LIMITS.perIp) return done(false, 429);
      done(true);
    },
  });

  wss.on('connection', (ws, req) => {
    const ip = clientIp(req);
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    let room = null;
    let member = null;
    let count = 0;
    let windowStart = Date.now();
    ws.isAlive = true;
    ws.lastMsg = Date.now();
    ws.inLobby = () => !!room && room.state === 'lobby';
    ws.on('pong', () => (ws.isAlive = true));
    ws.on('error', () => {});

    const send = (s) => {
      if (ws.readyState === 1) ws.send(s);
    };
    const fail = (code) => send(JSON.stringify({ t: 'error', code }));
    const enter = (r, m) => {
      if (!m) return fail('full');
      room = r;
      member = m;
    };

    ws.on('message', (data) => {
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        count = 0;
      }
      if (++count > LIMITS.messagesPerSecond) return ws.close(1008);
      ws.lastMsg = now;

      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;

      try {
        if (member) {
          room.handle(member.id, msg);
          if (msg.t === 'leave') room = member = null;
          return;
        }
        const code = String(msg.code || '').toUpperCase();
        if (msg.t === 'create') {
          if (rooms.size >= LIMITS.rooms) return fail('busy');
          const r = new Room(newCode());
          rooms.set(r.code, r);
          enter(r, r.add(msg.name, msg.color, send));
        } else if (msg.t === 'join' || msg.t === 'rejoin') {
          const r = rooms.get(code);
          if (!r) return fail('noroom');
          const back = msg.t === 'rejoin' ? r.reconnect(String(msg.token || ''), send) : null;
          enter(r, back || r.add(msg.name, msg.color, send));
        }
      } catch (e) {
        log('message failed:', e.message);
      }
    });

    ws.on('close', () => {
      const left = (perIp.get(ip) || 1) - 1;
      if (left > 0) perIp.set(ip, left);
      else perIp.delete(ip);
      try {
        if (member) room.disconnect(member.id);
      } catch (e) {
        log('disconnect failed:', e.message);
      }
    });
  });

  let last = performance.now();
  const tick = setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    for (const [code, room] of rooms) {
      try {
        room.tick(dt);
      } catch (e) {
        log(`room ${code} failed, closing it:`, e.message);
        room.broadcast({ t: 'error', code: 'lost' });
        rooms.delete(code);
        continue;
      }
      // A lobby with nobody in it goes at once; a match waits 30s for reconnects.
      if (room.emptyFor > (room.state === 'lobby' ? 0 : 30)) rooms.delete(code);
    }
  }, TICK_MS);

  // Drop connections that stopped answering pings, and lobby members who went quiet.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const ws of wss.clients) {
      if (!ws.isAlive || (ws.inLobby() && now - ws.lastMsg > LIMITS.idleLobbyMs)) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 20000);

  server.listen(port);

  return {
    server,
    rooms,
    close() {
      clearInterval(tick);
      clearInterval(sweep);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 8080;
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const { server } = startServer({ port, allowedOrigins });
  server.on('listening', () => console.log(`KAVOOM is running on http://localhost:${port}`));
}
