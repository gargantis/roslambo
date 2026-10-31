// PLAN M3 exit: 8 players and 4 spectators (the Q-3 cap) as 12 Chromium
// pages on one machine, over the local relay, for LOAD_SECONDS (default
// 90). Every peer must agree; CPU per tick and traffic are recorded in
// research/load/results.json.

import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { hashAt, launch, openNetPage, report } from './lib/browsers';
import { startNostrRelay } from '../vendor/hermet/nostr-relay.mjs';

const SECONDS = Number(process.env.LOAD_SECONDS ?? 90);

test('8 players and 4 spectators stay in step', async ({ baseURL }) => {
  test.setTimeout((SECONDS + 240) * 1000);
  const relay = await startNostrRelay();
  // A high ante keeps the round running for the whole measurement.
  const common = { room: `load-${Date.now()}`, relay: `ws://127.0.0.1:${relay.port}`, ante: 500, seed: 3 };
  const browser = await launch('chromium');
  try {
    const pages = [];
    for (let k = 1; k <= 8; k++) {
      pages.push(await openNetPage(browser, baseURL!, { ...common, k, role: k === 1 ? 'keeper' : 'player', ready: 8000 }));
    }
    for (let k = 9; k <= 12; k++) pages.push(await openNetPage(browser, baseURL!, { ...common, k, role: 'spectator' }));
    await pages[0]!.page.waitForTimeout(SECONDS * 1000);
    const reports = await Promise.all(pages.map((p) => report(p.page)));
    const tick = Math.min(...reports.map((r) => r.finalTick));
    const hashes = await Promise.all(pages.map((p) => hashAt(p.page, tick)));
    mkdirSync('research/load', { recursive: true });
    writeFileSync('research/load/results.json', JSON.stringify({ seconds: SECONDS, cores: cpus().length, tick, reports }, null, 1));
    for (const r of reports) {
      console.log(`${r.role.padEnd(9)} ${r.me.slice(-2)}: phase ${r.phase}, final ${r.finalTick}, peers ${r.peers}, resyncs ${r.stats.resyncs}, disagree ${r.stats.disagree}, late ${r.stats.late}, recv ${(r.stats.received / SECONDS).toFixed(0)}/s, cpu mean ${r.cpu?.mean.toFixed(2)} p95 ${r.cpu?.p95?.toFixed(2)} max ${r.cpu?.max?.toFixed(1)} ms`);
    }
    expect(reports.every((r) => r.peers === 11)).toBe(true);
    expect(reports[0]!.roster).toHaveLength(8);
    expect(new Set(hashes).size, `state at tick ${tick}`).toBe(1);
    for (const p of pages) expect(p.errors).toEqual([]);
  } finally {
    await browser.close();
    await relay.close();
  }
});
