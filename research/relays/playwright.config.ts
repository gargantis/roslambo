import { defineConfig } from '@playwright/test';

// C-22's relay rounds, outside the gate: they use public relays.
export default defineConfig({
  testDir: '.',
  testMatch: /rounds\.spec\.ts/,
  timeout: 240_000,
  workers: 1,
  reporter: [['list']],
  webServer: { command: 'npx vite preview', url: 'http://127.0.0.1:4318/', reuseExistingServer: false, timeout: 60_000, cwd: '../..' },
  use: { baseURL: 'http://127.0.0.1:4318/', headless: true },
});
