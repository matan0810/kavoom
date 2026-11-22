// The menu: demo strip, top bar, and one of the two tabs.

import { useSettings } from '../../state/SettingsContext.jsx';
import { Hero } from './Hero.jsx';
import { TopBar } from './TopBar.jsx';
import { UpdateNotice } from './UpdateNotice.jsx';
import { LocalPane } from './LocalPane.jsx';
import { OnlinePane } from './OnlinePane.jsx';

export function MenuScreen({ online, identity, stats, onStartLocal, onOpenSettings, onOpenRules }) {
  const { settings, t } = useSettings();
  return (
    <main className="screen menu">
      <Hero />
      <TopBar onOpenSettings={onOpenSettings} onOpenRules={onOpenRules} />
      <UpdateNotice />
      {settings.tab === 'local' ? (
        <LocalPane onStart={onStartLocal} />
      ) : (
        <OnlinePane online={online} identity={identity} />
      )}
      {stats.matches > 0 && (
        <p className="hint record">{t('record', stats.wins, stats.matches, stats.best)}</p>
      )}
    </main>
  );
}
