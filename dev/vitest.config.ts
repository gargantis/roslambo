import { defineConfig } from 'vitest/config';

// Tuning metrics only (dev/tune.metrics.ts); never part of the gate.
export default defineConfig({
  test: { include: ['dev/**/*.metrics.ts'], environment: 'node' },
});
