// Match length, bot level and power-ups. Used on the "one device" tab with the
// saved settings, and in an online room with the room's settings (host only).

import { useT } from '../../state/SettingsContext.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { SettingRow } from '../ui/SettingRow.jsx';

export function MatchSettings({ values, onChange, disabled = false }) {
  const t = useT();
  const rows = [
    [
      'length',
      [
        ['short', t('short')],
        ['normal', t('normal')],
        ['long', t('long')],
      ],
    ],
    [
      'botLevel',
      [
        ['easy', t('easy')],
        ['medium', t('medium')],
        ['hard', t('hard')],
      ],
    ],
    [
      'powerups',
      [
        ['on', t('on')],
        ['off', t('off')],
      ],
    ],
  ];
  return rows.map(([key, options]) => (
    <SettingRow key={key} label={t(key)}>
      <Segmented
        label={t(key)}
        options={options}
        value={values[key]}
        disabled={disabled}
        onChange={(val) => onChange(key, val)}
      />
    </SettingRow>
  ));
}
