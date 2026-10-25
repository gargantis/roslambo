// Q-1 proxy (outside the gate, playwright.bench.config.ts): the frame-time
// bench at the Pixel 8a's CSS size and pixel ratio, with the CPU slowed by
// DevTools throttling. Each run logs a JSON line for docs/acceptance.md.
// ROSLAMBO_BENCH_SECONDS sets the length (default 120, the Q-1 round).

import { chromium, test } from '@playwright/test';
import type { FrameReport } from '../src/frames';

const SECONDS = Number(process.env['ROSLAMBO_BENCH_SECONDS'] ?? '120');

for (const rate of [1, 4, 6]) {
  test(`frame-time bench, CPU slowed ${rate}×`, async ({ baseURL }) => {
    const browser = await chromium.launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      await page.goto(`${baseURL}#test=frames&seconds=${SECONDS}`);
      await page.waitForFunction(() => window.roslamboFrames?.report()?.done === true, null, { timeout: (SECONDS + 120) * 1000, polling: 1000 });
      const r = await page.evaluate(() => window.roslamboFrames!.report()) as FrameReport;
      console.log(JSON.stringify({ rate, seconds: r.seconds, frames: r.frames, pass: r.pass, interval: r.interval, work: r.work, tick: r.tick }));
    } finally {
      await browser.close();
    }
  });
}
