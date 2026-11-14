// On-screen steering: a left and a right button for each human on this device,
// in that player's colour. With one human the two buttons are big thumb zones.

import { useEffect, useState } from 'react';
import { input } from '../../engine/index.js';
import { useT } from '../../state/SettingsContext.jsx';

function PadButton({ player, side, name }) {
  const t = useT();
  const [on, setOn] = useState(false);
  const set = (value) => {
    setOn(value);
    input.setPad(player, side, value);
  };
  return (
    <button
      type="button"
      className={`padbtn${on ? ' on' : ''}`}
      aria-label={`${name} ${t(side === 'l' ? 'left' : 'right')}`}
      onPointerDown={(e) => {
        e.preventDefault();
        set(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onLostPointerCapture={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {side === 'l' ? '◀' : '▶'}
    </button>
  );
}

export function TouchPads({ owners, players }) {
  // Nothing may stay "held" after the buttons are gone.
  useEffect(() => () => input.pads.clear(), []);
  return (
    <div className="pads" dir="ltr">
      {owners.map((i) => (
        <div key={i} className="pad" style={{ '--c': players[i].color }}>
          <PadButton player={i} side="l" name={players[i].name} />
          <PadButton player={i} side="r" name={players[i].name} />
        </div>
      ))}
    </div>
  );
}
