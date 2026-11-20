// The game screen: scoreboard, arena, touch buttons and the dialogs over them.
// The match itself runs in engine/game.js; this component shows it and turns
// buttons, keys and the Back button into calls on the engine.

import { useEffect, useState } from 'react';
import { game } from '../../engine/index.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { useWakeLock } from '../../hooks/useWakeLock.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { useSettings } from '../../state/SettingsContext.jsx';
import { GameHud } from './GameHud.jsx';
import { Arena } from './Arena.jsx';
import { TouchPads } from './TouchPads.jsx';
import { GameDialogs } from './GameDialogs.jsx';

export function GameScreen({ ui, online }) {
  const { settings } = useSettings();
  const [dialog, setDialog] = useState(null); // null | 'pause' | 'quit' | 'settings' | 'rules'
  const [beforeSide, setBeforeSide] = useState(null); // what to return to when settings or rules close
  const local = ui.mode === 'local';

  const coarse = useMediaQuery('(pointer: coarse)');
  const small = useMediaQuery('(max-width: 820px), (max-height: 520px)');
  const padsWanted = settings.pads === 'on' || (settings.pads === 'auto' && coarse);
  const padOwners = padsWanted ? ui.padOwners : [];
  const compact = small || padOwners.length > 0;

  // ---------- Actions ----------

  const pause = () => {
    game.pause();
    setDialog('pause');
  };
  const resume = () => {
    game.resume();
    setDialog(null);
  };
  // Leaving a match in progress always asks first.
  const askQuit = () => {
    game.pause(); // does nothing online: the server keeps running
    setDialog('quit');
  };
  const leave = () => (local ? game.stop() : online.leave());
  const openMenu = () => (local ? pause() : askQuit());
  // Settings and rules open over whatever was showing, and go back to it on close.
  const openSide = (kind) => {
    setBeforeSide({ dialog, wasPaused: game.paused });
    game.pause();
    setDialog(kind);
  };
  const closeSide = () => {
    if (!beforeSide.dialog && !beforeSide.wasPaused) game.resume();
    setDialog(beforeSide.dialog);
  };
  const openSettings = () => openSide('settings');
  const side = dialog === 'settings' || dialog === 'rules';

  // ---------- Back button, keys, tab switching ----------

  // Back never throws the match away: it opens the game menu. (An open dialog
  // sits above this layer and takes Back first.)
  useBackLayer(true, () => ui.state !== 'matchEnd' && openMenu(), {
    sticky: true,
    level: 'game',
  });

  useEffect(() => {
    const onKey = (e) => {
      const typing = e.target instanceof HTMLInputElement;
      if (e.code === 'Space' && !typing) {
        e.preventDefault();
        if (e.repeat || !local || side) return;
        if (game.paused) resume();
        else if (game.state === 'roundEnd') game.startRound();
        else if (game.state === 'matchEnd') game.rematch();
        else pause();
      } else if (e.code === 'Escape') {
        if (!dialog && game.state !== 'matchEnd') openMenu();
      } else if (game.isSteeringKey(e.code)) {
        e.preventDefault(); // keep arrows and other bound keys from scrolling the page
      }
    };
    const onHide = () => {
      if (document.hidden && !dialog && game.canPause()) pause();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHide);
    };
  });

  // A pause or quit dialog has no business staying open once the match is over.
  useEffect(() => {
    if (ui.state === 'matchEnd') setDialog((d) => (d === 'settings' || d === 'rules' ? d : null));
  }, [ui.state]);

  useWakeLock();

  const classes = [
    'screen',
    'game',
    compact && 'compact',
    padOwners.length > 0 && 'touch',
    padOwners.length === 1 && 'solo',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={classes}>
      <GameHud
        ui={ui}
        compact={compact}
        onMenu={openMenu}
        onPause={pause}
        onResume={resume}
        onSettings={openSettings}
        onQuit={askQuit}
      />
      <Arena ui={ui} touchHint={coarse} />
      {padOwners.length > 0 && <TouchPads owners={padOwners} players={ui.players} />}
      <GameDialogs
        ui={ui}
        dialog={dialog}
        online={online}
        showKeysHint={!coarse}
        withSettings={compact}
        onResume={resume}
        onSettings={openSettings}
        onRules={() => openSide('rules')}
        onCloseSide={closeSide}
        onLeave={leave}
      />
    </section>
  );
}
