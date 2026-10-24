// M0 run 1: the scripted simulation, offline, must hash identically in
// Node and in this engine, checkpoint by checkpoint.

import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface Run { n: number; ticks: number; contacts: number; hashes: string[] }

test('the golden suite matches Node bit for bit', async ({ page, browserName }) => {
  const cli = fileURLToPath(new URL('../src/golden-cli.ts', import.meta.url));
  const node = JSON.parse(execFileSync(process.execPath, [cli], { encoding: 'utf8' })) as { engine: string; ms: number; runs: Run[] };
  await page.goto('./?mode=golden');
  await page.waitForFunction(() => (window as unknown as { spike?: { golden?: unknown } }).spike?.golden, null, { timeout: 180_000 });
  const got = await page.evaluate(() => {
    const s = (window as unknown as { spike: { golden: { ms: number; runs: Run[] } } }).spike;
    return { ua: navigator.userAgent, ...s.golden };
  });
  mkdirSync('results', { recursive: true });
  writeFileSync('results/golden-node.json', JSON.stringify(node));
  writeFileSync(`results/golden-${browserName}.json`, JSON.stringify(got));
  for (let i = 0; i < node.runs.length; i++) {
    const want = node.runs[i]!;
    const have = got.runs[i]!;
    const first = want.hashes.findIndex((h, k) => h !== have.hashes[k]);
    expect(first, `n=${want.n}: first differing checkpoint`).toBe(-1);
    expect(have.contacts, `n=${want.n}: contact count`).toBe(want.contacts);
  }
});
