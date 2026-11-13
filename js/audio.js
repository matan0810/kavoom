// Tiny synthesized sound effects. The AudioContext is created on first use,
// which always follows a click or key press.

export class Sfx {
  constructor() {
    this.enabled = true;
    this.volume = 1;
    this.ctx = null;
  }

  tone(freq, dur, { type = 'square', vol = 0.06, to = freq, delay = 0 } = {}) {
    if (!this.enabled || this.volume <= 0) return;
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
      gain.gain.setValueAtTime(Math.max(0.0002, vol * this.volume), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch {
      this.enabled = false;
    }
  }

  tick() { this.tone(440, 0.09); }
  go() { this.tone(880, 0.18); }
  death() { this.tone(220, 0.35, { type: 'sawtooth', vol: 0.09, to: 50 }); }
  pickup() { this.tone(520, 0.12, { type: 'triangle', vol: 0.1, to: 1040 }); }
  clear() { this.tone(900, 0.3, { type: 'sine', vol: 0.09, to: 200 }); }
  round() { [523, 659].forEach((f, i) => this.tone(f, 0.14, { type: 'triangle', vol: 0.09, delay: i * 0.12 })); }
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', vol: 0.1, delay: i * 0.13 })); }
}
