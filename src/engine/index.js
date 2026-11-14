// The one set of engine objects the whole page shares. They live outside React:
// a game in progress must not restart because a component re-rendered.

import { Input } from './input.js';
import { Sfx } from './audio.js';
import { Game } from './game.js';

export const input = new Input();
export const sfx = new Sfx();
export const game = new Game({ input, sfx });
