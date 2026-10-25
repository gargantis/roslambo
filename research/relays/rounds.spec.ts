// C-22: the deciding check for a relay. A three-engine round of the
// production bundle's #test=net page, signalling through that relay alone.
// A relay can accept a probe's event and still refuse Trystero (see
// REPORT.md). RELAYS overrides the list; run on a local preview build:
//   npm run build && RELAYS=wss://a,wss://b npx playwright test -c research/relays/playwright.config.ts
import { expect, test } from '@playwright/test';
import { launch, openNetPage, report, hashAt, type NetReport } from '../../e2e/lib/browsers';

const RELAYS = (process.env['RELAYS'] ?? 'wss://relay.snort.social,wss://nostr-pub.wellorder.net,wss://nostr.mom,wss://nostr.bitcoiner.social').split(',');

for (const relay of RELAYS) {
  test(`a three-engine round through ${relay} alone`, async ({ baseURL }) => {
    const common = { room: `c22-${Date.now()}`, relay, ante: 2, seed: 7 };
    const bs = { chromium: await launch('chromium'), firefox: await launch('firefox'), webkit: await launch('webkit') };
    const warnings: string[] = [];
    try {
      const t0 = Date.now();
      const pages = [
        await openNetPage(bs.chromium, baseURL!, { ...common, k: 1, role: 'keeper', ready: 6000 }),
        await openNetPage(bs.firefox, baseURL!, { ...common, k: 2, role: 'player', ready: 6000 }),
        await openNetPage(bs.webkit, baseURL!, { ...common, k: 3, role: 'player', ready: 6000 }),
      ];
      for (const p of pages) p.page.on('console', (m) => { if (/relay|Trystero/i.test(m.text())) warnings.push(m.text().slice(0, 140)); });
      let reports: NetReport[] = [];
      let connectedAt = 0;
      while (Date.now() - t0 < 180_000) {
        reports = await Promise.all(pages.map((p) => report(p.page)));
        if (!connectedAt && reports.every((r) => r.peers === 2)) connectedAt = Date.now() - t0;
        if (reports.every((r) => r.phase === 3)) break;
        await pages[0]!.page.waitForTimeout(500);
      }
      const tick = Math.min(...reports.map((r) => r.finalTick));
      const hashes = await Promise.all(pages.map((p) => hashAt(p.page, tick)));
      console.log(`${relay}: mesh in ${connectedAt} ms, frozen ${reports.every((r) => r.phase === 3)} after ${Date.now() - t0} ms, agree ${new Set(hashes).size === 1}, resyncs ${reports.map((r) => r.stats.resyncs).join('/')}, late ${reports.map((r) => r.stats.late).join('/')}; warnings: ${JSON.stringify([...new Set(warnings)])}`);
      expect(reports.every((r) => r.phase === 3)).toBe(true);
      expect(new Set(hashes).size).toBe(1);
    } finally {
      for (const b of Object.values(bs)) await b.close();
    }
  });
}
