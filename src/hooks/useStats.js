// The player's record, updated whenever the engine reports a finished match.

import { useEffect, useState } from 'react';
import { game } from '../engine/index.js';
import { loadStats, recordMatch, saveStats } from '../state/stats.js';

export function useStats() {
  const [stats, setStats] = useState(loadStats);
  useEffect(() => {
    game.onMatchEnd = ({ won }) => {
      setStats((old) => {
        const next = recordMatch(old, won);
        saveStats(next);
        return next;
      });
    };
    return () => {
      game.onMatchEnd = null;
    };
  }, []);
  return stats;
}
