import { defineConfig } from 'vitest/config';

// Re-records the look book's rounds (record.ts, REPORT.md); never part of the gate.
export default defineConfig({
  test: { include: ['research/appearance/record.ts'], environment: 'node' },
});
