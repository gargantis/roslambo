import { defineConfig } from '@playwright/test';

// §14 end to end, in all three engines, against the built dist/ (the gate
// runs `npm run build` first). Networking specs from M3 use the local
// Nostr relay in e2e/lib, so the gate contacts nothing public.
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
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
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
