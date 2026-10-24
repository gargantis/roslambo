import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import exactOps from './scripts/eslint/exact-ops.mjs';

const local = {
  rules: { 'exact-ops': exactOps },
};

const NODE_GLOBALS = Object.fromEntries(
  [
    'process', 'console', 'Buffer', 'URL', 'URLSearchParams', 'TextEncoder',
    'TextDecoder', 'fetch', 'crypto', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'queueMicrotask', 'structuredClone',
    'AbortController', 'WebSocket', 'performance',
  ].map((n) => [n, 'readonly']),
);

const CORE_BANNED = [
  'window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage',
  'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance', 'Date',
].map((name) => ({ name, message: 'src/core is pure: no DOM, timers, clocks or storage; the caller passes them in (PLAN §6).' }));

// PLAN §13 lint rules.
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'research/**', // the M0 spike has its own toolchain (D-26)
      'test-results/**',
      'playwright-report/**',
      '.wrangler/**',
      'scripts/eslint/fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: ['**/*.ts'] })),
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**', 'e2e/**', '*.config.ts', '*.config.mjs'],
    languageOptions: { globals: NODE_GLOBALS },
  },
  {
    // Only src/net/trystero.ts imports Trystero (D-13).
    files: ['src/**/*.ts'],
    ignores: ['src/net/trystero.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@trystero-p2p/*'], message: 'Only src/net/trystero.ts imports Trystero (PLAN D-13).' }] },
      ],
    },
  },
  {
    // Only src/storage touches browser storage (D-18).
    files: ['src/**/*.ts'],
    ignores: ['src/storage/**', 'src/core/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'Only src/storage touches localStorage (PLAN D-18).' },
        { name: 'sessionStorage', message: 'Only src/storage touches storage (PLAN D-18).' },
        { name: 'indexedDB', message: 'Only src/storage touches storage (PLAN D-18).' },
      ],
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: { 'no-restricted-globals': ['error', ...CORE_BANNED] },
  },
  {
    // The determinism allowlist guards shipped simulation code; tests may
    // describe expectations with ordinary maths.
    files: ['src/core/sim/**/*.ts'],
    ignores: ['src/core/sim/**/*.test.ts'],
    plugins: { local },
    rules: { 'local/exact-ops': 'error' },
  },
);
