// Online tab, before joining: create a room, or type a four letter code.

import { useState } from 'react';
import { LINKED_ROOM } from '../../state/settings.js';
import { useT } from '../../state/SettingsContext.jsx';

export function JoinForm({ online }) {
  const t = useT();
  const [code, setCode] = useState(LINKED_ROOM);
  const canJoin = code.length === 4 && !online.busy;
  const join = () => canJoin && online.connect({ t: 'join', code });

  return (
    <>
      <h2>{t('tabOnline')}</h2>
      <button type="button" className="btn primary big" disabled={online.busy} onClick={() => online.connect({ t: 'create' })}>
        {t('createRoom')}
      </button>
      <div className="join-row">
        <input
          className="field code"
          maxLength={4}
          autoComplete="off"
          autoCapitalize="characters"
          placeholder={t('roomCode')}
          aria-label={t('roomCode')}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && join()}
        />
        <button type="button" className="btn" disabled={!canJoin} onClick={join}>{t('joinRoom')}</button>
      </div>
    </>
  );
}
