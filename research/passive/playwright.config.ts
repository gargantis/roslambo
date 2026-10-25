import { defineConfig } from '@playwright/test';

// The M5 passive-room probe, outside the gate: it drives the dev-only
// page dev/passive-probe.html on the Vite dev server.
//   npx playwright test -c research/passive/playwright.config.ts
export default defineConfig({
  testDir: '.',
  testMatch: /probe\.spec\.ts/,
  timeout: 10 * 60_000,
  workers: 1,
  reporter: [['list']],
  webServer: { command: 'npx vite --host 127.0.0.1 --port 4319 --strictPort', url: 'http://127.0.0.1:4319/dev/passive-probe.html', reuseExistingServer: false, timeout: 60_000, cwd: '../..' },
  use: { baseURL: 'http://127.0.0.1:4319/', headless: true },
});
