// M5 probe (PLAN §15): how Trystero 0.26.0's passive rooms behave.
//   1. What an idle passive room costs the relays, against an idle active one.
//   2. How long a passive peer takes to wake when an active peer arrives.
//   3. Whether passive peers in one room connect to each other.
//   4. Whether one tab can play in an active room while it watches ten
//      passive ones, and whether a woken room goes dormant again.
// Writes research/passive/results.json.

import { writeFileSync } from 'node:fs';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { startNostrRelay } from '../../e2e/lib/nostr-relay.mjs';

interface ProbeEvent { at: number; room: string; kind: string; peer: string; data?: string }

const PASSIVE = Array.from({ length: 10 }, (_, i) => `r${i + 1}`);
const ACTIVE = Array.from({ length: 10 }, (_, i) => `s${i + 1}`);

async function open(b: Browser, base: string, relay: string, name: string, rooms: string): Promise<Page> {
  const page = await (await b.newContext()).newPage();
  await page.goto(`${base}dev/passive-probe.html#relay=${encodeURIComponent(relay)}&name=${name}&rooms=${rooms}`);
  await page.waitForFunction(() => window.probe !== undefined);
  return page;
}

const events = (p: Page): Promise<ProbeEvent[]> => p.evaluate(() => window.probe!.events.slice());

async function firstJoin(p: Page, room: string, after: number, timeoutMs = 60_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const e = (await events(p)).find((x) => x.room === room && x.kind === 'join' && x.at >= after);
    if (e) return e.at;
    await p.waitForTimeout(50);
  }
  return NaN;
}

test('passive rooms: cost, wake-up, no passive pairs, and one tab with many rooms', async ({ baseURL }) => {
  const relayServer = await startNostrRelay();
  const relay = `ws://127.0.0.1:${relayServer.port}`;
  const b = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const out: Record<string, unknown> = {};
  try {
    // Connection order on the relay is page order, so counts()[i] is page i.
    const w = await open(b, baseURL!, relay, 'W', ['g:a', ...PASSIVE.map((r) => `${r}:p`)].join(','));
    await w.waitForTimeout(1500);
    const w2 = await open(b, baseURL!, relay, 'W2', 'r3:p');
    await w2.waitForTimeout(1500);
    const act = await open(b, baseURL!, relay, 'A10', ACTIVE.map((r) => `${r}:a`).join(','));
    await act.waitForTimeout(1500);
    const p = await open(b, baseURL!, relay, 'P', 'g:a');
    await firstJoin(w, 'g', 0);
    await p.evaluate(() => window.probe!.stream('g', 60));

    // 1. Idle cost, over a minute after a warm-up.
    await w.waitForTimeout(20_000);
    const c0 = relayServer.counts();
    await w.waitForTimeout(60_000);
    const c1 = relayServer.counts();
    const perMinute = (i: number): Record<string, number> => ({
      req: c1[i]!.req - c0[i]!.req, close: c1[i]!.close - c0[i]!.close, event: c1[i]!.event - c0[i]!.event,
    });
    out['relayPerMinute'] = {
      'W: 1 active (busy) + 10 passive rooms': perMinute(0),
      'W2: 1 passive room': perMinute(1),
      'A10: 10 active idle rooms': perMinute(2),
      'P: 1 active (busy) room': perMinute(3),
    };

    // 3, before anyone active arrives in r3: W and W2 haven't connected.
    expect((await events(w)).filter((e) => e.room === 'r3' && e.kind === 'join')).toEqual([]);
    expect((await events(w2)).filter((e) => e.room === 'r3' && e.kind === 'join')).toEqual([]);

    // 2. Wake-up: a settler arrives in r3, r5, r7 and r9 in turn.
    const wake: Record<string, unknown>[] = [];
    for (const room of ['r3', 'r5', 'r7', 'r9']) {
      const t0 = Date.now();
      const s = await open(b, baseURL!, relay, `S-${room}`, `${room}:a`);
      const wSees = await firstJoin(w, room, t0);
      const sSees = await firstJoin(s, room, t0);
      const sent = Date.now();
      await s.evaluate((r) => window.probe!.send(r, 'result please'), room);
      let got = NaN;
      for (let k = 0; k < 200 && Number.isNaN(got); k++) {
        const e = (await events(w)).find((x) => x.room === room && x.kind === 'message' && x.at >= sent);
        if (e) got = e.at;
        else await w.waitForTimeout(25);
      }
      wake.push({ room, pageOpenToWitnessJoinMs: wSees - t0, pageOpenToSettlerJoinMs: sSees - t0, messageMs: got - sent });
      if (room === 'r3') {
        await w.waitForTimeout(3000);
        const w2Joins = (await events(w2)).filter((e) => e.room === 'r3' && e.kind === 'join');
        const wJoins = (await events(w)).filter((e) => e.room === 'r3' && e.kind === 'join');
        out['r3JoinCounts'] = { W: wJoins.length, W2: w2Joins.length, note: 'each should see only the settler' };
      }
      await s.evaluate((r) => window.probe!.leave(r), room);
      await s.context().close();
    }
    out['wake'] = wake;

    // 4. The busy active room kept flowing while rooms woke.
    const gMsgs = (await events(w)).filter((e) => e.room === 'g' && e.kind === 'message');
    const span = (gMsgs[gMsgs.length - 1]!.at - gMsgs[0]!.at) / 1000;
    out['gameRoom'] = { messages: gMsgs.length, perSecond: gMsgs.length / span, longestGapMs: Math.max(...gMsgs.slice(1).map((e, i) => e.at - gMsgs[i]!.at)) };

    // Dormant again: W's relay traffic after the grace period.
    await w.waitForTimeout(15_000);
    const d0 = relayServer.counts();
    await w.waitForTimeout(60_000);
    const d1 = relayServer.counts();
    out['wAfterWakesPerMinute'] = { req: d1[0]!.req - d0[0]!.req, close: d1[0]!.close - d0[0]!.close, event: d1[0]!.event - d0[0]!.event };
    console.log(JSON.stringify(out, null, 2));
    writeFileSync('research/passive/results.json', `${JSON.stringify(out, null, 2)}\n`);
  } finally {
    await b.close();
    await relayServer.close();
  }
});
