// Everything around the arena that is not the arena: the scoreboard and the
// buttons. A rail beside the arena on a big screen; on a small one a single
// strip with one menu button.

import { game } from '../../engine/index.js';
import { useT } from '../../state/SettingsContext.jsx';
import { Scoreboard } from './Scoreboard.jsx';

const MenuIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path
      d="M4 7h16M4 12h16M4 17h16"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
  </svg>
);

export function GameHud({ ui, compact, onMenu, onPause, onResume, onSettings, onQuit }) {
  const t = useT();
  const local = ui.mode === 'local';
  const pauseClick = () =>
    ui.paused ? onResume() : ui.state === 'roundEnd' ? game.startRound() : onPause();

  return (
    <aside className="side">
      <div className="side-head">
        <strong className="brand" dir="ltr">
          KAVOOM
        </strong>
        <span className="round-label">{t('round', ui.roundNo)}</span>
      </div>
      <Scoreboard players={ui.players} />
      <p className="hint target">{t('target', ui.target)}</p>
      <div className="side-actions">
        {compact ? (
          <button
            type="button"
            className="btn icon"
            aria-label={local ? t('pause') : t('gameMenu')}
            onClick={onMenu}
          >
            <MenuIcon />
          </button>
        ) : (
          <>
            {local && (
              <button type="button" className="btn" onClick={pauseClick}>
                {ui.paused ? t('resume') : t('pause')}
              </button>
            )}
            <button type="button" className="btn" onClick={onSettings}>
              {t('settings')}
            </button>
            <button type="button" className="btn" onClick={onQuit}>
              {local ? t('menu') : t('leave')}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
