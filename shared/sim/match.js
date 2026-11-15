// Cumulative scoring across rounds.

export class Match {
  // target: points to win (see matchTarget in config.js). lead: how far ahead the
  // winner must be once at the target; 2 means "win by 2", 1 means simply ahead.
  constructor(playerCount, target, lead = 2) {
    this.n = playerCount;
    this.target = target;
    this.lead = lead;
    this.scores = new Array(playerCount).fill(0);
    this.roundNo = 0;
  }

  applyRound(points) {
    this.roundNo++;
    for (let i = 0; i < this.n; i++) this.scores[i] += points[i] || 0;
  }

  // Index of the match winner, or -1. Needs the target and the lead. Players level
  // at the top play on, whatever the lead setting.
  winner() {
    const order = this.ranking();
    const top = this.scores[order[0]];
    const second = this.n > 1 ? this.scores[order[1]] : -Infinity;
    return top >= this.target && top - second >= this.lead ? order[0] : -1;
  }

  ranking(extra) {
    const total = (i) => this.scores[i] + (extra ? extra[i] || 0 : 0);
    return [...this.scores.keys()].sort((a, b) => total(b) - total(a) || a - b);
  }
}
