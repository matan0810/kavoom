// Online tab, inside a room: the code, who is here, the room's settings,
// and the host's buttons.

import { useState } from 'react';
import { MAX_PLAYERS, PALETTE } from '../../../shared/config.js';
import { useT } from '../../state/SettingsContext.jsx';
import { MatchSettings } from './MatchSettings.jsx';

function CopyLink({ code }) {
  const t = useT();
  const [state, setState] = useState('idle'); // idle | copied | manual
  const link = `${location.origin}${location.pathname}#${code}`;
  const copy = () => {
    try {
      navigator.clipboard.writeText(link).then(() => setState('copied'), () => setState('manual'));
    } catch {
      setState('manual');
    }
  };
  // No clipboard access: show the link so it can be copied by hand.
  if (state === 'manual') return <input className="field" dir="ltr" readOnly value={link} autoFocus onFocus={(e) => e.target.select()} />;
  return <button type="button" className="btn" onClick={copy}>{t(state === 'copied' ? 'copied' : 'copyLink')}</button>;
}

function Member({ member, room, online }) {
  const t = useT();
  const isYou = member.id === online.you;
  let tag = null;
  if (member.id === room.host) tag = <span className="tag">{t('host')}</span>;
  else if (!member.on) tag = <span className="tag">{t('away')}</span>;
  else if (member.bot && online.isHost && room.state === 'lobby') {
    tag = <button type="button" className="btn small" onClick={() => online.send({ t: 'removeBot', id: member.id })}>{t('remove')}</button>;
  } else if (member.bot) tag = <span className="tag">{t('modeBot')}</span>;
  return (
    <li className="member" style={{ '--c': PALETTE[member.color].hex }}>
      <span className="dot" />
      <span className="who">{member.name}{isYou ? ` (${t('you')})` : ''}</span>
      {tag}
    </li>
  );
}

export function RoomLobby({ online }) {
  const t = useT();
  const { room, isHost } = online;
  const inLobby = room.state === 'lobby';
  const count = room.members.length;

  return (
    <>
      <div className="room-head">
        <h2>{t('room', '')}<span className="room-code" dir="ltr">{room.code}</span></h2>
        <CopyLink code={room.code} />
      </div>

      <ul className="slots">
        {room.members.map((m) => <Member key={m.id} member={m} room={room} online={online} />)}
      </ul>

      <MatchSettings values={room.settings} disabled={!isHost || !inLobby} onChange={(key, val) => online.send({ t: 'set', key, val })} />

      {!inLobby && <p className="hint">{t('matchRunning')}</p>}
      {inLobby && !isHost && <p className="hint">{t('waitingHost')}</p>}
      {inLobby && isHost && count < 2 && <p className="hint">{t('needTwo')}</p>}

      <div className="room-actions">
        {inLobby && isHost && (
          <>
            <button type="button" className="btn primary" disabled={count < 2} onClick={() => online.send({ t: 'start' })}>{t('start')}</button>
            <button type="button" className="btn" disabled={count >= MAX_PLAYERS} onClick={() => online.send({ t: 'addBot' })}>{t('addBot')}</button>
          </>
        )}
        <button type="button" className="btn" onClick={() => online.leave()}>{t('leaveYes')}</button>
      </div>
    </>
  );
}
