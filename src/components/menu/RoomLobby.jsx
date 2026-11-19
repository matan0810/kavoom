// Online tab, inside a room: the code, who is here, the room's settings,
// and the host's buttons.

import { useEffect, useState } from 'react';
import { MAX_PLAYERS, PALETTE } from '../../../shared/config.js';
import { useT } from '../../state/SettingsContext.jsx';
import { MatchSettings } from './MatchSettings.jsx';
import { ShareLink } from './ShareLink.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { SettingRow } from '../ui/SettingRow.jsx';

// A bot's name, which the host can change before the match. Sent when the
// field loses focus or Enter is pressed; an empty name goes back to the old one.
function BotName({ member, online }) {
  const t = useT();
  const [name, setName] = useState(member.name);
  useEffect(() => setName(member.name), [member.name]);
  const commit = () => {
    const clean = name.trim();
    if (!clean) return setName(member.name);
    if (clean !== member.name) online.send({ t: 'renameBot', id: member.id, name: clean });
  };
  return (
    <input
      className="who name-field"
      maxLength={10}
      value={name}
      aria-label={t('botName')}
      onChange={(e) => setName(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

function Member({ member, room, online }) {
  const t = useT();
  const isYou = member.id === online.you;
  const renamable = member.bot && online.isHost && room.state === 'lobby';
  let tag = null;
  if (member.id === room.host) tag = <span className="tag">{t('host')}</span>;
  else if (!member.on) tag = <span className="tag">{t('away')}</span>;
  else if (online.isHost && room.state === 'lobby') {
    // The host can clear a seat before the match: a bot, or a person.
    tag = (
      <button
        type="button"
        className="btn small"
        onClick={() => online.send({ t: member.bot ? 'removeBot' : 'kick', id: member.id })}
      >
        {t('remove')}
      </button>
    );
  } else if (member.bot) tag = <span className="tag">{t('modeBot')}</span>;
  return (
    <li className="member" style={{ '--c': PALETTE[member.color].hex }}>
      <span className="dot" />
      {renamable ? (
        <BotName member={member} online={online} />
      ) : (
        <span className="who">
          {member.name}
          {isYou ? ` (${t('you')})` : ''}
        </span>
      )}
      {tag}
    </li>
  );
}

// The one line under the settings that says what the room is waiting for.
function lobbyHint(t, room, isHost) {
  if (room.state !== 'lobby') return t('matchRunning');
  if (room.startsIn > 0) return t('startsIn', room.startsIn);
  if (room.public && room.members.length < 2) return t('lookingForPlayers');
  if (!isHost) return t('waitingHost');
  return room.members.length < 2 ? t('needTwo') : '';
}

export function RoomLobby({ online }) {
  const t = useT();
  const { room, isHost } = online;
  const inLobby = room.state === 'lobby';
  const count = room.members.length;

  return (
    <>
      <div className="room-head">
        <h2>
          {t('room', '')}
          <span className="room-code" dir="ltr">
            {room.code}
          </span>
        </h2>
        <ShareLink code={room.code} />
      </div>

      <ul className="slots">
        {room.members.map((m) => (
          <Member key={m.id} member={m} room={room} online={online} />
        ))}
      </ul>

      <MatchSettings
        values={room.settings}
        players={Math.max(2, count)}
        disabled={!isHost || !inLobby}
        onChange={(key, val) => online.send({ t: 'set', key, val })}
      />

      {!room.public && (
        <SettingRow label={t('roomDoor')}>
          <Segmented
            label={t('roomDoor')}
            options={[
              ['off', t('doorOpen')],
              ['on', t('doorLocked')],
            ]}
            value={room.settings.locked}
            disabled={!isHost || !inLobby}
            onChange={(val) => online.send({ t: 'set', key: 'locked', val })}
          />
        </SettingRow>
      )}

      <p className="hint" role="status">
        {lobbyHint(t, room, isHost)}
      </p>

      <div className="room-actions">
        {inLobby && isHost && (
          <>
            <button
              type="button"
              className="btn primary"
              disabled={count < 2}
              onClick={() => online.send({ t: 'start' })}
            >
              {t('start')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={count >= MAX_PLAYERS}
              onClick={() => online.send({ t: 'addBot' })}
            >
              {t('addBot')}
            </button>
          </>
        )}
        <button type="button" className="btn" onClick={() => online.leave()}>
          {t('leaveYes')}
        </button>
      </div>
    </>
  );
}
