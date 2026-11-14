// Sound and display settings. Opened from the menu and from inside a game.

import { sfx } from '../engine/index.js';
import { useSettings } from '../state/SettingsContext.jsx';
import { Dialog } from './ui/Dialog.jsx';
import { Segmented } from './ui/Segmented.jsx';
import { SettingRow } from './ui/SettingRow.jsx';

function toggleFullscreen() {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  } catch { /* optional */ }
}

export function SettingsDialog({ onClose }) {
  const { settings, update, t } = useSettings();
  const onOff = [['on', t('on')], ['off', t('off')]];
  const set = (key) => (val) => update((s) => { s[key] = val; });

  return (
    <Dialog title={t('moreSettings')} onClose={onClose} actions={[{ label: t('close'), onClick: onClose, primary: true }]}>
      <div className="dialog-rows">
        <SettingRow label={t('sound')}>
          <Segmented label={t('sound')} options={onOff} value={settings.sound} onChange={set('sound')} />
        </SettingRow>
        <SettingRow label={t('volume')}>
          <input
            type="range"
            min="0"
            max="100"
            aria-label={t('volume')}
            value={Math.round(settings.volume * 100)}
            onChange={(e) => {
              const volume = Number(e.target.value) / 100;
              sfx.volume = volume;
              update((s) => { s.volume = volume; });
            }}
            onPointerUp={() => sfx.pickup()}
            onKeyUp={() => sfx.pickup()}
          />
        </SettingRow>
        <SettingRow label={t('shake')}>
          <Segmented label={t('shake')} options={onOff} value={settings.shake} onChange={set('shake')} />
        </SettingRow>
        <SettingRow label={t('pads')}>
          <Segmented label={t('pads')} options={[['auto', t('auto')], ...onOff]} value={settings.pads} onChange={set('pads')} />
        </SettingRow>
        {document.fullscreenEnabled && (
          <button type="button" className="btn" onClick={toggleFullscreen}>{t('fullscreen')}</button>
        )}
      </div>
    </Dialog>
  );
}
