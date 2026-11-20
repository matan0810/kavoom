// The "one device" tab: the six player rows, the match settings and Start.

import { useEffect, useState } from 'react';
import { matchTarget } from '../../../shared/config.js';
import { RESERVED_KEYS } from '../../engine/input.js';
import { useSettings } from '../../state/SettingsContext.jsx';
import { PlayerSlot } from './PlayerSlot.jsx';
import { MatchSettings } from './MatchSettings.jsx';

export function LocalPane({ onStart }) {
  const { settings, update, t } = useSettings();
  const [picker, setPicker] = useState(-1); // which row has its colour picker open
  const [rebinding, setRebinding] = useState(null); // { slot, side } waiting for a key press

  // While a key cap is listening, the next key press becomes that player's key.
  useEffect(() => {
    if (!rebinding) return undefined;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape' && RESERVED_KEYS.includes(e.code)) return; // Space pauses: keep listening
      setRebinding(null);
      if (e.code === 'Escape') return;
      update((s) => {
        const mine = s.players[rebinding.slot].keys;
        for (const p of s.players) {
          const j = p.keys.indexOf(e.code);
          if (j >= 0) p.keys[j] = mine[rebinding.side]; // taken key: the two bindings swap
        }
        mine[rebinding.side] = e.code;
      });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [rebinding, update]);

  const active = settings.players.filter((p) => p.mode !== 'off').length;

  return (
    <div className="menu-grid local">
      <section className="block players">
        <h2>{t('players')}</h2>
        <ul className="slots">
          {settings.players.map((_, i) => (
            <PlayerSlot
              key={i}
              index={i}
              pickerOpen={picker === i}
              onTogglePicker={() => setPicker(picker === i ? -1 : i)}
              listening={rebinding && rebinding.slot === i ? rebinding.side : null}
              onListen={(side) => setRebinding({ slot: i, side })}
            />
          ))}
        </ul>
      </section>

      <section className="block options">
        <h2>{t('settings')}</h2>
        <MatchSettings
          values={settings}
          players={Math.max(2, active)}
          onChange={(key, val) =>
            update((s) => {
              s[key] = val;
            })
          }
        />
      </section>

      <div className="start-bar">
        <button type="button" className="btn primary big" disabled={active < 2} onClick={onStart}>
          {t('start')}
        </button>
        <p className="hint">
          {active < 2
            ? t('needTwo')
            : t(
                'startHint',
                active,
                matchTarget(settings.length, active, settings.target),
                settings.winBy2 === 'on',
              )}
        </p>
      </div>
    </div>
  );
}
