// Shared helpers for the mesh runs: launch engines, open spike pages,
// collect reports, and check that peers agree at shared checkpoints.

import { chromium, firefox, webkit, type Browser, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

export const BASE = 'http://127.0.0.1:4317/';

export type Engine = 'chromium' | 'firefox' | 'webkit';

export interface Report {
  ua: string;
  me: number;
  localTick: number;
  finalTick: number;
  agree: number;
  disagree: number;
  resyncs: number;
  resyncMs: number[];
  late: number;
  lateVoteFlips: number;
  checkpoints: Record<string, string>;
  peers: number;
  firstPeerMs: number;
  startedMs: number;
  warmMs: number;
  medianOffset: number;
  cpu: { n: number; mean: number; p95: number; max: number };
  net: { sent: number; recv: number; bytesOut: number; bytesIn: number; floodErrors: number };
  heap: number | null;
  [k: string]: unknown;
}

export async function launch(engine: Engine): Promise<Browser> {
  if (engine === 'chromium') return chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--enable-precise-memory-info'] });
  if (engine === 'firefox') {
    return firefox.launch({
      firefoxUserPrefs: {
        'media.peerconnection.ice.obfuscate_host_addresses': false,
        'media.peerconnection.ice.loopback': true,
      },
    });
  }
  return webkit.launch();
}

export async function openPeer(b: Browser, params: Record<string, string | number>): Promise<Page> {
  const page = await b.newPage();
  const u = new URL(BASE);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  await page.goto(u.toString());
  return page;
}

export async function report(page: Page): Promise<Report> {
  return page.evaluate(() => (window as unknown as { spike: { report: () => Report } }).spike.report());
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Checkpoint ticks at or after `from` that every report has. */
export function sharedCheckpoints(reports: Report[], from: number): number[] {
  if (reports.length === 0) return [];
  return Object.keys(reports[0]!.checkpoints)
    .map(Number)
    .filter((t) => t >= from && reports.every((r) => r.checkpoints[t] !== undefined))
    .sort((a, b) => a - b);
}

export function disagreements(reports: Report[], ticks: number[]): number[] {
  return ticks.filter((t) => new Set(reports.map((r) => r.checkpoints[t])).size > 1);
}

export function save(name: string, data: unknown): void {
  mkdirSync('results', { recursive: true });
  writeFileSync(`results/${name}.json`, JSON.stringify(data, null, 1));
}
