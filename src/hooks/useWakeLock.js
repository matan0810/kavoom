// Keeps the screen from dimming while the component is mounted, where the
// browser allows it. The browser drops the lock whenever the tab is hidden,
// so it is asked for again each time the tab comes back.

import { useEffect } from 'react';

export function useWakeLock() {
  useEffect(() => {
    let lock = null;
    let mounted = true;
    const request = async () => {
      if (document.hidden || !navigator.wakeLock) return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (mounted) lock = next;
        else next.release().catch(() => {});
      } catch { /* refused (low battery, no permission): the game works without it */ }
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', request);
      if (lock) lock.release().catch(() => {});
    };
  }, []);
}
