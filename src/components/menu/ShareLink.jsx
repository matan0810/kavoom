// Invites friends to the room. On a phone this opens the system share sheet
// (WhatsApp, Messages...). Where the browser has no share sheet, the link is
// copied, and where it cannot even be copied, it is shown to copy by hand.

import { useState } from 'react';
import { useT } from '../../state/SettingsContext.jsx';

export function ShareLink({ code }) {
  const t = useT();
  const [state, setState] = useState('idle'); // idle | copied | manual
  const link = `${location.origin}${location.pathname}#${code}`;
  const canShare = typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setState('copied');
    } catch {
      setState('manual');
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: 'KAVOOM', text: t('shareText', code), url: link });
    } catch (e) {
      // Closing the share sheet is not a failure; anything else falls back to copying.
      if (e.name !== 'AbortError') await copy();
    }
  };

  if (state === 'manual') {
    return (
      <input
        className="field"
        dir="ltr"
        readOnly
        value={link}
        autoFocus
        onFocus={(e) => e.target.select()}
      />
    );
  }
  const label = state === 'copied' ? 'copied' : canShare ? 'share' : 'copyLink';
  return (
    <button type="button" className="btn primary" onClick={canShare ? share : copy}>
      {t(label)}
    </button>
  );
}
