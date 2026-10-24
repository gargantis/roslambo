import { defineConfig } from '@playwright/test';

// M0 runs 1, 2, 4 and 5 (PLAN §15). The mesh specs launch their own
// browsers, one per engine; the golden spec runs once per engine project.
export default defineConfig({
  testDir: './e2e',
  timeout: 10 * 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  webServer: {
    command: 'npx vite build && npx vite preview',
    url: 'http://127.0.0.1:4317/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: { baseURL: 'http://127.0.0.1:4317/', headless: true },
  projects: [
    { name: 'golden-chromium', testMatch: /golden\.spec\.ts/, use: { browserName: 'chromium' } },
    { name: 'golden-firefox', testMatch: /golden\.spec\.ts/, use: { browserName: 'firefox' } },
    { name: 'golden-webkit', testMatch: /golden\.spec\.ts/, use: { browserName: 'webkit' } },
    { name: 'mesh', testMatch: /(mesh|load|flood)\.spec\.ts/ },
  ],
});
