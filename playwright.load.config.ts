import { defineConfig } from '@playwright/test';

// PLAN M3: the 12-peer load run, outside the gate (it needs a quiet
// machine and takes minutes): npx playwright test -c playwright.load.config.ts
export default defineConfig({
  testDir: './e2e',
  testMatch: /load\.spec\.ts/,
  timeout: 10 * 60_000,
  workers: 1,
  reporter: [['list']],
  webServer: { command: 'npx vite preview', url: 'http://127.0.0.1:4318/', reuseExistingServer: false, timeout: 60_000 },
  use: { baseURL: 'http://127.0.0.1:4318/', headless: true },
});
