// A quiet line in the menu when a newer version is live; one tap loads it.

import { useSettings } from '../../state/SettingsContext.jsx';
import { useNewVersion } from '../../hooks/useNewVersion.js';

export function UpdateNotice() {
  const { t } = useSettings();
  if (!useNewVersion()) return null;
  return (
    <p className="update" role="status">
      <span>{t('updateReady')}</span>
      <button type="button" className="btn" onClick={() => window.location.reload()}>
        {t('updateLoad')}
      </button>
    </p>
  );
}
