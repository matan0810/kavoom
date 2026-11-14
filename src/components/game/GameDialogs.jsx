// The dialogs that can cover the game: pause, quit or leave, settings, match end.
// GameScreen decides which one (if any) is open.

import { game } from '../../engine/index.js';
import { useT } from '../../state/SettingsContext.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { SettingsDialog } from '../SettingsDialog.jsx';
import { Scoreboard } from './Scoreboard.jsx';

function MatchEnd({ ui, online }) {
  const t = useT();
  const local = ui.mode === 'local';
  const hostCanStart = !local && online.isHost;
  const toMenu = () => game.stop(); // online this lands back in the room
  let actions;
  if (local)
    actions = [
      { label: t('rematch'), onClick: () => game.rematch(), primary: true },
      { label: t('mainMenu'), onClick: toMenu },
    ];
  else if (hostCanStart)
    actions = [
      { label: t('rematch'), onClick: () => online.send({ t: 'start' }), primary: true },
      { label: t('backToRoom'), onClick: toMenu },
    ];
  else actions = [{ label: t('backToRoom'), onClick: toMenu, primary: true }];
  const text =
    t('afterRounds', ui.result.rounds) +
    (!local && !hostCanStart ? `. ${t('hostCanRematch')}` : '');
  return (
    <Dialog
      title={t('wonMatch', ui.players[ui.result.champion].name)}
      text={text}
      actions={actions}
      onClose={toMenu}
      escCloses={false}
    >
      <Scoreboard players={ui.players} />
    </Dialog>
  );
}

export function GameDialogs({
  ui,
  dialog,
  online,
  showKeysHint,
  withSettings,
  onResume,
  onSettings,
  onCloseSettings,
  onLeave,
}) {
  const t = useT();
  const local = ui.mode === 'local';
  const settingsAction = { label: t('moreSettings'), onClick: onSettings };

  if (dialog === 'settings') return <SettingsDialog onClose={onCloseSettings} />;
  if (ui.state === 'matchEnd') return <MatchEnd ui={ui} online={online} />;

  if (dialog === 'pause') {
    return (
      <Dialog
        title={t('paused')}
        text={showKeysHint ? t('pausedText') : undefined}
        onClose={onResume}
        actions={[
          { label: t('resume'), onClick: onResume, primary: true },
          settingsAction,
          { label: t('mainMenu'), onClick: onLeave },
        ]}
      />
    );
  }

  if (dialog === 'quit') {
    return (
      <Dialog
        title={t(local ? 'quitTitle' : 'leaveTitle')}
        text={t(local ? 'quitText' : 'leaveText')}
        onClose={onResume}
        actions={[
          { label: t('keepPlaying'), onClick: onResume, primary: true },
          ...(withSettings ? [settingsAction] : []),
          { label: t(local ? 'quitYes' : 'leaveYes'), onClick: onLeave },
        ]}
      />
    );
  }
  return null;
}
