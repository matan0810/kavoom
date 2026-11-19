// The network client's reconnecting, against a fake WebSocket and a fake clock.

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

// A browser-like page: visible or hidden, online events.
globalThis.window = new EventTarget();
globalThis.document = Object.assign(new EventTarget(), { hidden: false });
const show = () => {
  globalThis.document.hidden = false;
  globalThis.document.dispatchEvent(new Event('visibilitychange'));
};

// The server: up or down, and what it answers.
const server = { up: true, answers: true, sockets: [], received: [] };
class FakeSocket {
  constructor() {
    this.readyState = 0;
    server.sockets.push(this);
    queueMicrotask(() => {
      if (!server.up) return this.onclose?.();
      this.readyState = 1;
      this.onopen?.();
    });
  }
  send(text) {
    const m = JSON.parse(text);
    server.received.push(m);
    if (!server.answers) return;
    if (m.t === 'rejoin' || m.t === 'join')
      this.reply({ t: 'joined', code: 'ABCD', token: 'seat-1', you: 2 });
    if (m.t === 'ping') this.reply({ t: 'pong', c: m.c });
  }
  reply(m) {
    queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(m) }));
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    queueMicrotask(() => this.onclose?.());
  }
}
globalThis.WebSocket = FakeSocket;

const { Net } = await import('../src/engine/net.js');
const flush = () => new Promise((r) => setImmediate(r));
async function advance(ms) {
  for (let t = 0; t < ms; t += 100) {
    mock.timers.tick(100);
    await flush();
  }
}

async function connected() {
  server.up = true;
  server.answers = true;
  server.sockets = [];
  server.received = [];
  const log = [];
  const net = new Net(
    'ws://x/ws',
    {
      message: (m) => log.push(m.t),
      status: (s) => log.push(`status:${s}`),
      down: () => log.push('down'),
    },
    () => ({ name: 'Dana', color: 3 }),
  );
  await net.open();
  net.send({ t: 'join', code: 'ABCD' });
  await flush();
  return { net, log };
}

test('a drop longer than a few seconds is ridden out, and the same seat is taken back', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => mock.timers.reset());
  const { net, log } = await connected();
  server.up = false;
  net.ws.close();
  await advance(30000); // half a minute without the server
  assert.ok(!log.includes('down'), 'still trying');
  server.up = true;
  await advance(6000);
  assert.ok(log.includes('status:ok'));
  const rejoin = server.received.find((m) => m.t === 'rejoin');
  assert.deepEqual(rejoin, { t: 'rejoin', code: 'ABCD', token: 'seat-1', name: 'Dana', color: 3 });
  net.close();
});

test('after two minutes it gives up', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => mock.timers.reset());
  const { net, log } = await connected();
  server.up = false;
  net.ws.close();
  await advance(125000);
  assert.ok(log.includes('down'));
  net.close();
});

test('coming back to the page retries at once instead of waiting out the pause', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => mock.timers.reset());
  const { net, log } = await connected();
  server.up = false;
  net.ws.close();
  await advance(20000); // the waits have grown to five seconds
  server.up = true;
  show();
  await flush();
  await flush();
  assert.ok(log.includes('status:ok'), 'back without waiting');
  net.close();
});

test('a connection that died quietly while the phone slept is noticed on return', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => mock.timers.reset());
  const { net, log } = await connected();
  const before = server.sockets.length;
  server.answers = false; // the socket looks open, but nothing comes back
  show();
  await advance(3500);
  server.answers = true;
  await advance(2000);
  assert.ok(server.sockets.length > before, 'a new connection was made');
  assert.ok(log.includes('status:ok'));
  net.close();
});

test('a healthy connection is left alone when the page is shown again', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => mock.timers.reset());
  const { net } = await connected();
  const before = server.sockets.length;
  show();
  await advance(4000);
  assert.equal(server.sockets.length, before);
  net.close();
});
