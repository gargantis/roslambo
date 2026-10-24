// M0 run 2: one player per engine, plus a spectator joining late, over the
// local relay (or SPIKE_RELAY=public for the public relays from this one
// machine). The Firefox player corrupts its own state once; it must be
// outvoted and repaired. SPIKE_SECONDS sets the length (default 120).

import { expect, test } from '@playwright/test';
import { disagreements, launch, openPeer, report, save, sharedCheckpoints, sleep, type Engine, type Report } from './harness.ts';
import { startNostrRelay } from './nostr-relay.mjs';

const SECONDS = Number(process.env.SPIKE_SECONDS ?? 120);
const PUBLIC = process.env.SPIKE_RELAY === 'public';

test('one player per engine agree under majority voting', async () => {
  test.setTimeout((SECONDS + 240) * 1000);
  const relay = PUBLIC ? null : await startNostrRelay();
  const common = { n: 3, room: `spike-mesh-${Date.now()}`, relay: relay ? `ws://127.0.0.1:${relay.port}` : 'public' };
  const corruptAt = Math.floor(SECONDS * 60 * 0.5);
  const engines: Engine[] = ['chromium', 'firefox', 'webkit'];
  const browsers = Object.fromEntries(await Promise.all(engines.map(async (e) => [e, await launch(e)] as const)));
  const pages = {
    chromium: await openPeer(browsers.chromium!, { ...common, me: 0, genesis: 1 }),
    firefox: await openPeer(browsers.firefox!, { ...common, me: 1, corrupt: corruptAt }),
    webkit: await openPeer(browsers.webkit!, { ...common, me: 2 }),
  };
  await sleep(SECONDS * 250);
  const spectator = await openPeer(browsers.chromium!, { ...common, me: -1 });
  await sleep(SECONDS * 750);

  const reports: Record<string, Report> = {};
  for (const [name, page] of Object.entries(pages)) reports[name] = await report(page);
  reports.spectator = await report(spectator);
  save(`mesh-${PUBLIC ? 'public' : 'local'}`, { seconds: SECONDS, corruptAt, reports });
  for (const b of Object.values(browsers)) await b.close();
  await relay?.close();

  // Peers that never got a state didn't join (C-18 for WebKit: reported, not hidden).
  const joined = Object.entries(reports).filter(([, r]) => r.finalTick > 0);
  for (const [name, r] of Object.entries(reports)) {
    console.log(`${name}: final ${r.finalTick}, peers ${r.peers}, agree ${r.agree}, disagree ${r.disagree}, resyncs ${r.resyncs} ${JSON.stringify(r.resyncMs)}, late ${r.late}, first peer ${Math.round(r.firstPeerMs)} ms, cpu p95 ${r.cpu.p95.toFixed(2)} ms`);
  }
  expect.soft(reports.webkit!.finalTick, 'WebKit joined the round').toBeGreaterThan(0);
  const ticks = sharedCheckpoints(joined.map(([, r]) => r), corruptAt + 600);
  expect(ticks.length, 'shared checkpoints after the repair').toBeGreaterThan(0);
  expect(disagreements(joined.map(([, r]) => r), ticks)).toEqual([]);
  expect(reports.firefox!.resyncs, 'the corrupted peer was repaired').toBeGreaterThanOrEqual(1);
});
