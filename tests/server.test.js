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
    // The page loads one script and one stylesheet, both from assets/, and nothing inline.
    const script = /<script type="module"[^>]* src="(\/assets\/[^"]+\.js)"><\/script>/.exec(res.body);
    const style = /<link rel="stylesheet"[^>]* href="(\/assets\/[^"]+\.css)">/.exec(res.body);
    assert.ok(script && style, 'index.html links its built script and stylesheet');
    assert.doesNotMatch(res.body, /<script(?![^>]* src=)|<style|\sstyle=|\son[a-z]+=/);
    const js = await get(port, script[1]);
    assert.equal(js.status, 200);
    assert.match(js.headers['content-type'], /text\/javascript/);
    assert.match(js.headers['cache-control'], /immutable/);
    assert.equal((await get(port, style[1])).status, 200);
    assert.equal(res.headers['cache-control'], 'no-cache');
  }));

test('a malformed URL is a 400 and does not take the server down', () =>
  withServer(async (port) => {
    assert.equal((await get(port, '/assets/%E0')).status, 400);
    assert.equal((await get(port, '/assets/%00.js')).status, 400);
    assert.equal((await get(port, '/healthz')).status, 200);
  }));

test('only public files are served', () =>
  withServer(async (port) => {
    for (const p of ['/package.json', '/server/server.js', '/server/room.js', '/tests/sim.test.js', '/.git/config', '/assets/..%2Fpackage.json', '/assets/../server/room.js', '/assets/%2E%2E/%2E%2E/server/room.js', '/assets/..%5C..%5Cserver%5Croom.js', '/README.md', '/src/main.jsx', '/shared/config.js', '/vite.config.js', '/assets/../index.html.map']) {
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

test('the policy names the page\'s own WebSocket address, and ignores a strange Host', () =>
  withServer(async (port) => {
    const csp = (await get(port, '/')).headers['content-security-policy'];
    assert.match(csp, new RegExp(`connect-src 'self' ws://127\\.0\\.0\\.1:${port} wss://127\\.0\\.0\\.1:${port};`));
    const odd = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/', headers: { Host: "evil.example; script-src *" } }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.headers));
      });
      req.on('error', reject);
      req.end();
    });
    assert.match(odd['content-security-policy'], /connect-src 'self';/);
    assert.match(odd['content-security-policy'], /script-src 'self';/);
    assert.equal(odd['cross-origin-resource-policy'], 'same-origin');
  }));

test('guessing room codes is cut off after a number of tries', () =>
  withServer(async (port) => {
    const { ws } = await connect(port);
    const answers = [];
    ws.on('message', (d) => answers.push(JSON.parse(d).code));
    for (let i = 0; i < 40; i++) ws.send(JSON.stringify({ t: 'join', code: 'ZZZZ' }));
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(answers.length, 40);
    assert.equal(answers.filter((c) => c === 'noroom').length, 30);
    assert.equal(answers.filter((c) => c === 'busy').length, 10);
    // Even a real room is out of reach until the minute is over.
    ws.send(JSON.stringify({ t: 'create', name: 'A' }));
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(answers.at(-1), 'busy');
    ws.close();
  }));

test('a player who rejoins keeps the seat when the old connection finally closes', () =>
  withServer(async (port, app) => {
    const a = (await connect(port)).ws;
    const joinedA = nextMessage(a, 'joined');
    a.send(JSON.stringify({ t: 'create', name: 'A' }));
    const { code } = await joinedA;
    const b = (await connect(port)).ws;
    const joinedB = nextMessage(b, 'joined');
    b.send(JSON.stringify({ t: 'join', code, name: 'B' }));
    const { token, you } = await joinedB;
    const started = nextMessage(b, 'round');
    a.send(JSON.stringify({ t: 'start' }));
    await started;

    const b2 = (await connect(port)).ws; // B's new connection, while the old one is still open
    const back = nextMessage(b2, 'joined');
    b2.send(JSON.stringify({ t: 'rejoin', code, token }));
    assert.equal((await back).you, you);

    const room = app.rooms.get(code);
    const seat = () => room.members.find((m) => m.id === you);
    b.send(JSON.stringify({ t: 'input', d: 1 })); // the old connection no longer steers
    b2.send(JSON.stringify({ t: 'input', d: -1 }));
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(seat().input, -1);
    b.close();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(seat().connected, true, 'still connected through the new connection');
    a.close();
    b2.close();
  }));
