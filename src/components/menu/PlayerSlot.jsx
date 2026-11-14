// One of the six player rows on the "one device" tab:
// colour, name, off / player / bot, and the two steering keys for a human.

import { PALETTE } from '../../../shared/config.js';
import { keyLabel } from '../../engine/input.js';
import { useSettings } from '../../state/SettingsContext.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { Swatches } from '../ui/Swatches.jsx';

export function PlayerSlot({ index, pickerOpen, onTogglePicker, listening, onListen }) {
  const { settings, update, t, colorName } = useSettings();
  const p = settings.players[index];
  const change = (fn) => update((s) => fn(s.players[index], s));

  const pickColor = (color) => {
    change((me, s) => {
      // A colour that another slot holds is swapped with this one.
      const other = s.players.find((q) => q !== me && q.color === color);
      if (other) other.color = me.color;
      me.color = color;
    });
    onTogglePicker();
  };

  return (
    <li className={`slot${p.mode === 'off' ? ' off' : ''}`} style={{ '--c': PALETTE[p.color].hex }}>
      <button
        type="button"
        className="dot"
        aria-label={`${t('pickColor')}: ${colorName(p.color)}`}
        aria-expanded={pickerOpen}
        onClick={onTogglePicker}
      />
      <input
        className="slot-name"
        maxLength={10}
        value={p.name}
        placeholder={colorName(p.color)}
        aria-label={t('playerName', index + 1)}
        onChange={(e) =>
          change((me) => {
            me.name = e.target.value;
          })
        }
      />
      <Segmented
        label={t('playerName', index + 1)}
        options={[
          ['off', t('modeOff')],
          ['human', t('modeHuman')],
          ['bot', t('modeBot')],
        ]}
        value={p.mode}
        onChange={(mode) =>
          change((me) => {
            me.mode = mode;
          })
        }
      />
      {p.mode === 'human' && (
        <div className="slot-keys">
          {[t('left'), t('right')].map((label, side) => (
            <span key={side} className="slot-key">
              {label}
              <button
                type="button"
                className={`keycap${listening === side ? ' listening' : ''}`}
                onClick={() => onListen(side)}
              >
                {listening === side ? t('pressKey') : keyLabel(p.keys[side], t)}
              </button>
            </span>
          ))}
        </div>
      )}
      {pickerOpen && <Swatches className="slot-pick" value={p.color} onPick={pickColor} />}
    </li>
  );
}
