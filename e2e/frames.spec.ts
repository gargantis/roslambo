// The frame-time bench (Q-1) runs in every engine: eight planets, seven of
// them virtual players on the page. The gate runs it briefly and checks it
// works; the timing criteria are judged on the reference phone
// (docs/acceptance.md), not on a loaded CI machine.

import { expect, test } from '@playwright/test';
import type { FrameReport } from '../src/frames';

test('the frame-time bench plays eight planets and reports', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('./#test=frames&seconds=4');
  await page.waitForFunction(() => window.roslamboFrames?.report()?.done === true, null, { timeout: 60_000 });
  const r = await page.evaluate(() => window.roslamboFrames!.report()) as FrameReport;
  console.log(`frames ${r.frames}, interval p95 ${r.interval.p95.toFixed(1)} max ${r.interval.max.toFixed(1)} ms, tick mean ${r.tick.mean.toFixed(2)} ms`);
  expect(r.frames).toBeGreaterThan(30);
  await expect(page.locator('[data-test=players] li')).toHaveCount(8);
  expect(errors).toEqual([]);
});
