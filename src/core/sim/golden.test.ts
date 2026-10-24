import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canaryHash, goldenSuite } from './golden';
import { CODEC_VERSION } from './codec';

// PLAN §14 determinism: the scripted rounds hash identically forever, or
// until the goldens are re-emitted on purpose:
//   ROSLAMBO_EMIT_GOLDENS=1 npx vitest run src/core/sim/golden.test.ts
// The same file is checked in Chromium, Firefox and WebKit by
// e2e/determinism.spec.ts, and its canary is compiled into the build (D-17).
const file = fileURLToPath(new URL('./goldens.json', import.meta.url));

describe('goldens', () => {
  const runs = goldenSuite();
  const canary = canaryHash();

  if (process.env.ROSLAMBO_EMIT_GOLDENS === '1') {
    it('emits goldens.json', () => {
      writeFileSync(file, JSON.stringify({ codec: CODEC_VERSION, canary, runs }, null, 1) + '\n');
    });
    return;
  }

  it('matches every scripted round, checkpoint by checkpoint', () => {
    expect(existsSync(file), 'goldens.json is missing: emit it').toBe(true);
    const want = JSON.parse(readFileSync(file, 'utf8')) as { codec: number; canary: string; runs: typeof runs };
    expect(want.codec).toBe(CODEC_VERSION);
    expect(runs.map((r) => r.name)).toEqual(want.runs.map((r) => r.name));
    for (let i = 0; i < runs.length; i++) {
      const first = runs[i]!.checkpoints.findIndex((h, k) => h !== want.runs[i]!.checkpoints[k]);
      expect(first, `${runs[i]!.name}: first differing checkpoint`).toBe(-1);
      expect(runs[i]).toEqual(want.runs[i]);
    }
    expect(canary).toBe(want.canary);
  });
});
