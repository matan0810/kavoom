// The players ordered by score. Shown beside the arena, as a strip above it
// on small screens, and inside the match end dialog.

import { useT } from '../../state/SettingsContext.jsx';

export function Scoreboard({ players }) {
  const t = useT();
  const order = [...players].sort((a, b) => b.score - a.score || a.index - b.index);
  return (
    <ol className="scores">
      {order.map((p) => (
        <li
          key={p.index}
          className={[p.out && 'out', p.gone && 'gone'].filter(Boolean).join(' ')}
          style={{ '--c': p.color }}
        >
          <span className="dot" />
          <span className="who">
            {p.name}
            {p.gone && <small> · {t('leftGame')}</small>}
          </span>
          <span className="pts">{p.score}</span>
        </li>
      ))}
    </ol>
  );
}
