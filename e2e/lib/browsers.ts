// Launching each engine so WebRTC works between pages on one machine:
// Chromium without mDNS host candidates, Firefox with real host addresses
// and loopback. Trystero rewrites the rest to loopback (room-config.ts).

import { chromium, firefox, webkit, type Browser, type Page } from '@playwright/test';

export type Engine = 'chromium' | 'firefox' | 'webkit';

export function launch(engine: Engine): Promise<Browser> {
  if (engine === 'chromium') return chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  if (engine === 'firefox') {
    return firefox.launch({
      firefoxUserPrefs: { 'media.peerconnection.ice.obfuscate_host_addresses': false, 'media.peerconnection.ice.loopback': true },
    });
  }
  return webkit.launch();
}

export interface NetReport {
  me: string;
  role: string;
  started: boolean;
  timeline: string;
  finalTick: number;
  phase: number;
  freezeTick: number;
  roster: string[];
  points: number[];
  peers: number;
  refused: boolean;
  stats: { resyncs: number; disagree: number; late: number; sent: number; received: number };
  cpu: { mean: number; p95: number; max: number } | null;
}

/** A page running the production bundle's #test=net mode. */
export async function openNetPage(b: Browser, base: string, params: Record<string, string | number>): Promise<{ page: Page; errors: string[] }> {
  const page = await b.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const hash = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  await page.goto(`${base}#test=net&${hash.toString()}`);
  await page.waitForFunction(() => window.roslamboNet !== undefined, null, { timeout: 30_000 });
  return { page, errors };
}

export function report(page: Page): Promise<NetReport> {
  return page.evaluate(() => window.roslamboNet!.report() as unknown as NetReport);
}

export function hashAt(page: Page, t: number): Promise<string> {
  return page.evaluate((tick) => window.roslamboNet!.hashAt(tick), t);
}
