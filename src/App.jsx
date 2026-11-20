// The top of the page. Decides which screen shows (menu or game), owns the
// online room connection, and passes saved settings on to the engine.

import { useEffect, useMemo, useState } from 'react';
import { PALETTE, leadFor, matchTarget } from '../shared/config.js';
import { game, haptics, sfx } from './engine/index.js';
import { useBackLayer } from './hooks/useBackLayer.js';
import { useGameUi } from './hooks/useGameUi.js';
import { useOnlineRoom } from './hooks/useOnlineRoom.js';
import { useStats } from './hooks/useStats.js';
import { useSettings } from './state/SettingsContext.jsx';
import { MenuScreen } from './components/menu/MenuScreen.jsx';
import { GameScreen } from './components/game/GameScreen.jsx';
import { SettingsDialog } from './components/SettingsDialog.jsx';
import { RulesDialog } from './components/RulesDialog.jsx';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function App() {
  const { settings, t, colorName } = useSettings();
  const ui = useGameUi();
  const stats = useStats();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const inGame = ui.state !== 'idle';

  // Who this player is online.
  const onlineName = settings.online.name.trim() || t('player');
  const onlineColor = settings.online.color;
  const identity = useMemo(
    () => ({ name: onlineName, color: onlineColor }),
    [onlineName, onlineColor],
  );
  const online = useOnlineRoom(identity);

  // The menu's settings dialog does not follow the player into a match.
  useEffect(() => {
    if (inGame) {
      setSettingsOpen(false);
      setRulesOpen(false);
    }
  }, [inGame]);

  // Back in a room's lobby leaves the room, like the Leave button.
  useBackLayer(!!online.room, () => online.leave(), { level: 'room' });

  // Saved settings that the engine needs to know about.
  useEffect(() => {
    sfx.enabled = settings.sound === 'on';
    sfx.volume = settings.volume;
    game.renderer.calm = reducedMotion || settings.shake === 'off';
    haptics.enabled = settings.shake === 'on';
  }, [settings.sound, settings.volume, settings.shake]);

  const startLocal = () => {
    const players = settings.players.filter((p) => p.mode !== 'off');
    game.startLocal({
      players: players.map((p) => ({
        name: p.name.trim() || colorName(p.color),
        color: PALETTE[p.color].hex,
        human: p.mode === 'human',
        keys: p.keys,
      })),
      botLevel: settings.botLevel,
      powerups: settings.powerups === 'on',
      target: matchTarget(settings.length, players.length, settings.target),
      lead: leadFor(settings.winBy2),
    });
  };

  if (inGame) return <GameScreen ui={ui} online={online} />;
  return (
    <>
      <MenuScreen
        online={online}
        identity={identity}
        stats={stats}
        onStartLocal={startLocal}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenRules={() => setRulesOpen(true)}
      />
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {rulesOpen && <RulesDialog onClose={() => setRulesOpen(false)} />}
    </>
  );
}
