import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative paths so Capacitor/Tauri can serve dist/
  build: { target: 'es2022' },
  server: { host: true },
});
