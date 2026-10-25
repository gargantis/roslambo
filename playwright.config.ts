import { defineConfig } from '@playwright/test';

// §14 end to end, in all three engines, against the built dist/ (the gate
// runs `npm run build` first). Networking specs from M3 use the local
// Nostr relay in e2e/lib, so the gate contacts nothing public.
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  testIgnore: /load\.spec\.ts/, // the 12-peer load run: playwright.load.config.ts
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  webServer: {
    command: 'npx vite preview',
    url: 'http://127.0.0.1:4318/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  use: { baseURL: 'http://127.0.0.1:4318/', headless: true },
  projects: [
    { name: 'chromium', testMatch: /(smoke|determinism|frames|touch)\.spec\.ts/, use: { browserName: 'chromium' } },
    { name: 'firefox', testMatch: /(smoke|determinism|frames)\.spec\.ts/, use: { browserName: 'firefox' } },
    { name: 'webkit', testMatch: /(smoke|determinism|frames)\.spec\.ts/, use: { browserName: 'webkit' } },
    // These launch one browser per engine themselves.
    { name: 'net', testMatch: /(round|play)\.spec\.ts/ },
  ],
});
