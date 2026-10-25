import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { auditDist } from './audit-dist-core.mjs';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// PLAN §13: the dist audit fails on each planted violation. This is its
// planted-failure self-test (ported from amorfus).

let dir;
const opts = (over = {}) => ({ allowedHosts: ['relay.damus.io', 'stun.cloudflare.com'], expectedLicensePackages: [], ...over });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'roslambo-audit-'));
  await writeFile(join(dir, 'index.html'), '<!doctype html><script type="module" src="./assets/a.js"></script>');
  await mkdir(join(dir, 'assets'), { recursive: true });
  await writeFile(join(dir, 'assets', 'a.js'), 'console.log("hi")');
  await writeFile(join(dir, 'THIRD-PARTY-LICENSES.txt'), 'Third-party notices.\n');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const whys = (r) => r.findings.map((f) => f.why);

describe('audit-dist', () => {
  it('passes a clean dist', async () => {
    expect((await auditDist(dir, opts())).findings).toEqual([]);
  });

  it('fails on a root-absolute URL in HTML, CSS or JS', async () => {
    await writeFile(join(dir, 'index.html'), '<script src="/assets/a.js"></script>');
    await writeFile(join(dir, 'assets', 's.css'), 'body { background: url(/bg.png); }');
    await writeFile(join(dir, 'assets', 'a.js'), 'fetch("/api/x")');
    expect(whys(await auditDist(dir, opts())).filter((w) => w === 'root-absolute URL')).toHaveLength(3);
  });

  it('fails on an unresolved relative reference', async () => {
    await writeFile(join(dir, 'index.html'), '<script type="module" src="./assets/missing.js"></script>');
    expect(whys(await auditDist(dir, opts()))).toContain('unresolved reference');
  });

  it('fails on a host missing from third-party.json, loopback included', async () => {
    await writeFile(join(dir, 'assets', 'a.js'), 'fetch("https://evil.example.com/x"); new WebSocket("ws://127.0.0.1:1")');
    const r = await auditDist(dir, opts());
    expect(r.findings.filter((f) => f.why === 'host not in third-party.json').map((f) => f.detail)).toEqual(['evil.example.com', '127.0.0.1']);
  });

  it('allows listed hosts, STUN URLs included, and ignores URLs in JS comments', async () => {
    await writeFile(join(dir, 'assets', 'a.js'), '// https://evil.example.com\nconst r = "wss://relay.damus.io"; const s = "stun:stun.cloudflare.com:3478";');
    expect((await auditDist(dir, opts())).findings).toEqual([]);
  });

  it('reads a scheme only where a word starts, so minified CSS is not a URL', async () => {
    await writeFile(join(dir, 'assets', 's.css'), '.a{grid-template-rows:auto auto;grid-template-columns:1fr}.b{background:url(wss://evil.example.com)}');
    const r = await auditDist(dir, opts());
    expect(r.findings.filter((f) => f.why === 'host not in third-party.json').map((f) => f.detail)).toEqual(['evil.example.com']);
  });

  it('fails on dotfiles, markdown and source maps', async () => {
    await writeFile(join(dir, '.hidden'), '');
    await writeFile(join(dir, 'CLAUDE.md'), '');
    await writeFile(join(dir, 'assets', 'a.js.map'), '{}');
    expect(whys(await auditDist(dir, opts())).filter((w) => w === 'forbidden file')).toHaveLength(3);
  });

  it('fails on an extension outside the allowlist, and on files over 25 MiB', async () => {
    await writeFile(join(dir, 'assets', 'x.exe'), '');
    await writeFile(join(dir, 'assets', 'big.js'), Buffer.alloc(25 * 1024 * 1024 + 1));
    const w = whys(await auditDist(dir, opts()));
    expect(w).toContain('extension not allowlisted');
    expect(w).toContain('file over 25 MiB');
  });

  it('fails on secret patterns', async () => {
    await writeFile(join(dir, 'assets', 'a.js'), 'const k = "AKIAIOSFODNN7EXAMPLE"');
    expect(whys(await auditDist(dir, opts()))).toContain('secret pattern');
  });

  it('fails when the licence notices are missing or list the wrong packages', async () => {
    await writeFile(join(dir, 'THIRD-PARTY-LICENSES.txt'), '## left-pad@1.0.0\nMIT\n');
    expect(whys(await auditDist(dir, opts()))).toContain('licence list mismatch');
    expect(whys(await auditDist(dir, opts({ expectedLicensePackages: ['@trystero-p2p/core'] })))).toContain('licence list mismatch');
    await rm(join(dir, 'THIRD-PARTY-LICENSES.txt'));
    expect(whys(await auditDist(dir, opts()))).toContain('missing licence notices');
  });
});
