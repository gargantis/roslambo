// PLAN §14, REQUIREMENTS "Quality": the same inputs give bit-identical
// states in Chromium, Firefox and WebKit. The production bundle replays the
// golden suite; every hash must equal src/core/sim/goldens.json, which the
// unit suite checks in Node on x64 and arm64.

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

interface Run { name: string; checkpoints: string[]; final: string; phase: number; freezeTick: number; planets: number }
const goldens = JSON.parse(readFileSync(new URL('../src/core/sim/goldens.json', import.meta.url), 'utf8')) as { canary: string; runs: Run[] };

test('the production bundle reproduces every golden, checkpoint by checkpoint', async ({ page }) => {
  await page.goto('./#test=determinism');
  await expect(page.locator('html')).toHaveAttribute('data-canary', 'ok');
  const handle = await page.waitForFunction(() => window.roslamboDeterminism, null, { timeout: 120_000 });
  const got = (await handle.jsonValue()) as { ms: number; canary: string; runs: Run[] };
  expect(got.canary).toBe(goldens.canary);
  expect(got.runs.map((r) => r.name)).toEqual(goldens.runs.map((r) => r.name));
  for (let i = 0; i < goldens.runs.length; i++) {
    const want = goldens.runs[i]!;
    const first = want.checkpoints.findIndex((h, k) => h !== got.runs[i]!.checkpoints[k]);
    expect(first, `${want.name}: first differing checkpoint`).toBe(-1);
    expect(got.runs[i]).toEqual(want);
  }
});
