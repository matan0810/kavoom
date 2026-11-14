// Keyboard and touch state. Keys are tracked by event.code, so the physical
// position matters and the keyboard language does not.

export class Input {
  constructor() {
    this.down = new Set();
    this.touch = new Map(); // pointerId -> -1 | 1
    this.pads = new Map(); // player index -> { l, r }, set by the on-screen buttons
    window.addEventListener('keydown', (e) => this.down.add(e.code));
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.touch.clear();
      this.pads.clear();
    });
  }

  setPad(player, side, on) {
    const st = this.pads.get(player) || { l: 0, r: 0 };
    st[side] = on ? 1 : 0;
    this.pads.set(player, st);
  }

  padDir(player) {
    const st = this.pads.get(player);
    return st ? st.r - st.l : 0;
  }

  // Left half of the element steers left, right half steers right.
  // Returns a function that removes the listeners again.
  bindTouch(el) {
    const side = (e) => {
      const r = el.getBoundingClientRect();
      return e.clientX < r.left + r.width / 2 ? -1 : 1;
    };
    const start = (e) => {
      if (e.pointerType === 'mouse') return;
      this.touch.set(e.pointerId, side(e));
    };
    const end = (e) => this.touch.delete(e.pointerId);
    const events = [['pointerdown', start], ['pointerup', end], ['pointercancel', end], ['pointerleave', end]];
    for (const [name, fn] of events) el.addEventListener(name, fn);
    return () => {
      for (const [name, fn] of events) el.removeEventListener(name, fn);
      this.touch.clear();
    };
  }

  keys([left, right]) {
    return (this.down.has(right) ? 1 : 0) - (this.down.has(left) ? 1 : 0);
  }

  touchDir() {
    let d = 0;
    for (const v of this.touch.values()) d += v;
    return Math.sign(d);
  }
}

const ARROWS = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
const NAMED = {
  Space: 'רווח', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Minus: '-', Equal: '=', Backslash: '\\', Backquote: '`', Enter: 'Enter', Tab: 'Tab',
  ShiftLeft: 'Shift שמאל', ShiftRight: 'Shift ימין', ControlLeft: 'Ctrl שמאל', ControlRight: 'Ctrl ימין',
  AltLeft: 'Alt שמאל', AltRight: 'Alt ימין',
};

export function keyLabel(code) {
  if (ARROWS[code]) return ARROWS[code];
  if (NAMED[code]) return NAMED[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
