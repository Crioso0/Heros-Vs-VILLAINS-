import { defineConfig } from 'vite';

// Relative base so the same bundle works from a file:// shell (Tauri / Capacitor)
// as well as from a web server.
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
