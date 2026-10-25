import { defineConfig } from '@playwright/test';

// Q-1: the frame-time bench in Chromium sized and slowed like a phone,
// outside the gate (it takes minutes and needs a quiet machine). A proxy
// only: the criteria are judged on the reference phone (docs/acceptance.md).
//   npx playwright test -c playwright.bench.config.ts
export default defineConfig({
  testDir: './e2e',
  testMatch: /phone-proxy\.spec\.ts/,
  timeout: 20 * 60_000,
  workers: 1,
  reporter: [['list']],
  webServer: { command: 'npx vite preview', url: 'http://127.0.0.1:4318/', reuseExistingServer: false, timeout: 60_000 },
  use: { baseURL: 'http://127.0.0.1:4318/', headless: true },
});
