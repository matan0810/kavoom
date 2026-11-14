// The one set of engine objects the whole page shares. They live outside React:
// a game in progress must not restart because a component re-rendered.

import { Input } from './input.js';
import { Sfx } from './audio.js';
import { Haptics } from './haptics.js';
import { Game } from './game.js';

export const input = new Input();
export const sfx = new Sfx();
export const haptics = new Haptics();
export const game = new Game({ input, sfx, haptics });

// See audio.js: sound has to be switched on from inside a touch or key press.
for (const event of ['pointerdown', 'pointerup', 'keydown']) {
  window.addEventListener(event, () => sfx.unlock(), { capture: true, passive: true });
}
