// The twelve line colours as round buttons. `taken` colours cannot be picked.

import { PALETTE } from '../../../shared/config.js';
import { useSettings } from '../../state/SettingsContext.jsx';

export function Swatches({ value, taken = new Set(), onPick, className = '' }) {
  const { t, colorName } = useSettings();
  return (
    <div className={`swatches ${className}`} role="group" aria-label={t('pickColor')}>
      {PALETTE.map((c, i) => (
        <button
          key={c.hex}
          type="button"
          className="swatch"
          style={{ '--c': c.hex }}
          aria-label={colorName(i)}
          aria-pressed={i === value}
          disabled={taken.has(i) && i !== value}
          onClick={() => onPick(i)}
        />
      ))}
    </div>
  );
}
