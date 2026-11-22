// A small pill that slides down from the top when a newer version is live: one tap loads
// it, × hides it until the page is opened again.

import { useState } from 'react';
import { useSettings } from '../../state/SettingsContext.jsx';
import { useNewVersion } from '../../hooks/useNewVersion.js';

export function UpdateNotice() {
  const { t } = useSettings();
  const newer = useNewVersion();
  const [closed, setClosed] = useState(false);
  if (!newer || closed) return null;
  return (
    <div className="update" role="status">
      <span className="update-dot" aria-hidden="true" />
      <span>{t('updateReady')}</span>
      <button type="button" className="update-load" onClick={() => window.location.reload()}>
        {t('updateLoad')}
      </button>
      <button
        type="button"
        className="update-close"
        aria-label={t('close')}
        title={t('close')}
        onClick={() => setClosed(true)}
      >
        ×
      </button>
    </div>
  );
}
