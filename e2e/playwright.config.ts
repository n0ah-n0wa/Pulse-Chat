import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiPort = process.env['E2E_API_PORT'] ?? '3100';
const webPort = process.env['E2E_WEB_PORT'] ?? '5174';
const webOrigin = `http://127.0.0.1:${webPort}`;
const apiOrigin = `http://127.0.0.1:${apiPort}`;

function envWith(overrides: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return { ...merged, ...overrides };
}

export default defineConfig({
  testDir: './src',
  fullyParallel: false,
  forbidOnly: process.env['CI'] !== undefined,
  retries: process.env['CI'] !== undefined ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: process.env['CI'] !== undefined ? [['github'], ['list']] : 'list',
  globalSetup: './global-setup.ts',
  use: {
    baseURL: webOrigin,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @pulse-chat/api start',
      cwd: repoRoot,
      url: `${apiOrigin}/health/liveness`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: envWith({
        NODE_ENV: 'development',
        PORT: apiPort,
        MONGODB_URI: 'mongodb://127.0.0.1:27017/pulse_chat_e2e',
        REDIS_URL: 'redis://127.0.0.1:6379/15',
        CORS_ORIGIN: webOrigin,
        FILE_STORAGE_PROVIDER: 'local',
        FILE_STORAGE_PATH: path.join(repoRoot, 'e2e', '.storage'),
        RATE_LIMIT_LOGIN: '1000',
        RATE_LIMIT_REGISTER: '1000',
        RATE_LIMIT_AUTH_WINDOW_SECONDS: '60',
        RATE_LIMIT_MESSAGES: '1000',
        RATE_LIMIT_MESSAGES_WINDOW_SECONDS: '60',
        RATE_LIMIT_SEARCH: '1000',
        RATE_LIMIT_SEARCH_WINDOW_SECONDS: '60',
        RATE_LIMIT_UPLOADS: '1000',
        RATE_LIMIT_UPLOADS_WINDOW_SECONDS: '60',
      }),
    },
    {
      command: `pnpm --filter @pulse-chat/web exec vite --host 127.0.0.1 --port ${webPort} --strictPort`,
      cwd: repoRoot,
      url: webOrigin,
      reuseExistingServer: false,
      timeout: 120_000,
      env: envWith({
        PULSE_API_ORIGIN: apiOrigin,
        VITE_WS_URL: apiOrigin,
      }),
    },
  ],
});
