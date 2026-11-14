// The part of the game the screen shows (state, scores, countdown...).
// The component re-renders whenever the engine publishes a new one.

import { useSyncExternalStore } from 'react';
import { game } from '../engine/index.js';

export function useGameUi() {
  return useSyncExternalStore(game.subscribe, game.getUi);
}
