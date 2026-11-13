// Cumulative scoring across rounds.

export class Match {
  constructor(playerCount, perOpponent) {
    this.n = playerCount;
    this.target = perOpponent * Math.max(1, playerCount - 1);
    this.scores = new Array(playerCount).fill(0);
    this.roundNo = 0;
  }

  applyRound(points) {
    this.roundNo++;
    for (let i = 0; i < this.n; i++) this.scores[i] += points[i] || 0;
  }

  // Index of the match winner, or -1. Needs the target and a 2-point lead.
  winner() {
    const order = this.ranking();
    const top = this.scores[order[0]];
    const second = this.n > 1 ? this.scores[order[1]] : -Infinity;
    return top >= this.target && top - second >= 2 ? order[0] : -1;
  }

  ranking(extra) {
    const total = (i) => this.scores[i] + (extra ? extra[i] || 0 : 0);
    return [...this.scores.keys()].sort((a, b) => total(b) - total(a) || a - b);
  }
}
