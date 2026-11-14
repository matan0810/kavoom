// This device's record: matches played and won, and winning streaks.
// Kept in localStorage, like the settings; nothing is sent anywhere.

const STORE_KEY = 'kavoom.stats.v1';
const EMPTY = { matches: 0, wins: 0, streak: 0, best: 0 };

const count = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

export function loadStats() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    const stats = {
      matches: count(saved.matches),
      wins: count(saved.wins),
      streak: count(saved.streak),
      best: count(saved.best),
    };
    // Numbers that cannot all be true together mean the record was tampered with or broken.
    if (stats.wins > stats.matches || stats.streak > stats.best || stats.best > stats.wins) {
      return { ...EMPTY };
    }
    return stats;
  } catch {
    return { ...EMPTY };
  }
}

export function saveStats(stats) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(stats));
  } catch {
    // Storage is unavailable: the record lasts until the page closes.
  }
}

// The record after one more finished match.
export function recordMatch(stats, won) {
  const streak = won ? stats.streak + 1 : 0;
  return {
    matches: stats.matches + 1,
    wins: stats.wins + (won ? 1 : 0),
    streak,
    best: Math.max(stats.best, streak),
  };
}
