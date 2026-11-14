// The menu: demo strip, top bar, and one of the two tabs.

import { useSettings } from '../../state/SettingsContext.jsx';
import { Hero } from './Hero.jsx';
import { TopBar } from './TopBar.jsx';
import { LocalPane } from './LocalPane.jsx';
import { OnlinePane } from './OnlinePane.jsx';

export function MenuScreen({ online, identity, onStartLocal, onOpenSettings }) {
  const { settings } = useSettings();
  return (
    <main className="screen menu">
      <Hero />
      <TopBar onOpenSettings={onOpenSettings} />
      {settings.tab === 'local'
        ? <LocalPane onStart={onStartLocal} />
        : <OnlinePane online={online} identity={identity} />}
    </main>
  );
}
