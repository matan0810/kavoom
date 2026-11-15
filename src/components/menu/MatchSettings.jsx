// Match length, win by 2, bot level and power-ups. Used on the "one device" tab with
// the saved settings, and in an online room with the room's settings (host only).
//
// Each length shows the points it means for the players here right now; "Other"
// lets the players type their own number.

import { useEffect, useState } from 'react';
import { LENGTHS, TARGET_LIMITS, clampTarget, matchTarget } from '../../../shared/config.js';
import { useT } from '../../state/SettingsContext.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { SettingRow } from '../ui/SettingRow.jsx';

// The typed number. Kept as text while typing, so the field can be cleared and
// retyped; a valid number is passed on at once and the field is tidied on blur.
function TargetField({ value, disabled, onChange }) {
  const t = useT();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      className="field number"
      type="number"
      inputMode="numeric"
      min={TARGET_LIMITS.min}
      max={TARGET_LIMITS.max}
      aria-label={t('customTarget')}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value !== '') onChange(clampTarget(e.target.value));
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

export function MatchSettings({ values, players, onChange, disabled = false }) {
  const t = useT();
  const onOff = [
    ['on', t('on')],
    ['off', t('off')],
  ];
  const lengths = [
    ...Object.keys(LENGTHS).map((key) => [key, `${t(key)} · ${matchTarget(key, players)}`]),
    ['custom', t('custom')],
  ];
  const pickLength = (length) => {
    // "Other" starts from the number that was showing, not from some old one.
    if (length === 'custom' && values.length !== 'custom') {
      onChange('target', matchTarget(values.length, players, values.target));
    }
    onChange('length', length);
  };
  const rows = [
    [
      'botLevel',
      [
        ['easy', t('easy')],
        ['medium', t('medium')],
        ['hard', t('hard')],
      ],
    ],
    ['powerups', onOff],
  ];

  return (
    <>
      <SettingRow label={t('length')}>
        <Segmented
          className="lengths"
          label={t('length')}
          options={lengths}
          value={values.length}
          disabled={disabled}
          onChange={pickLength}
        />
      </SettingRow>
      {values.length === 'custom' && (
        <SettingRow label={t('customTarget')}>
          <TargetField
            value={values.target}
            disabled={disabled}
            onChange={(n) => onChange('target', n)}
          />
        </SettingRow>
      )}
      <SettingRow label={t('winBy2')}>
        <Segmented
          label={t('winBy2')}
          options={onOff}
          value={values.winBy2}
          disabled={disabled}
          onChange={(val) => onChange('winBy2', val)}
        />
      </SettingRow>
      {rows.map(([key, options]) => (
        <SettingRow key={key} label={t(key)}>
          <Segmented
            label={t(key)}
            options={options}
            value={values[key]}
            disabled={disabled}
            onChange={(val) => onChange(key, val)}
          />
        </SettingRow>
      ))}
    </>
  );
}
