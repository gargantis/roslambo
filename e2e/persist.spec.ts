// PLAN §15 M5 exit, through the real screens over Trystero and the local
// relay: a reload mid-round, a missed result collected from passive
// witnesses, everyone leaving and one player resuming, and two saved
// histories meeting (Q-7). One Chromium context per player, so each has
// its own storage; reopening a page in a context is a return visit.

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { Inspection } from '../src/ui/app';
import { launch } from './lib/browsers';
import { startNostrRelay } from './lib/nostr-relay.mjs';

interface Player {
  ctx: BrowserContext;
  page: Page;
  errors: string[];
}

async function player(b: Browser, relay: string, k: number): Promise<Player> {
  const ctx = await b.newContext();
  await ctx.addInitScript((cfg) => { window.roslamboTest = cfg; }, { relay, script: { seed: 11, k } });
  const p: Player = { ctx, page: undefined as unknown as Page, errors: [] };
  return p;
}

async function open(p: Player, url: string): Promise<Page> {
  p.page = await p.ctx.newPage();
  p.page.on('pageerror', (e) => p.errors.push(String(e)));
  p.page.on('console', (m) => {
    if (m.type() === 'error') p.errors.push(m.text());
  });
  await p.page.goto(url);
  await expect(p.page.locator('html')).toHaveAttribute('data-ready', '1');
  return p.page;
}

const inspect = (page: Page): Promise<Inspection | null> => page.evaluate(() => window.roslamboTest!.inspect!());

async function until(page: Page, what: string, ok: (s: Inspection) => boolean, ms = 60_000): Promise<Inspection> {
  const deadline = Date.now() + ms;
  for (;;) {
    const s = await inspect(page);
    if (s && ok(s)) return s;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}: ${JSON.stringify(s && { ...s, hashes: undefined })}`);
    await page.waitForTimeout(250);
  }
}

/** Player 1 proposes; 2 and 3 join by link; all play, Ready, and run. */
async function round(base: string, players: Player[], ante: number): Promise<string> {
  const [a, ...rest] = players;
  await open(a!, base);
  await a!.page.locator('[data-test=propose]').click();
  await a!.page.locator('[data-test=ante]').fill(String(ante));
  await a!.page.locator('[data-test=create]').click();
  const link = await a!.page.locator('[data-test=invite-link]').inputValue();
  for (const p of rest) {
    await open(p, link);
    await p.page.locator('[data-test=join-play]').click();
  }
  await expect(a!.page.locator('[data-test=play]')).toBeEnabled({ timeout: 60_000 });
  await a!.page.locator('[data-test=play]').click();
  for (const p of players) {
    const ready = p.page.locator('[data-test=ready]');
    await expect(ready).toBeEnabled({ timeout: 60_000 });
    await ready.click();
  }
  for (const p of players) await until(p.page, 'the round to run', (s) => s.phase === 2);
  return link;
}

function inControl(s: Inspection): boolean {
  const me = s.planets.find((p) => p.id === s.me);
  return me !== undefined && s.finalTick - me.lastInputTick < 30;
}

async function agree(pages: Page[]): Promise<void> {
  const states = await Promise.all(pages.map(inspect));
  const tick = Math.min(...states.map((s) => s!.finalTick)) - 5;
  const hashes = states.map((s) => s!.hashes[tick]);
  expect(hashes.every(Boolean), `tick ${tick}`).toBe(true);
  expect(new Set(hashes).size, `state at tick ${tick}`).toBe(1);
}

let relayServer: Awaited<ReturnType<typeof startNostrRelay>>;
let relay = '';
let browser: Browser;
test.beforeEach(async () => {
  relayServer = await startNostrRelay();
  relay = `ws://127.0.0.1:${relayServer.port}`;
  browser = await launch('chromium');
});
test.afterEach(async () => {
  await browser.close();
  await relayServer.close();
});

test('a player who reloads mid-round takes back its planet', async ({ baseURL }) => {
  test.setTimeout(180_000);
  const ps = await Promise.all([1, 2, 3].map((k) => player(browser, relay, k)));
  await round(baseURL!, ps, 30);
  await ps[1]!.page.reload();
  await until(ps[1]!.page, 'player 2 back in control', (s) => s.started && s.phase === 2 && inControl(s));
  await ps[1]!.page.waitForTimeout(3000);
  await agree(ps.map((p) => p.page));
  for (const p of ps) expect(p.errors).toEqual([]);
});

test('a player who missed the end collects the result from passive witnesses', async ({ baseURL }) => {
  test.setTimeout(240_000);
  const ps = await Promise.all([1, 2, 3].map((k) => player(browser, relay, k)));
  await round(baseURL!, ps, 2);
  const c = (await inspect(ps[2]!.page))!;
  const roundId = c.roundId;
  await ps[2]!.page.close(); // player 3 closes its tab mid-round
  for (const p of ps.slice(0, 2)) await expect(p.page.locator('[data-test=results]')).toBeVisible({ timeout: 180_000 });
  const end = (await inspect(ps[0]!.page))!;
  const expected = end.planets.find((p) => p.id === c.me)!.points - 2;
  for (const p of ps.slice(0, 2)) await p.page.locator('[data-test=home]').click(); // both witnesses now wait passively
  const key = `roslambo.v1.witness.${roundId}`;
  for (const p of ps.slice(0, 2)) expect(await p.page.evaluate((k) => localStorage.getItem(k), key)).not.toBeNull();

  await open(ps[2]!, baseURL!); // back, on Home
  await expect(ps[2]!.page.locator('[data-test=balance]')).toHaveText(String(expected), { timeout: 60_000 });
  for (const p of ps.slice(0, 2)) {
    await expect.poll(() => p.page.evaluate((k) => localStorage.getItem(k), key), { timeout: 20_000 }).toBeNull();
  }
  await expect(ps[2]!.page.locator('[data-test=unsettled]')).toHaveCount(0);
  for (const p of ps) expect(p.errors).toEqual([]);
});

test('everyone leaves; one player resumes alone, and another rejoins it', async ({ baseURL }) => {
  test.setTimeout(240_000);
  const ps = await Promise.all([1, 2, 3].map((k) => player(browser, relay, k)));
  await round(baseURL!, ps, 30);
  await ps[0]!.page.waitForTimeout(2000);
  const before = (await inspect(ps[0]!.page))!;
  for (const p of ps) await p.page.close();

  const a = await open(ps[0]!, baseURL!);
  await expect(a.locator('[data-test=unsettled-open]')).toHaveText('Resume', { timeout: 40_000 });
  await a.locator('[data-test=unsettled-open]').click();
  // It goes on from its save, at most a second old, and runs past where everyone left.
  const first = await until(a, 'player 1 to resume alone', (s) => s.started);
  expect(first.finalTick).toBeGreaterThan(before.finalTick - 90);
  const resumed = await until(a, 'the resumed round to run on', (s) => s.finalTick > before.finalTick + 120 && inControl(s));
  expect(resumed.timeline).not.toBe(before.timeline);
  expect(resumed.planets).toHaveLength(3);

  const b = await open(ps[1]!, baseURL!);
  await expect(b.locator('[data-test=unsettled-open]')).toHaveText('Rejoin', { timeout: 40_000 });
  await b.locator('[data-test=unsettled-open]').click();
  const joined = await until(b, 'player 2 to rejoin', (s) => s.started && inControl(s));
  expect(joined.timeline).toBe(resumed.timeline);
  await b.waitForTimeout(2000);
  await agree([a, b]);
  for (const p of ps) expect(p.errors).toEqual([]);
});

test('two saved histories meet: the later one wins (Q-7)', async ({ baseURL }) => {
  test.setTimeout(240_000);
  const ps = await Promise.all([1, 2, 3].map((k) => player(browser, relay, k)));
  const link = await round(baseURL!, ps, 30);
  const early = (await inspect(ps[1]!.page))!;
  await ps[1]!.page.close(); // player 2 leaves first
  await ps[0]!.page.waitForTimeout(4000);
  const late = (await inspect(ps[0]!.page))!;
  for (const p of [ps[0]!, ps[2]!]) await p.page.close();
  expect(late.finalTick).toBeGreaterThan(early.finalTick + 120);

  // Players 1 and 2 come back by the link at the same moment, each with its save.
  const [a, b] = await Promise.all([open(ps[0]!, link), open(ps[1]!, link)]);
  const sa = await until(a, 'player 1 to resume', (s) => s.started && inControl(s));
  const sb = await until(b, 'player 2 to join it', (s) => s.started && inControl(s) && s.timeline === sa.timeline);
  expect(sa.timeline).not.toBe(late.timeline);
  expect(sb.finalTick).toBeGreaterThan(late.finalTick); // player 1's history, not player 2's older one
  await b.waitForTimeout(2000);
  await agree([a, b]);
  for (const p of ps) expect(p.errors).toEqual([]);
});
