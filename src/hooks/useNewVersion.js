// True once the live site runs a newer version than this page. Asked when the page opens
// and whenever it comes back into view; a failure (offline, the server asleep) says nothing.

import { useEffect, useState } from 'react';
import { isNewer, liveVersion } from '../state/update.js';

export function useNewVersion() {
  const [newer, setNewer] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD) return undefined;
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch('/version', { cache: 'no-store' });
        const live = response.ok ? liveVersion(await response.text()) : null;
        if (!stopped && isNewer(live, __APP_VERSION__)) setNewer(true);
      } catch {
        // Offline or asleep: try again the next time the page is shown.
      }
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return newer;
}
