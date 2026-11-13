// Keyboard and touch state. Keys are tracked by event.code, so the physical
// position matters and the keyboard language does not.

export class Input {
  constructor() {
    this.down = new Set();
    this.touch = new Map(); // pointerId -> -1 | 1
    window.addEventListener('keydown', (e) => this.down.add(e.code));
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.touch.clear();
    });
  }

  // Left half of the element steers left, right half steers right.
  bindTouch(el) {
    const side = (e) => {
      const r = el.getBoundingClientRect();
      return e.clientX < r.left + r.width / 2 ? -1 : 1;
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      this.touch.set(e.pointerId, side(e));
    });
    const end = (e) => this.touch.delete(e.pointerId);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', end);
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
