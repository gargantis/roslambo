import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: false },
  preview: { host: '127.0.0.1', port: 4317, strictPort: true },
});
