// Vite turns src/ (React components) into plain files in dist/, which the
// Node server serves. `npm run dev` runs Vite's own dev server with instant
// reload and passes the online rooms through to the Node server on port 8080.

import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The version lives in package.json only (CLAUDE.md, section 1); the menu shows it.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: { polyfill: false }, // the polyfill would need an inline script, which the CSP forbids
  },
  server: {
    proxy: { '/ws': { target: 'ws://localhost:8080', ws: true } },
  },
});
