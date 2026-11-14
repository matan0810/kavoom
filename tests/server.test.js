import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import { startServer } from '../server/server.js';

const quiet = () => {};

async function withServer(fn, opts = {}) {
  const app = startServer({ port: 0, log: quiet, ...opts });
  await new Promise((r) => app.server.once('listening', r));
  const port = app.server.address().port;
  try {
    await fn(port, app);
  } finally {
    await app.close();
  }
}

function get(port, rawPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

function connect(port, origin = `http://127.0.0.1:${port}`) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin });
    ws.on('open', () => resolve({ ws }));
    ws.on('unexpected-response', (req, res) => resolve({ status: res.statusCode }));
    ws.on('error', () => resolve({ status: 0 }));
  });
}

const nextMessage = (ws, type) =>
  new Promise((resolve) => {
    const on = (data) => {
      const m = JSON.parse(data);
      if (m.t === type) {
        ws.off('message', on);
        resolve(m);
      }
    };
    ws.on('message', on);
  });

test('serves the game with security headers', () =>
  withServer(async (port) => {
    const res = await get(port, '/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal((await get(port, '/favicon.svg')).headers['content-type'], 'image/svg+xml');
    assert.equal((await get(port, '/js/main.js')).status, 200);
  }));

test('a malformed URL is a 400 and does not take the server down', () =>
  withServer(async (port) => {
    assert.equal((await get(port, '/js/%E0')).status, 400);
    assert.equal((await get(port, '/js/%00.js')).status, 400);
    assert.equal((await get(port, '/healthz')).status, 200);
  }));

test('only public files are served', () =>
  withServer(async (port) => {
    for (const p of ['/package.json', '/server/server.js', '/server/room.js', '/tests/sim.test.js', '/.git/config', '/js/..%2Fpackage.json', '/js/../server/room.js', '/js/%2E%2E/server/room.js', '/css/..%5Cserver%5Croom.js', '/README.md']) {
      assert.equal((await get(port, p)).status, 404, p);
    }
    assert.equal((await get(port, '/', 'POST')).status, 405);
  }));

test('WebSockets from another site are refused', () =>
  withServer(async (port) => {
    assert.equal((await connect(port, 'https://evil.example')).status, 403);
    const ok = await connect(port);
    assert.ok(ok.ws);
    ok.ws.close();
  }));

test('extra origins can be allowed explicitly', () =>
  withServer(
    async (port) => {
      const ok = await connect(port, 'https://kavoom.example');
      assert.ok(ok.ws);
      ok.ws.close();
    },
    { allowedOrigins: ['https://kavoom.example'] },
  ));

test('garbage messages are ignored and the room still works', () =>
  withServer(async (port, app) => {
    const { ws } = await connect(port);
    for (const junk of ['not json', '42', 'null', '[]', '{"t":5}', JSON.stringify({ t: 'set', key: '__proto__', val: 'x' })]) ws.send(junk);
    const joined = nextMessage(ws, 'joined');
    ws.send(JSON.stringify({ t: 'create', name: { evil: true }, color: 'red' }));
    const m = await joined;
    assert.match(m.code, /^[A-Z]{4}$/);
    assert.equal(app.rooms.size, 1);
    ws.close();
  }));

test('oversized messages close the connection', () =>
  withServer(async (port) => {
    const { ws } = await connect(port);
    const closed = new Promise((r) => ws.on('close', r));
    ws.send('x'.repeat(5000));
    await closed;
    assert.equal((await get(port, '/healthz')).status, 200);
  }));

test('one address cannot open unlimited connections', () =>
  withServer(async (port) => {
    const open = [];
    let refused = null;
    for (let i = 0; i < 25 && !refused; i++) {
      const c = await connect(port);
      if (c.ws) open.push(c.ws);
      else refused = c.status;
    }
    assert.equal(refused, 429);
    assert.equal(open.length, 20);
    open.forEach((w) => w.close());
  }));
