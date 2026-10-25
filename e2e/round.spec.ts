// PLAN §14 end to end: a scripted round over the real Trystero transport
// and the local Nostr relay, one player per engine (the Chromium player
// proposes) and a Chromium spectator who joins mid-round. Every page must
// end frozen at the same tick with the same state and points.

import { expect, test } from '@playwright/test';
import { hashAt, launch, openNetPage, report, type NetReport } from './lib/browsers';
import { startNostrRelay } from './lib/nostr-relay.mjs';

test('three engines play a round to the freeze and agree', async ({ baseURL }) => {
  test.setTimeout(180_000);
  const relay = await startNostrRelay();
  const common = { room: `round-${Date.now()}`, relay: `ws://127.0.0.1:${relay.port}`, ante: 2, seed: 7 };
  const browsers = { chromium: await launch('chromium'), firefox: await launch('firefox'), webkit: await launch('webkit') };
  try {
    const pages = [
      await openNetPage(browsers.chromium, baseURL!, { ...common, k: 1, role: 'keeper', ready: 4000 }),
      await openNetPage(browsers.firefox, baseURL!, { ...common, k: 2, role: 'player', ready: 4000 }),
      await openNetPage(browsers.webkit, baseURL!, { ...common, k: 3, role: 'player', ready: 4000 }),
    ];
    await pages[0]!.page.waitForTimeout(15_000);
    pages.push(await openNetPage(browsers.chromium, baseURL!, { ...common, k: 9, role: 'spectator' }));

    const deadline = Date.now() + 120_000;
    let reports: NetReport[] = [];
    while (Date.now() < deadline) {
      reports = await Promise.all(pages.map((p) => report(p.page)));
      if (reports.every((r) => r.phase === 3)) break;
      await pages[0]!.page.waitForTimeout(1000);
    }
    for (const r of reports) {
      console.log(`${r.role} ${r.me.slice(-2)}: phase ${r.phase}, freeze ${r.freezeTick}, final ${r.finalTick}, peers ${r.peers}, points ${r.points.join(',')}, resyncs ${r.stats.resyncs}, disagree ${r.stats.disagree}, late ${r.stats.late}`);
    }
    for (const r of reports) expect(r.phase, `${r.role} ${r.me} froze`).toBe(3);
    expect(new Set(reports.map((r) => r.freezeTick)).size).toBe(1);
    expect(new Set(reports.map((r) => r.roster.join(','))).size).toBe(1);
    expect(new Set(reports.map((r) => r.points.join(','))).size).toBe(1);
    expect(reports[0]!.roster).toHaveLength(3);
    const tick = Math.min(...reports.map((r) => r.finalTick));
    const hashes = await Promise.all(pages.map((p) => hashAt(p.page, tick)));
    expect(new Set(hashes).size, `state at tick ${tick}`).toBe(1);
    for (const p of pages) expect(p.errors).toEqual([]);
  } finally {
    for (const b of Object.values(browsers)) await b.close();
    await relay.close();
  }
});
