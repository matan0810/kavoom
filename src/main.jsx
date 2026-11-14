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

// Test hook for the browser smoke tests.
window.__kavoom = { game };
