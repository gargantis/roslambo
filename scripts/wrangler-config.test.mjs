import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// PLAN D-25: Workers static assets only, so no Worker script can ever run,
// and request logs stay off. Ported from amorfus.
const raw = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const config = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ''));

describe('wrangler.jsonc', () => {
  it('is assets-only: no main, no run_worker_first', () => {
    expect(config.main).toBeUndefined();
    expect(config.run_worker_first).toBeUndefined();
    expect(config.assets?.run_worker_first).toBeUndefined();
  });

  it('serves ./dist with not_found_handling none', () => {
    expect(config.assets).toEqual({ directory: './dist', not_found_handling: 'none' });
  });

  it('keeps observability off (C-21)', () => {
    expect(config.observability).toEqual({ enabled: false });
  });

  it('has no route until the domain is chosen (Q-9), and serves on workers.dev meanwhile', () => {
    expect(config.routes).toBeUndefined();
    expect(config.workers_dev).toBe(true);
  });
});
