import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

// PLAN §13: the project config applies each rule where it belongs.
describe('eslint project config', () => {
  const eslint = new ESLint({ cwd: root });
  const lint = async (code, filePath) => (await eslint.lintText(code, { filePath }))[0];

  it('fails the banned-ops fixture under src/core/sim/', async () => {
    const code = await readFile(new URL('./fixtures/sim-banned.ts.fixture', import.meta.url), 'utf8');
    const res = await lint(code, 'src/core/sim/fixture.ts');
    // sin, pow, **, Date, performance, random, hypot, atan2.
    expect(res.errorCount).toBeGreaterThanOrEqual(8);
  });

  it('allows exact ops under src/core/sim/', async () => {
    const res = await lint('export const f = (x: number): number => Math.fround(Math.sqrt(x));\n', 'src/core/sim/ok.ts');
    expect(res.errorCount).toBe(0);
  });

  it('leaves render code free to use Math.sin', async () => {
    const res = await lint('export const f = (x: number): number => Math.sin(x);\n', 'src/render/ok.ts');
    expect(res.errorCount).toBe(0);
  });

  it('keeps src/core free of the DOM, timers and clocks', async () => {
    const res = await lint('document.title = "x"; setTimeout(() => 0, 1); performance.now();\nexport {};\n', 'src/core/timeline/bad.ts');
    expect(res.errorCount).toBeGreaterThanOrEqual(3);
  });

  it('allows Trystero only in src/net/trystero.ts', async () => {
    const code = 'import { joinRoom } from "@trystero-p2p/nostr";\nexport const j = joinRoom;\n';
    expect((await lint(code, 'src/ui/bad.ts')).errorCount).toBeGreaterThanOrEqual(1);
    expect((await lint(code, 'src/net/trystero.ts')).errorCount).toBe(0);
  });

  it('allows localStorage only in src/storage', async () => {
    const code = 'localStorage.setItem("k", "v");\nexport {};\n';
    expect((await lint(code, 'src/ui/bad.ts')).errorCount).toBeGreaterThanOrEqual(1);
    expect((await lint(code, 'src/storage/profile.ts')).errorCount).toBe(0);
  });
});
