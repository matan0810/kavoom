// Game server: serves the static site and runs the online rooms over WebSocket.
//   node server/server.js        (PORT defaults to 8080)

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8080;
const TICK_MS = 1000 / 60;
const MAX_ROOMS = 200;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const rooms = new Map();

function newCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    if (!rooms.has(code)) return code;
  }
}

// Only the game's own files are served: index.html, css/ and js/.
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') return res.writeHead(200).end('ok');
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.resolve(ROOT, rel);
  const allowed = rel === 'index.html' || rel.startsWith('js/') || rel.startsWith('css/');
  if (!allowed || !file.startsWith(ROOT + path.sep) || !TYPES[path.extname(file)]) return res.writeHead(404).end('Not found');
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)], 'Cache-Control': 'no-cache' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });

wss.on('connection', (ws) => {
  let room = null;
  let member = null;
  let count = 0;
  let windowStart = Date.now();
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

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
    // Crude flood guard: more than 200 messages a second closes the socket.
    const now = Date.now();
    if (now - windowStart > 1000) {
      windowStart = now;
      count = 0;
    }
    if (++count > 200) return ws.close();

    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;

    if (member) {
      room.handle(member.id, msg);
      if (msg.t === 'leave') room = member = null;
      return;
    }
    const code = String(msg.code || '').toUpperCase();
    if (msg.t === 'create') {
      if (rooms.size >= MAX_ROOMS) return fail('busy');
      const r = new Room(newCode());
      rooms.set(r.code, r);
      enter(r, r.add(msg.name, msg.color, send));
    } else if (msg.t === 'join' || msg.t === 'rejoin') {
      const r = rooms.get(code);
      if (!r) return fail('noroom');
      const back = msg.t === 'rejoin' ? r.reconnect(String(msg.token || ''), send) : null;
      enter(r, back || r.add(msg.name, msg.color, send));
    }
  });

  ws.on('close', () => {
    if (member) room.disconnect(member.id);
  });
});

let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  for (const [code, room] of rooms) {
    room.tick(dt);
    // A lobby with nobody in it goes at once; a match waits 30s for reconnects.
    if (room.emptyFor > (room.state === 'lobby' ? 0 : 30)) rooms.delete(code);
  }
}, TICK_MS);

// Drop connections that stopped answering pings.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 20000);

server.listen(PORT, () => console.log(`KAVOOM is running on http://localhost:${PORT}`));
