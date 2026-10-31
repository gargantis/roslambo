// The owner's setup (2026-10-25): three browsers on one machine, their
// windows overlapping, switched between. At any moment two are behind
// another window: hidden, with their timers held to one a second, as
// browsers do. Every second, every window must number and tag the planets
// alike, through joining (the proposer plays at once), Ready, the countdown
// and the round (D-23).

import { expect, test, type Page } from '@playwright/test';
import { launch, type Engine } from './lib/browsers';
import { startNostrRelay } from '../vendor/hermet/nostr-relay.mjs';
import type { Inspection } from '../src/ui/app';

// Each page can be "behind another window": hidden, and its timers held to one a second.
const THROTTLE = `
  const real = window.setInterval;
  window.__behind = false;
  window.setInterval = (fn, ms, ...a) => { let last = 0; return real(() => { if (window.__behind) { const n = performance.now(); if (n - last < 1000) return; last = n; } fn(...a); }, ms); };
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__behind ? 'hidden' : 'visible') });
`;

async function front(pages: Page[], i: number): Promise<void> {
  for (const [k, p] of pages.entries()) {
    await p.evaluate((behind) => {
      (window as unknown as { __behind: boolean }).__behind = behind;
      document.dispatchEvent(new Event('visibilitychange'));
    }, k !== i);
  }
}

async function problems(pages: Page[], names: string[], when: string): Promise<string[]> {
  const out: string[] = [];
  const vs = await Promise.all(pages.map(async (p) => {
    const s = (await p.evaluate(() => window.roslamboTest!.inspect!())) as Inspection;
    const rows = await p.locator('[data-test=players] li').evaluateAll((lis) => lis.map((li) => li.textContent ?? ''));
    return { s, rows, me: s.planets.findIndex((x) => x.id === s.me), head: s.headRoster.indexOf(s.me) };
  }));
  const rosters = vs.map((v) => v.s.planets.map((x) => x.id.slice(-2)).join(','));
  if (new Set(rosters).size !== 1) out.push(`${when}: rosters differ ${rosters.join(' | ')}`);
  vs.forEach((v, k) => {
    const n = v.s.planets.length;
    if (v.head !== v.me) out.push(`${when} ${names[k]}: canvas "you" at ${v.head}, list at ${v.me}`);
    v.rows.forEach((r, i) => {
      const want = i === v.me ? 'you' : n >= 2 && i === (v.me + 1) % n ? 'your quarry' : n >= 3 && i === (v.me + n - 1) % n ? 'your hunter' : '';
      const has = r.includes('your hunter') ? 'your hunter' : r.includes('your quarry') ? 'your quarry' : r.includes('you') ? 'you' : '';
      if (want !== has) out.push(`${when} ${names[k]}: row ${i + 1} "${r}" should be "${want}"`);
    });
  });
  return out;
}

const ENGINES: Engine[] = ['chromium', 'firefox', 'webkit'];
test('three overlapping windows, switched between, through a round', async ({ baseURL }) => {
  test.setTimeout(240_000);
  const relayServer = await startNostrRelay();
  const relay = `ws://127.0.0.1:${relayServer.port}`;
  const bs = await Promise.all(ENGINES.map(launch));
  const names = ['Ada', 'Bo', 'Cy'];
  const all: string[] = [];
  try {
    const pages: Page[] = [];
    for (const [i, b] of bs.entries()) {
      const ctx = await b.newContext();
      await ctx.addInitScript((cfg) => { window.roslamboTest = cfg; }, { relay, script: { seed: 5, k: i + 1 } });
      await ctx.addInitScript(THROTTLE);
      const p = await ctx.newPage();
      await p.goto(baseURL!);
      await p.locator('[data-test=name]').fill(names[i]!);
      await p.locator('[data-test=name]').blur();
      pages.push(p);
    }
    const [a, b, c] = pages as [Page, Page, Page];
    await a.locator('[data-test=propose]').click();
    await a.locator('[data-test=ante]').fill('3');
    await a.locator('[data-test=create]').click();
    const code = (await a.locator('[data-test=invite-code]').textContent())!;
    await a.locator('[data-test=play]').click(); // at once, before anyone arrives
    await front(pages, 2);
    await c.locator('[data-test=code]').fill(code);
    await c.locator('[data-test=join]').click();
    await c.locator('[data-test=join-play]').click();
    await expect(c.locator('[data-test=ready]')).toBeEnabled({ timeout: 60_000 });
    await front(pages, 1);
    await b.locator('[data-test=code]').fill(code);
    await b.locator('[data-test=join]').click();
    await b.locator('[data-test=join-play]').click();
    await expect(b.locator('[data-test=ready]')).toBeEnabled({ timeout: 60_000 });
    for (const p of pages) await expect(p.locator('[data-test=players] li')).toHaveCount(3, { timeout: 30_000 });
    // Switch between windows for a while, checking every second.
    for (let r = 0; r < 9; r++) {
      await front(pages, r % 3);
      for (let s = 0; s < 3; s++) {
        await a.waitForTimeout(1000);
        all.push(...await problems(pages, names, `pre-start ${r}.${s}`));
      }
    }
    // Each presses Ready while in front.
    for (const i of [1, 0, 2]) {
      await front(pages, i);
      await pages[i]!.locator('[data-test=ready]').click();
      await a.waitForTimeout(1500);
    }
    for (let r = 0; r < 12; r++) {
      await front(pages, r % 3);
      await a.waitForTimeout(1000);
      all.push(...await problems(pages, names, `after Ready ${r}`));
    }
    const ss = await Promise.all(pages.map((p) => p.evaluate(() => window.roslamboTest!.inspect!()) as Promise<Inspection>));
    console.log(`phases ${ss.map((s) => s.phase).join(',')}, resyncs ${ss.map((s) => s.stats.resyncs).join(',')}, late ${ss.map((s) => s.stats.late).join(',')}`);
    expect(ss.every((s) => s.phase >= 1), 'the countdown started').toBe(true);
    expect(all).toEqual([]);
  } finally {
    for (const x of bs) await x.close();
    await relayServer.close();
  }
});
