import { describe, expect, it } from 'vitest';
import { INK, PLANET_COLOURS } from './palette';

// OKLab (Björn Ottosson, 2020) and the Machado, Oliveira and Fernandes
// (2009) dichromacy matrices at full severity, applied in linear RGB.
const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (hex: string): number[] => [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
function oklab([r, g, b]: number[]): number[] {
  const l = Math.cbrt(0.4122214708 * r! + 0.5363325363 * g! + 0.0514459929 * b!);
  const m = Math.cbrt(0.2119034982 * r! + 0.6806995451 * g! + 0.1073969566 * b!);
  const s = Math.cbrt(0.0883024619 * r! + 0.2817188376 * g! + 0.6299787005 * b!);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const CVD: Record<string, number[][]> = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const see = (M: number[][], c: number[]): number[] => M.map((row) => Math.min(1, Math.max(0, row[0]! * c[0]! + row[1]! * c[1]! + row[2]! * c[2]!)));
const dist = (p: number[], q: number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const luminance = (c: number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;

const colours = PLANET_COLOURS.map(rgb);

/** Every pair of planets that are hunter and quarry for some N ≤ 12. */
function neighbours(): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i + 1 < colours.length; i++) pairs.push([i, i + 1]);
  for (let n = 3; n <= colours.length; n++) pairs.push([0, n - 1]);
  return pairs;
}

describe('the planet palette (PLAN §12)', () => {
  it('has 12 colours', () => {
    expect(new Set(PLANET_COLOURS).size).toBe(12);
  });

  it('carries a dark number on every colour at 7:1 contrast or more', () => {
    const ink = luminance(rgb(INK));
    for (const [i, c] of colours.entries()) expect((luminance(c) + 0.05) / (ink + 0.05), PLANET_COLOURS[i]).toBeGreaterThanOrEqual(7);
  });

  it('keeps every pair apart for normal colour vision', () => {
    const labs = colours.map(oklab);
    for (let i = 0; i < labs.length; i++) {
      for (let j = i + 1; j < labs.length; j++) expect(dist(labs[i]!, labs[j]!), `${i + 1} and ${j + 1}`).toBeGreaterThan(0.12);
    }
  });

  for (const [kind, M] of Object.entries(CVD)) {
    it(`keeps every hunter and quarry apart under ${kind}`, () => {
      const labs = colours.map((c) => oklab(see(M, c)));
      for (const [i, j] of neighbours()) expect(dist(labs[i]!, labs[j]!), `${i + 1} and ${j + 1}`).toBeGreaterThan(0.1);
    });
  }
});
