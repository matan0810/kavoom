// WebSocket connection to the game server, with automatic rejoin after a drop.

// After a drop, keep trying this long. Phones lose the connection whenever the
// screen locks or the network changes, so this is measured in minutes, not seconds.
const RECONNECT_FOR_MS = 2 * 60 * 1000;
const FIRST_RETRY_MS = 500;
const LONGEST_WAIT_MS = 5000;
// A phone can wake up holding a connection that is already dead without
// knowing it. Coming back to the page, we ask the server for a sign of life.
const ALIVE_CHECK_MS = 3000;

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
    this.heard = 0; // messages received so far
    this.onVisible = () => {
      if (!document.hidden) this.checkAlive();
    };
    document.addEventListener('visibilitychange', this.onVisible);
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
        this.heard++;
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

  // The connection dropped: rejoin the same seat, waiting a little longer each time.
  async lost() {
    if (!this.session) return this.on.down();
    this.on.status('reconnecting');
    const giveUpAt = Date.now() + RECONNECT_FOR_MS;
    let wait = FIRST_RETRY_MS;
    while (!this.done && Date.now() < giveUpAt) {
      await this.pause(wait);
      wait = Math.min(wait * 2, LONGEST_WAIT_MS);
      if (this.done) return;
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

  // Wait ms, or less if the device comes back online or the page is shown again.
  pause(ms) {
    return new Promise((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        window.removeEventListener('online', wake);
        document.removeEventListener('visibilitychange', shown);
        resolve();
      };
      const shown = () => !document.hidden && wake();
      const timer = setTimeout(wake, ms);
      window.addEventListener('online', wake);
      document.addEventListener('visibilitychange', shown);
    });
  }

  // Ask the server for a sign of life; with none in time, treat the connection as dropped.
  checkAlive() {
    const { ws } = this;
    if (this.done || !this.session || !ws || ws.readyState !== 1) return;
    const heardBefore = this.heard;
    this.send({ t: 'ping', c: performance.now() });
    setTimeout(() => {
      if (ws !== this.ws || this.heard > heardBefore || this.done) return;
      // Closing a dead connection can take long to report, so do not wait for it.
      this.ws = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      this.lost();
    }, ALIVE_CHECK_MS);
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  close() {
    this.done = true;
    document.removeEventListener('visibilitychange', this.onVisible);
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}
