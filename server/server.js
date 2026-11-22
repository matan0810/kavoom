// Game server: serves the built site from dist/ and runs the online rooms over WebSocket.
//   npm run build && node server/server.js        (PORT defaults to 8080)
//
// Environment:
//   PORT              port to listen on
//   ALLOWED_ORIGINS   extra page origins allowed to open a WebSocket, comma separated
//                     (only needed when the static site is hosted somewhere else)

import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room, SEAT_GRACE } from './room.js';

// The browser files are built by Vite into dist/ (npm run build).
// The version lives in package.json only (CLAUDE.md, section 1).
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const TICK_MS = 1000 / 60;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export const LIMITS = {
  rooms: 200, // open rooms on the server
  connections: 1000, // open WebSockets on the server
  perIp: 20, // open WebSockets from one address
  messagesPerSecond: 200, // per connection; more closes it
  joinsPerMinute: 30, // create / join / rejoin attempts from one address; stops code guessing
  bufferedBytes: 1024 * 1024, // unsent data queued for one connection; more closes it
  idleLobbyMs: 30 * 60 * 1000, // a lobby member silent this long is disconnected
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2', // the fonts ship with the game (src/main.jsx)
  '.woff': 'font/woff',
};

// Only these files and folders inside dist/ are ever served. Everything else
// (server code, sources, package files, tests, .git) is a 404.
const PUBLIC_FILES = new Set(['index.html', 'favicon.svg', 'manifest.webmanifest', 'sw.js']);
const PUBLIC_DIRS = ['assets/', 'icons/'];
// Files in assets/ carry a hash of their content in the name, so they never change.
const CACHE_FOREVER = 'public, max-age=31536000, immutable';

// `host` is added to connect-src by name because older Safari does not count a
// WebSocket to the page's own host as 'self'. It comes from the request, so it
// is used only when it looks like a plain host name.
function contentSecurityPolicy(host) {
  const ownSocket = /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host || '')
    ? ` ws://${host} wss://${host}`
    : '';
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data:",
    `connect-src 'self'${ownSocket}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
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
  if (!allowed || !file.startsWith(ROOT + path.sep) || !TYPES[path.extname(file)])
    return { status: 404 };
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

// healthEveryMs: how often the game loop's health is logged (tests make it short).
export function startServer({
  port = 8080,
  allowedOrigins = [],
  log = console.log,
  healthEveryMs = 60000,
} = {}) {
  const rooms = new Map();
  const perIp = new Map(); // address -> open connections
  const joins = new Map(); // address -> { count, since } for the current minute

  // True while this address may still try to create or join a room this minute.
  const mayJoin = (ip) => {
    const now = Date.now();
    let j = joins.get(ip);
    if (!j || now - j.since > 60000) joins.set(ip, (j = { count: 0, since: now }));
    return ++j.count <= LIMITS.joinsPerMinute;
  };

  const newCode = () => {
    for (;;) {
      let code = '';
      for (let i = 0; i < 4; i++) code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
      if (!rooms.has(code)) return code;
    }
  };

  // "Quick game": the fullest public lobby that still has a seat, or a new one.
  const openPublicRoom = () => {
    let best = null;
    for (const r of rooms.values()) {
      if (!r.public || r.state !== 'lobby' || r.refusal()) continue;
      if (!best || r.members.length > best.members.length) best = r;
    }
    if (best || rooms.size >= LIMITS.rooms) return best;
    const r = new Room(newCode(), undefined, { isPublic: true });
    rooms.set(r.code, r);
    return r;
  };

  const server = http.createServer(async (req, res) => {
    try {
      const secure = req.headers['x-forwarded-proto'] === 'https';
      const headers = {
        ...SECURITY_HEADERS,
        'Content-Security-Policy': contentSecurityPolicy(req.headers.host),
        ...(secure ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
      };
      if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405, headers).end();
      const urlPath = (req.url || '/').split('?')[0];
      if (urlPath === '/healthz') return res.writeHead(200, headers).end('ok');
      // The running version, for the workflow that tags a release once it is live.
      if (urlPath === '/version') {
        const type = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
        return res
          .writeHead(200, { ...headers, ...type })
          .end(JSON.stringify({ version: VERSION }));
      }
      const { file, status } = publicPath(urlPath);
      if (!file)
        return res.writeHead(status, headers).end(status === 400 ? 'Bad request' : 'Not found');
      let body;
      try {
        body = await readFile(file);
      } catch {
        return res.writeHead(404, headers).end('Not found');
      }
      const hashed = path.relative(ROOT, file).startsWith('assets' + path.sep);
      res.writeHead(200, {
        ...headers,
        'Content-Type': TYPES[path.extname(file)],
        'Cache-Control': hashed ? CACHE_FOREVER : 'no-cache',
      });
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
      if (ws.readyState !== 1) return;
      // A client that stopped reading must not make the server hoard its snapshots.
      if (ws.bufferedAmount > LIMITS.bufferedBytes) return ws.terminate();
      ws.send(s);
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
        // This member has rejoined on a newer connection: this one is no longer theirs.
        if (member && member.send !== send) room = member = null;
        if (member) {
          room.handle(member.id, msg);
          if (msg.t === 'leave') room = member = null;
          return;
        }
        if (!['create', 'quick', 'join', 'rejoin'].includes(msg.t)) return;
        if (!mayJoin(ip)) return fail('busy');
        const code = typeof msg.code === 'string' ? msg.code.toUpperCase() : '';
        if (msg.t === 'create') {
          if (rooms.size >= LIMITS.rooms) return fail('busy');
          const r = new Room(newCode());
          rooms.set(r.code, r);
          enter(r, r.add(msg.name, msg.color, send));
        } else if (msg.t === 'quick') {
          const r = openPublicRoom();
          if (!r) return fail('busy');
          enter(r, r.add(msg.name, msg.color, send));
        } else {
          const r = rooms.get(code);
          if (!r) return fail('noroom');
          const back =
            msg.t === 'rejoin' && typeof msg.token === 'string'
              ? r.reconnect(msg.token, send)
              : null;
          if (!back && r.refusal()) return fail(r.refusal());
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
        if (member) room.disconnect(member.id, send);
      } catch (e) {
        log('disconnect failed:', e.message);
      }
    });
  });

  let last = performance.now();
  // Health of the game loop, logged once a minute while anyone plays: whether
  // ticks ran late (the server stalled, for example on a CPU limit) and how
  // much CPU the process used. Counts only, nothing about players.
  const health = { late: 0, worst: 0, cpu: process.cpuUsage(), since: performance.now() };
  const reportHealth = () => {
    const now = performance.now();
    const used = process.cpuUsage(health.cpu);
    const cpu = ((used.user + used.system) / 1000 / (now - health.since)) * 100;
    let players = 0;
    for (const room of rooms.values()) players += room.humans().length;
    if (players > 0) {
      log(
        `health: ${rooms.size} rooms, ${players} players, cpu ${cpu.toFixed(1)}%, ` +
          `ticks over 50 ms late: ${health.late}, worst ${health.worst.toFixed(0)} ms`,
      );
    }
    Object.assign(health, { late: 0, worst: 0, cpu: process.cpuUsage(), since: now });
  };
  const healthTimer = setInterval(reportHealth, healthEveryMs);

  const tick = setInterval(() => {
    const now = performance.now();
    const late = now - last - TICK_MS;
    if (late > 50) health.late++;
    health.worst = Math.max(health.worst, late);
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
      // A room goes once no person holds a seat, or nobody has been here for the seat grace.
      if (room.abandoned() || room.emptyFor > SEAT_GRACE) rooms.delete(code);
    }
  }, TICK_MS);

  // Drop connections that stopped answering pings, and lobby members who went quiet.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [ip, j] of joins) if (now - j.since > 60000) joins.delete(ip);
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
      clearInterval(healthTimer);
      clearInterval(sweep);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!existsSync(path.join(ROOT, 'index.html'))) {
    console.error('dist/index.html is missing. Run "npm run build" first.');
    process.exit(1);
  }
  const port = Number(process.env.PORT) || 8080;
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const { server } = startServer({ port, allowedOrigins });
  server.on('listening', () => console.log(`KAVOOM is running on http://localhost:${port}`));
}
