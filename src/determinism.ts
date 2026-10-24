// The production bundle's determinism check (PLAN §14): opened as
// #test=determinism by e2e/determinism.spec.ts in every engine, it replays
// the golden suite and exposes the hashes for comparison with goldens.json.

import { canaryHash, goldenSuite } from './core/sim/golden';

declare global {
  interface Window {
    roslamboDeterminism?: { ms: number; canary: string; runs: ReturnType<typeof goldenSuite> };
  }
}

export function run(): void {
  const t0 = performance.now();
  const runs = goldenSuite();
  window.roslamboDeterminism = { ms: performance.now() - t0, canary: canaryHash(), runs };
}
