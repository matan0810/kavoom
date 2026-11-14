// Entry point: puts the React app on the page.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { SettingsProvider } from './state/SettingsContext.jsx';
import { game } from './engine/index.js';
import './styles/base.css';
import './styles/menu.css';
import './styles/game.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </StrictMode>,
);

// Install the service worker (public/sw.js) that keeps the game on the device.
// Only in the built site: during development it would serve stale files.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// The free server sleeps when nobody is around. A page that opened from the
// saved copy pokes it now, so it is awake by the time someone taps "online".
fetch('/healthz').catch(() => {});

// Test hook for the browser smoke tests.
window.__kavoom = { game };
