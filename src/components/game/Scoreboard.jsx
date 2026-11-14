// The players ordered by score. Shown beside the arena, as a strip above it
// on small screens, and inside the match end dialog.

export function Scoreboard({ players }) {
  const order = [...players].sort((a, b) => b.score - a.score || a.index - b.index);
  return (
    <ol className="scores">
      {order.map((p) => (
        <li key={p.index} className={p.out ? 'out' : ''} style={{ '--c': p.color }}>
          <span className="dot" />
          <span className="who">{p.name}</span>
          <span className="pts">{p.score}</span>
        </li>
      ))}
    </ol>
  );
}
