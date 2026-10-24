import { defineConfig } from 'vite';

// §13: relative URLs, no source maps, and npm licence JSON for
// scripts/licenses.mjs, which turns it into THIRD-PARTY-LICENSES.txt.
// Only index.html is built; dev/ pages are served by `npm run dev` alone.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
    license: { fileName: '.license-npm.json' },
  },
  preview: { host: '127.0.0.1', port: 4318, strictPort: true },
});
