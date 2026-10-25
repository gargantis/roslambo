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
