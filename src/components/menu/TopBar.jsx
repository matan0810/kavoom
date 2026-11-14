// The slim bar under the hero: play mode, version, sound and display, language.

import { VERSION } from '../../../shared/config.js';
import { useSettings } from '../../state/SettingsContext.jsx';
import { Segmented } from '../ui/Segmented.jsx';

export function TopBar({ onOpenSettings }) {
  const { settings, update, t } = useSettings();
  return (
    <nav className="bar">
      <Segmented
        className="tabs"
        label={t('tabLocal')}
        options={[
          ['local', t('tabLocal')],
          ['online', t('tabOnline')],
        ]}
        value={settings.tab}
        onChange={(tab) =>
          update((s) => {
            s.tab = tab;
          })
        }
      />
      <div className="bar-end">
        <span className="version" dir="ltr">
          v{VERSION}
        </span>
        <button type="button" className="btn" onClick={onOpenSettings}>
          {t('moreSettings')}
        </button>
        <Segmented
          label="Language"
          options={[
            ['he', 'עב'],
            ['en', 'EN'],
          ]}
          value={settings.lang}
          onChange={(lang) =>
            update((s) => {
              s.lang = lang;
            })
          }
        />
      </div>
    </nav>
  );
}
