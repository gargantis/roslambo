// The M1 skeleton loads in every engine: the module runs, nothing logs an
// error, and no request leaves the local server (PLAN §14 "Everywhere").

import { expect, test } from '@playwright/test';

test('the page loads without errors or outside requests', async ({ page, baseURL }) => {
  const errors: string[] = [];
  const outside: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    if (!r.url().startsWith(baseURL!)) outside.push(r.url());
  });
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  await expect(page).toHaveTitle('roslambo');
  await expect(page.locator('#status')).toHaveText('In development.');
  expect(errors).toEqual([]);
  expect(outside).toEqual([]);
});
