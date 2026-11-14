// Vite turns src/ (React components) into plain files in dist/, which the
// Node server serves. `npm run dev` runs Vite's own dev server with instant
// reload and passes the online rooms through to the Node server on port 8080.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: { polyfill: false }, // the polyfill would need an inline script, which the CSP forbids
  },
  server: {
    proxy: { '/ws': { target: 'ws://localhost:8080', ws: true } },
  },
});
