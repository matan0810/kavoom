// Entry point: puts the React app on the page.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { SettingsProvider } from './state/SettingsContext.jsx';
import { game } from './engine/index.js';
// The fonts ship with the game (no request to an outside host, and they work offline):
// only the Hebrew and Latin letters, in the weights the game uses.
import '@fontsource/heebo/hebrew-400.css';
import '@fontsource/heebo/latin-400.css';
import '@fontsource/heebo/hebrew-500.css';
import '@fontsource/heebo/latin-500.css';
import '@fontsource/heebo/hebrew-700.css';
import '@fontsource/heebo/latin-700.css';
import '@fontsource/secular-one/hebrew-400.css';
import '@fontsource/secular-one/latin-400.css';
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
// The content policy enforces Trusted Types, so the worker's address goes through a
// policy that accepts this one address and nothing else.
const trusted = window.trustedTypes?.createPolicy('kavoom', {
  createScriptURL: (address) => {
    if (address === '/sw.js') return address;
    throw new TypeError(`Not a script this game loads: ${address}`);
  },
});
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const worker = trusted ? trusted.createScriptURL('/sw.js') : '/sw.js';
    navigator.serviceWorker.register(worker).catch(() => {});
  });
}

// The free server sleeps when nobody is around. A page that opened from the
// saved copy pokes it now, so it is awake by the time someone taps "online".
fetch('/healthz').catch(() => {});

// Test hook for the browser smoke tests.
window.__kavoom = { game };
