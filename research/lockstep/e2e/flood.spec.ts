// M0 run 5: unpatched Trystero 0.26.0 against oversized payloads and an
// unregistered action type. The victim must keep agreeing, and its heap
// must stay bounded (Chromium reports heap size).

import { expect, test } from '@playwright/test';
import { launch, openPeer, report, save, sleep } from './harness.ts';
import { startNostrRelay } from './nostr-relay.mjs';

test('flooding a peer neither breaks its round nor grows its heap', async () => {
  test.setTimeout(5 * 60_000);
  const relay = await startNostrRelay();
  const common = { n: 3, room: `spike-flood-${Date.now()}`, relay: `ws://127.0.0.1:${relay.port}` };
  const browser = await launch('chromium');
  const victim = await openPeer(browser, { ...common, me: 0, genesis: 1 });
  const honest = await openPeer(browser, { ...common, me: 1 });
  const attacker = await openPeer(browser, { ...common, me: 2 });
  await sleep(15_000);
  const before = await report(victim);
  // 20 × 2 MiB on the game action (above the 1 MiB receive limit), plus
  // 20 × 512 KiB on a type the victim never registered.
  await attacker.evaluate(() => (window as unknown as { spike: { flood: (c: number, b: number) => Promise<unknown> } }).spike.flood(20, 2 * 1024 * 1024));
  await sleep(20_000);
  const after = await report(victim);
  const attackerReport = await report(attacker);
  save('flood', { before, after, attacker: attackerReport, honest: await report(honest) });
  await browser.close();
  await relay.close();

  console.log(`victim heap ${(before.heap! / 2 ** 20).toFixed(1)} → ${(after.heap! / 2 ** 20).toFixed(1)} MiB, agree ${before.agree} → ${after.agree}, disagree ${after.disagree}, attacker send errors ${attackerReport.net.floodErrors}`);
  expect(after.agree).toBeGreaterThan(before.agree + 600);
  expect(after.disagree).toBe(before.disagree);
  expect(after.heap! - before.heap!).toBeLessThan(64 * 2 ** 20);
});
