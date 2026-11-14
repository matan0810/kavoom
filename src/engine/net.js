// WebSocket connection to the game server, with automatic rejoin after a drop.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Net {
  // on: { message(msg), status('reconnecting' | 'ok'), down() }
  // identity(): { name, color } sent again when rejoining
  constructor(url, on, identity) {
    this.url = url;
    this.on = on;
    this.identity = identity;
    this.ws = null;
    this.session = null; // { code, token } once in a room
    this.done = false;
  }

  open() {
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(this.url);
      } catch (e) {
        return reject(e);
      }
      this.ws = ws;
      let opened = false;
      const timer = setTimeout(() => {
        if (opened) return;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(new Error('timeout'));
      }, 5000);
      ws.onopen = () => {
        opened = true;
        clearTimeout(timer);
        resolve();
      };
      ws.onmessage = (e) => {
        let m;
        try {
          m = JSON.parse(e.data);
        } catch {
          return;
        }
        if (m.t === 'joined') this.session = { code: m.code, token: m.token };
        this.on.message(m);
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (!opened) return reject(new Error('closed'));
        if (ws === this.ws && !this.done) this.lost();
      };
    });
  }

  async lost() {
    if (!this.session) return this.on.down();
    this.on.status('reconnecting');
    for (let i = 0; i < 6 && !this.done; i++) {
      await sleep(1000);
      try {
        await this.open();
        this.send({ t: 'rejoin', ...this.session, ...this.identity() });
        this.on.status('ok');
        return;
      } catch {
        /* try again */
      }
    }
    if (!this.done) this.on.down();
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  close() {
    this.done = true;
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}
