// M0 run 4: 8 players and 4 spectators (the Q-3 cap) as 12 pages of one
// Chromium on one machine, over the local relay. Measures CPU per tick and
// message rates; all peers must agree. LOAD_SECONDS sets the length.

import { expect, test } from '@playwright/test';
import { disagreements, launch, openPeer, report, save, sharedCheckpoints, sleep, type Report } from './harness.ts';
import { startNostrRelay } from './nostr-relay.mjs';

const SECONDS = Number(process.env.LOAD_SECONDS ?? 90);

test('8 players and 4 spectators on one machine', async () => {
  test.setTimeout((SECONDS + 300) * 1000);
  const relay = await startNostrRelay();
  const common = { n: 8, room: `spike-load-${Date.now()}`, relay: `ws://127.0.0.1:${relay.port}` };
  const browser = await launch('chromium');
  const pages = [];
  for (let me = 0; me < 8; me++) {
    pages.push(await openPeer(browser, { ...common, me, ...(me === 0 ? { genesis: 1 } : {}) }));
    await sleep(500);
  }
  for (let s = 0; s < 4; s++) pages.push(await openPeer(browser, { ...common, me: -1 }));
  await sleep(SECONDS * 1000);
  const reports: Report[] = [];
  for (const p of pages) reports.push(await report(p));
  save('load', { seconds: SECONDS, reports });
  await browser.close();
  await relay.close();

  for (const r of reports) {
    console.log(`me ${r.me}: final ${r.finalTick}, peers ${r.peers}, disagree ${r.disagree}, resyncs ${r.resyncs}, late ${r.late}, out ${(r.net.sent / SECONDS).toFixed(0)}/s, in ${(r.net.recv / SECONDS).toFixed(0)}/s, cpu mean ${r.cpu.mean.toFixed(3)} p95 ${r.cpu.p95.toFixed(3)} max ${r.cpu.max.toFixed(1)} ms`);
  }
  const joined = reports.filter((r) => r.finalTick > 0);
  expect(joined.length).toBe(12);
  const ticks = sharedCheckpoints(joined, 2000);
  expect(ticks.length).toBeGreaterThan(0);
  expect(disagreements(joined, ticks)).toEqual([]);
});
