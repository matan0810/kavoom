// The "online" tab: your name and colour on one side, the room on the other.

import { useSettings } from '../../state/SettingsContext.jsx';
import { Swatches } from '../ui/Swatches.jsx';
import { JoinForm } from './JoinForm.jsx';
import { RoomLobby } from './RoomLobby.jsx';

export function OnlinePane({ online, identity }) {
  const { settings, update, t } = useSettings();
  const { room } = online;
  const me = room ? room.members.find((m) => m.id === online.you) : null;
  const taken = new Set(
    room ? room.members.filter((m) => m.id !== online.you).map((m) => m.color) : [],
  );

  return (
    <div className="menu-grid online">
      <section className="block">
        <h2>{t('you')}</h2>
        <input
          className="field"
          maxLength={10}
          autoComplete="off"
          placeholder={t('yourName')}
          aria-label={t('yourName')}
          value={settings.online.name}
          onChange={(e) =>
            update((s) => {
              s.online.name = e.target.value.slice(0, 10);
            })
          }
          onBlur={() => room && online.send({ t: 'name', name: identity.name })}
        />
        <Swatches
          value={me ? me.color : settings.online.color}
          taken={taken}
          onPick={(color) => {
            update((s) => {
              s.online.color = color;
            });
            if (room) online.send({ t: 'color', color });
          }}
        />
        <p className="hint">{t('onlineKeys')}</p>
      </section>

      <section className="block">
        {room ? <RoomLobby online={online} /> : <JoinForm online={online} />}
        <p className="hint" role="status">
          {online.status ? t(online.status) : ''}
        </p>
      </section>
    </div>
  );
}
