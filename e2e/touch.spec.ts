// Multi-touch on the on-screen buttons (PLAN §11, M4 exit), on a phone-
// sized page with touch, in Chromium, whose DevTools protocol can press
// several fingers at once. The bench page shows the buttons without a
// network. The reference phone repeats this by hand (docs/acceptance.md).

import { expect, test, type Locator } from '@playwright/test';

test.use({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, hasTouch: true, isMobile: true });

async function centre(l: Locator): Promise<{ x: number; y: number }> {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test('two fingers hold two buttons, and a finger that slides off still lets go', async ({ page }) => {
  await page.goto('./#test=frames&seconds=600');
  const left = page.getByRole('button', { name: 'Rotate left (A)' });
  const right = page.getByRole('button', { name: 'Rotate right (D)' });
  await expect(left).toBeVisible();
  const a = await centre(left);
  const b = await centre(right);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]): Promise<unknown> =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });

  await touch('touchStart', [{ ...a, id: 1 }]);
  await touch('touchStart', [{ ...a, id: 1 }, { ...b, id: 2 }]);
  await expect(left).toHaveClass(/held/);
  await expect(right).toHaveClass(/held/);

  // Finger 1 slides off onto the arena: its button stays held until it lifts.
  await touch('touchMove', [{ x: a.x, y: a.y - 250, id: 1 }, { ...b, id: 2 }]);
  await expect(left).toHaveClass(/held/);
  // touchEnd lifts the points it lists.
  await touch('touchEnd', [{ x: a.x, y: a.y - 250, id: 1 }]);
  await expect(left).not.toHaveClass(/held/);
  await expect(right).toHaveClass(/held/);
  await touch('touchEnd', [{ ...b, id: 2 }]);
  await expect(right).not.toHaveClass(/held/);
});

test('keys hold the same buttons, together, by physical position', async ({ page }) => {
  await page.goto('./#test=frames&seconds=600');
  const left = page.getByRole('button', { name: 'Rotate left (A)' });
  const right = page.getByRole('button', { name: 'Rotate right (D)' });
  await expect(left).toBeVisible();
  await page.keyboard.down('KeyA');
  await page.keyboard.down('KeyD');
  await expect(left).toHaveClass(/held/);
  await expect(right).toHaveClass(/held/);
  await page.keyboard.up('KeyA');
  await expect(left).not.toHaveClass(/held/);
  await page.keyboard.up('KeyD');
  await expect(right).not.toHaveClass(/held/);
});
