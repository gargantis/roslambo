import { describe, expect, it } from 'vitest';
import { dir, fractionOfTurn, QUARTER_TURN, TURN } from './angle';

describe('binary angles (D-2)', () => {
  it('dir() is within 1e-15 of Math.cos and Math.sin everywhere', () => {
    const d = new Float64Array(2);
    let worst = 0;
    for (let i = 0; i < 200_000; i++) {
      const a = Math.imul(i, 2654435761) >>> 0;
      dir(a, d);
      const th = (a / TURN) * 2 * Math.PI;
      worst = Math.max(worst, Math.abs(d[0]! - Math.cos(th)), Math.abs(d[1]! - Math.sin(th)));
    }
    expect(worst).toBeLessThan(1e-15);
  });

  it('is exact on the axes and continuous across octant boundaries', () => {
    const d = new Float64Array(2);
    // ±0 compare equal: a cosine of −0 is the same number, and deterministic.
    dir(0, d);
    expect(d[0] === 1 && d[1] === 0).toBe(true);
    dir(QUARTER_TURN, d);
    expect(d[0] === 0 && d[1] === 1).toBe(true);
    for (let oct = 1; oct < 8; oct++) {
      const b = oct * 536870912;
      const e = new Float64Array(2);
      dir(b - 1, d);
      dir(b, e);
      expect(Math.abs(d[0]! - e[0]!) + Math.abs(d[1]! - e[1]!)).toBeLessThan(1e-8);
    }
  });

  it('splits a turn into n equal binary angles', () => {
    expect(fractionOfTurn(0, 7)).toBe(0);
    expect(fractionOfTurn(1, 4)).toBe(QUARTER_TURN);
    expect(fractionOfTurn(1, 3)).toBe(Math.floor(TURN / 3));
    expect(fractionOfTurn(7, 7)).toBe(0); // a whole turn wraps
  });
});
