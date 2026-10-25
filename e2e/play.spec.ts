// PLAN §15 M4 exit: a full round through the screens, one player per
// engine, over the real Trystero transport and the local Nostr relay. The
// Chromium player proposes; Firefox joins by link and WebKit by typed
// code. Each page's buttons are scripted (window.roslamboTest), so the
// round reaches its freeze; everything else is the real UI.

import { expect, test, type Browser, type Page } from '@playwright/test';
import { launch } from './lib/browsers';
import { startNostrRelay } from './lib/nostr-relay.mjs';

async function open(b: Browser, base: string, relay: string, k: number): Promise<{ page: Page; errors: string[] }> {
  const ctx = await b.newContext();
  await ctx.addInitScript((cfg) => { window.roslamboTest = cfg; }, { relay, script: { seed: 7, k } });
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

async function resultsOf(page: Page): Promise<string[][]> {
  return page.locator('[data-test=results] tbody tr').evaluateAll((rows) =>
    rows.map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent ?? '')));
}

test('three engines play a round through the screens, joining by link and by code', async ({ baseURL }) => {
  test.setTimeout(240_000);
  const relayServer = await startNostrRelay();
  const relay = `ws://127.0.0.1:${relayServer.port}`;
  const browsers = [await launch('chromium'), await launch('firefox'), await launch('webkit')];
  try {
    const a = await open(browsers[0]!, baseURL!, relay, 1);
    await a.page.locator('[data-test=name]').fill('Ada');
    await a.page.locator('[data-test=propose]').click();
    await a.page.locator('[data-test=ante]').fill('2');
    await a.page.locator('[data-test=create]').click();
    const link = await a.page.locator('[data-test=invite-link]').inputValue();
    const code = (await a.page.locator('[data-test=invite-code]').textContent())!;
    expect(link).toContain('#join=');

    const b = await open(browsers[1]!, baseURL!, relay, 2);
    await b.page.goto('about:blank');
    await b.page.goto(link);
    await b.page.locator('[data-test=join-play]').click();

    await expect(a.page.locator('[data-test=play]')).toBeEnabled({ timeout: 60_000 });
    await a.page.locator('[data-test=play]').click();

    const c = await open(browsers[2]!, baseURL!, relay, 3);
    await c.page.locator('[data-test=name]').fill('Cy');
    await c.page.locator('[data-test=code]').fill(code.toLowerCase());
    await c.page.locator('[data-test=join]').click();
    await c.page.locator('[data-test=join-play]').click();

    const pages = [a, b, c];
    for (const p of pages) {
      const ready = p.page.locator('[data-test=ready]');
      await expect(ready).toBeEnabled({ timeout: 60_000 });
      await ready.click();
    }
    await expect(a.page.locator('[data-test=players] li')).toHaveCount(3);
    for (const p of pages) await expect(p.page.locator('[data-test=results]')).toBeVisible({ timeout: 180_000 });

    const tables = await Promise.all(pages.map((p) => resultsOf(p.page)));
    console.log(tables[0]!.map((r) => r.join(' ')).join(' | '));
    const strip = (t: string[][]): string[][] => t.map((r) => [r[0]!, r[1]!.replace(/you$/, ''), r[2]!, r[3]!]);
    expect(strip(tables[1]!)).toEqual(strip(tables[0]!));
    expect(strip(tables[2]!)).toEqual(strip(tables[0]!));
    const names = strip(tables[0]!).map((r) => r[1]);
    expect(names).toContain('Ada');
    expect(names).toContain('Cy');
    expect(tables[0]!.some((r) => r[2] === '0'), 'someone reached 0').toBe(true);

    // Each player's balance started at 0, so it is now their change.
    for (const [i, p] of pages.entries()) {
      const mine = tables[i]!.find((r) => r[1]!.endsWith('you'))!;
      const change = mine[3]!.replace('−', '-').replace('+', '');
      await expect(p.page.locator('[data-test=balance]')).toHaveText(String(Number(change)));
    }
    const balance = await a.page.locator('[data-test=balance]').textContent();
    await a.page.locator('[data-test=home]').click();
    await expect(a.page.locator('[data-test=balance]')).toHaveText(balance!);
    for (const p of pages) expect(p.errors).toEqual([]);
  } finally {
    for (const br of browsers) await br.close();
    await relayServer.close();
  }
});
