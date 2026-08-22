import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Set by docker-compose.yml. In a container the dev server has to listen on
// every interface to be reachable, and file change events do not cross the bind
// mount from the host, so the watcher polls instead.
const inContainer = process.env['PULSE_DEV_CONTAINER'] === 'true';

const apiOrigin = process.env['PULSE_API_ORIGIN'] ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: inContainer ? '0.0.0.0' : '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: inContainer ? { usePolling: true, interval: 400 } : undefined,
    // When Vite runs without the nginx dev proxy, forward API and Socket.IO to
    // the backend so relative /api and /socket.io URLs keep working.
    proxy: inContainer
      ? undefined
      : {
          '/api': { target: apiOrigin, changeOrigin: true },
          '/socket.io': { target: apiOrigin, ws: true, changeOrigin: true },
        },
  },
  build: {
    outDir: 'dist',
    // Production source maps would ship the entire frontend source through
    // Nginx. Turn this on again (preferably as 'hidden') once an error tracker
    // consumes the maps instead of the browser.
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
});
