// Bots through the screens (Q-23), over the real Trystero transport and
// the local Nostr relay. A player alone plays two bots it hosts, and the
// practice round leaves its balance as it was. Then two spectators in
// different engines fill a round with bots and watch it to the same
// results. The player's buttons are scripted (window.roslamboTest).

import { expect, test, type Browser, type Page } from '@playwright/test';
import { launch } from './lib/browsers';
import { startNostrRelay } from '../vendor/hermet/nostr-relay.mjs';

async function open(b: Browser, base: string, relay: string, k: number): Promise<{ page: Page; errors: string[] }> {
  const ctx = await b.newContext();
  await ctx.addInitScript((cfg) => { window.roslamboTest = cfg; }, { relay, script: { seed: 9, k } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(base);
  await expect(page.locator('[data-test=balance]')).toHaveText('0');
  return { page, errors };
}

async function propose(page: Page, ante: number): Promise<string> {
  await page.locator('[data-test=propose]').click();
  await page.locator('[data-test=ante]').fill(String(ante));
  await page.locator('[data-test=create]').click();
  return page.locator('[data-test=invite-link]').inputValue();
}

async function resultsOf(page: Page): Promise<string[][]> {
  return page.locator('[data-test=results] tbody tr').evaluateAll((rows) =>
    rows.map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent ?? '')));
}

test('a player alone plays two bots it hosts, and the practice round changes no balance', async ({ baseURL }) => {
  test.setTimeout(180_000);
  const relayServer = await startNostrRelay();
  const browser = await launch('chromium');
  try {
    const a = await open(browser, baseURL!, `ws://127.0.0.1:${relayServer.port}`, 1);
    await propose(a.page, 1);
    await a.page.locator('[data-test=play]').click();
    const ready = a.page.locator('[data-test=ready]');
    await expect(ready).toBeEnabled({ timeout: 30_000 });
    await a.page.locator('[data-test=add-bot]').click();
    await a.page.locator('[data-test=add-bot]').click();
    const rows = a.page.locator('[data-test=players] li');
    await expect(rows).toHaveCount(3);
    await expect(rows.filter({ hasText: /Bot [0-9A-F]{4}/ })).toHaveCount(2);
    await expect(rows.filter({ hasText: 'not ready' })).toHaveCount(1); // the bots are ready; the player isn't yet
    await expect(a.page.locator('[data-test=bot-note]')).toHaveText('You host 2 bots. With bots, this round is practice: no balance changes.');
    await ready.click();
    await expect(a.page.locator('[data-test=results]')).toBeVisible({ timeout: 120_000 });

    const table = await resultsOf(a.page);
    expect(table).toHaveLength(3);
    expect(table.filter((r) => r[1]!.endsWith('bot'))).toHaveLength(2);
    expect(table.filter((r) => r[1]!.endsWith('you'))).toHaveLength(1);
    expect(table.some((r) => r[2] === '0'), 'someone reached 0').toBe(true);
    await expect(a.page.locator('[data-test=practice]')).toBeVisible();
    await expect(a.page.locator('[data-test=balance]')).toHaveText('0');
    await a.page.locator('[data-test=home]').click();
    await expect(a.page.locator('[data-test=balance]')).toHaveText('0');
    await expect(a.page.locator('[data-test=unsettled]')).toHaveCount(0);
    expect(a.errors).toEqual([]);
  } finally {
    await browser.close();
    await relayServer.close();
  }
});

test('two spectators in different engines fill a round with bots and watch it to the same results', async ({ baseURL }) => {
  test.setTimeout(180_000);
  const relayServer = await startNostrRelay();
  const relay = `ws://127.0.0.1:${relayServer.port}`;
  const browsers = [await launch('webkit'), await launch('firefox')];
  try {
    const a = await open(browsers[0]!, baseURL!, relay, 1);
    const link = await propose(a.page, 1);
    await a.page.locator('[data-test=watch]').click(); // at once: a spectator can host bots
    await expect(a.page.locator('[data-test=status]')).toContainText('Watching');

    const b = await open(browsers[1]!, baseURL!, relay, 2);
    await b.page.goto('about:blank');
    await b.page.goto(link);
    await b.page.locator('[data-test=join-watch]').click();
    await expect(b.page.locator('[data-test=add-bot]')).toBeVisible({ timeout: 60_000 }); // shown once it holds the round

    await b.page.locator('[data-test=add-bot]').click();
    await expect(a.page.locator('[data-test=players] li')).toHaveCount(1, { timeout: 30_000 });
    await a.page.locator('[data-test=add-bot]').click();
    await a.page.locator('[data-test=add-bot]').click();
    // Three bots, all ready: the countdown starts by itself.
    for (const p of [a, b]) await expect(p.page.locator('[data-test=results]')).toBeVisible({ timeout: 120_000 });

    const tables = await Promise.all([a, b].map((p) => resultsOf(p.page)));
    expect(tables[0]).toHaveLength(3);
    expect(tables[0]!.every((r) => r[1]!.endsWith('bot'))).toBe(true);
    expect(tables[1]).toEqual(tables[0]);
    for (const p of [a, b]) {
      await expect(p.page.locator('[data-test=practice]')).toBeVisible();
      await expect(p.page.locator('[data-test=balance]')).toHaveCount(0); // spectators have no balance line
    }
    for (const p of [a, b]) expect(p.errors).toEqual([]);
  } finally {
    for (const br of browsers) await br.close();
    await relayServer.close();
  }
});
