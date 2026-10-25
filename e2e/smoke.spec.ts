// The page loads in every engine: the module runs, the determinism canary
// passes (D-17), nothing logs an error, and no request leaves the local
// server (PLAN §14 "Everywhere"). Home's forms check what's typed.

import { expect, test, type Page } from '@playwright/test';
import { formatRoundId, generateRoundId } from '../src/core/round-id';

function watch(page: Page, baseURL: string): { errors: string[]; outside: string[] } {
  const errors: string[] = [];
  const outside: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    if (!r.url().startsWith(baseURL)) outside.push(r.url());
  });
  return { errors, outside };
}

test('the page loads without errors or outside requests', async ({ page, baseURL }) => {
  const seen = watch(page, baseURL!);
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  await expect(page.locator('html')).toHaveAttribute('data-canary', 'ok');
  await expect(page).toHaveTitle('roslambo');
  await expect(page.getByRole('heading', { name: 'roslambo' })).toBeVisible();
  await expect(page.locator('[data-test=balance]')).toHaveText('0');
  expect(seen.errors).toEqual([]);
  expect(seen.outside).toEqual([]);
});

test('Propose checks its settings, and a typed code reaches Join', async ({ page, baseURL }) => {
  const seen = watch(page, baseURL!);
  await page.goto('./');
  await page.locator('[data-test=name]').fill('  Ada  ');
  await page.locator('[data-test=propose]').click();
  await page.locator('[data-test=min]').fill('2');
  await page.locator('[data-test=create]').click();
  await expect(page.getByRole('alert')).toHaveText('The minimum is at least 3 players.');
  await page.locator('[data-test=min]').fill('3');
  await page.locator('[data-test=max]').fill('9');
  await page.locator('[data-test=create]').click();
  await expect(page.getByRole('alert')).toHaveText('The maximum is at most 8 players.');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('[data-test=name]')).toHaveValue('Ada');

  await page.locator('[data-test=code]').fill('not a code');
  await page.locator('[data-test=join]').click();
  await expect(page.getByRole('alert')).toContainText('isn’t valid');
  const id = generateRoundId();
  await page.locator('[data-test=code]').fill(formatRoundId(id).toLowerCase());
  await page.locator('[data-test=join]').click();
  await expect(page.getByRole('heading', { name: 'Join a round' })).toBeVisible();
  await expect(page.locator('.code')).toHaveText(formatRoundId(id));
  expect(new URL(page.url()).hash).toBe(`#join=${id}`);
  await page.getByRole('button', { name: 'Home' }).click();
  expect(new URL(page.url()).hash).toBe('');
  expect(seen.errors).toEqual([]);
  expect(seen.outside).toEqual([]);
});

test('one tab plays at a time, and Use here moves the game (Q-16)', async ({ page, context, baseURL }) => {
  const seen = watch(page, baseURL!);
  await page.goto('./');
  await expect(page.locator('[data-test=balance]')).toBeVisible();
  const second = await context.newPage();
  await second.goto('./');
  await expect(second.locator('[data-test=other-tab]')).toBeVisible();
  await second.getByRole('button', { name: 'Use here' }).click();
  await expect(second.locator('[data-test=balance]')).toBeVisible();
  await expect(page.locator('[data-test=other-tab]')).toBeVisible();
  await page.getByRole('button', { name: 'Use here' }).click();
  await expect(page.locator('[data-test=balance]')).toBeVisible();
  await expect(second.locator('[data-test=other-tab]')).toBeVisible();
  expect(seen.errors).toEqual([]);
  expect(seen.outside).toEqual([]);
});

test('Settings checks relays and TURN, and keeps what it saved', async ({ page, baseURL }) => {
  const seen = watch(page, baseURL!);
  await page.goto('./');
  await page.locator('[data-test=settings]').click();
  await expect(page.locator('[data-test=relay-health]')).toHaveText('Relays are contacted when you propose or join a round.');
  await page.locator('[data-test=relays]').fill('ws://insecure.example');
  await page.locator('[data-test=settings-save]').click();
  await expect(page.locator('[data-test=settings-message]')).toContainText('must start with wss://');
  await page.locator('[data-test=relays]').fill('wss://relay.one.example\nwss://relay.two.example');
  await page.locator('[data-test=turn-url]').fill('turns:turn.example:443');
  await page.locator('[data-test=settings-save]').click();
  await expect(page.locator('[data-test=settings-message]')).toContainText('needs its user name');
  await page.locator('[data-test=turn-user]').fill('me');
  await page.locator('[data-test=turn-credential]').fill('secret');
  await page.locator('[data-test=settings-save]').click();
  await expect(page.locator('[data-test=settings-message]')).toHaveText('Saved. Rounds you open from now on use these.');
  await page.reload();
  await page.locator('[data-test=settings]').click();
  await expect(page.locator('[data-test=relays]')).toHaveValue('wss://relay.one.example\nwss://relay.two.example');
  await expect(page.locator('[data-test=turn-user]')).toHaveValue('me');
  expect(seen.errors).toEqual([]);
  expect(seen.outside).toEqual([]);
});
