import tseslint from 'typescript-eslint';
import { baseConfig } from './vendor/hermet/eslint/base.mjs';
import exactOps from './vendor/hermet/eslint/exact-ops.mjs';

const local = {
  rules: { 'exact-ops': exactOps },
};

const CORE_BANNED = [
  'window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage',
  'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance', 'Date',
].map((name) => ({ name, message: 'src/core is pure: no DOM, timers, clocks or storage; the caller passes them in (PLAN §6).' }));

// PLAN §13 lint rules, on the shared base (vendor/hermet), which also keeps
// research/ out: the M0 spike has its own toolchain (D-26).
export default tseslint.config(
  ...baseConfig(),
  {
    // Only src/net/trystero.ts imports Trystero at runtime (D-13); types
    // may be imported anywhere.
    files: ['src/**/*.ts'],
    ignores: ['src/net/trystero.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@trystero-p2p/*'], allowTypeImports: true, message: 'Only src/net/trystero.ts imports Trystero (PLAN D-13).' }] },
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
    // The determinism allowlist (D-1) guards shipped simulation code; tests
    // may describe expectations with ordinary maths.
    files: ['src/core/sim/**/*.ts'],
    ignores: ['src/core/sim/**/*.test.ts'],
    plugins: { local },
    rules: { 'local/exact-ops': 'error' },
  },
);
