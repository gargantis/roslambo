import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ringSum } from '../../config';
import { DEFAULT_SETTINGS, makeParams } from './params';
import { JOIN, LEFT, READY, RIGHT, step, THRUST, type PlayerInput } from './rules';
import { genesis, RUNNING, type RoundState } from './state';
import { kineticEnergy, NO_GRAVITY, paramsWith, running, testId } from './testing';

const P = makeParams();

/** A pre-start ring of n present players, nobody ready. */
function ring(n: number, params = P): { s: RoundState; present: PlayerInput[] } {
  const s = genesis({ ante: 5, minPlayers: 3, maxPlayers: Math.max(3, n) });
  const join = Array.from({ length: n }, (_, k) => ({ id: testId(k), buttons: 0, events: JOIN }));
  step(s, join, params);
  return { s, present: join.map((j) => ({ ...j, events: 0 })) };
}

function roundness(s: RoundState, cx: number, cy: number, R: number): number {
  return Math.max(...s.planets.map((p) => Math.abs(Math.hypot(p.x - cx, p.y - cy) - R) / R));
}

describe('the ring (D-5)', () => {
  it('matches the appendix speed without softening', () => {
    const Pn = paramsWith({ softening: 0 });
    for (let n = 2; n <= 12; n++) {
      // ω²R = Gm·S_N/R², so ω²R³/Gm is S_N. Binary angles can't hold k/n of
      // a turn exactly (TURN/3 isn't whole), hence 1e-8, not 1e-15.
      const w = Pn.ringOmega(n);
      expect((w * w * Pn.ringRadius ** 3) / Pn.gm).toBeCloseTo(ringSum(n), 8);
    }
  });

  it('holds every ring size up to the cap within 1% for 10 minutes', () => {
    for (let n = 1; n <= 8; n++) {
      const { s, present } = ring(n);
      let worst = 0;
      for (let t = 0; t < 36_000; t++) {
        step(s, present, P);
        if (t % 60 === 0) worst = Math.max(worst, roundness(s, P.cx, P.cy, P.ringRadius));
      }
      expect(worst, `n = ${n}`).toBeLessThan(0.01);
    }
  });

  it('breaks up without the correction, as the appendix says', () => {
    const Pn = paramsWith({ softening: 0, correctionFactor: 0 });
    const { s, present } = ring(3, Pn);
    const period = (2 * Math.PI) / Pn.ringOmega(3);
    let brokeAt = Infinity;
    for (let t = 1; t <= 20 * period * 60 && brokeAt === Infinity; t++) {
      step(s, present, Pn);
      const cx = s.planets.reduce((a, p) => a + p.x, 0) / 3;
      const cy = s.planets.reduce((a, p) => a + p.y, 0) / 3;
      if (roundness(s, cx, cy, Pn.ringRadius) > 0.1) brokeAt = t / 60 / period;
    }
    expect(brokeAt).toBeLessThan(20); // orbits
  });

  it('turns slower than the maximum rotation with the most players', () => {
    expect(P.ringRate(8)).toBeLessThan(P.maxRate);
  });
});

describe('contacts (D-4)', () => {
  const Pc = paramsWith(NO_GRAVITY);

  it('conserves the pair kinetic energy in every planet bounce', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
        fc.double({ min: 0.05, max: 3, noNaN: true }),
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: -3, max: 3, noNaN: true }),
        (th, speed, wx, wy) => {
          const nx = Math.cos(th);
          const ny = Math.sin(th);
          const gap = Pc.twoR * 1.0005;
          // b approaches a along -n at `speed`, plus a shared drift (wx, wy).
          const s = running([
            { x: 0.5, y: 0.5, vx: wx * 0.1, vy: wy * 0.1 },
            { x: 0.5 + gap * nx, y: 0.5 + gap * ny, vx: wx * 0.1 - speed * nx, vy: wy * 0.1 - speed * ny },
          ]);
          const before = kineticEnergy(s);
          step(s, [], Pc);
          return Math.abs(kineticEnergy(s) - before) <= 1e-12 * before;
        },
      ),
      { numRuns: 300 },
    );
  });

  it('takes the configured fraction of energy at a wall, and only there', () => {
    const s = running([{ x: 0.9, y: 0.5, vx: 1, vy: 0.3 }]);
    const before = kineticEnergy(s);
    while (s.planets[0]!.vx > 0) step(s, [], Pc);
    expect(kineticEnergy(s)).toBeCloseTo(before * (1 - DEFAULT_SETTINGS.wallEnergyLoss), 12);
  });

  it('never tunnels at 5 arena widths per second', () => {
    // Into a wall.
    const s = running([{ x: 0.5, y: 0.5, vx: 5, vy: 1.3 }]);
    for (let t = 0; t < 600; t++) {
      step(s, [], Pc);
      const p = s.planets[0]!;
      expect(p.x).toBeGreaterThanOrEqual(Pc.r - 1e-12);
      expect(p.x).toBeLessThanOrEqual(1 - Pc.r + 1e-12);
    }
    // Two planets head on at 5 each: they bounce, they never pass.
    const h = running([{ x: 0.2, y: 0.5, vx: 5 }, { x: 0.8, y: 0.5, vx: -5 }]);
    let bounced = false;
    for (let t = 0; t < 12; t++) {
      step(h, [], Pc);
      expect(h.planets[0]!.x).toBeLessThan(h.planets[1]!.x);
      if (h.planets[0]!.vx < 0) bounced = true;
    }
    expect(bounced).toBe(true);
  });
});

describe('rotation and thrust', () => {
  const Pc = paramsWith(NO_GRAVITY);
  const hold = (b: number): PlayerInput[] => [{ id: testId(0), buttons: b, events: 0 }];

  it('reaches the maximum rate from rest in half a second, then stops there', () => {
    const s = running([{ x: 0.5, y: 0.5 }]);
    for (let t = 0; t < 30; t++) step(s, hold(LEFT), Pc);
    expect(s.planets[0]!.rate).toBe(Pc.maxRate);
    step(s, hold(LEFT), Pc);
    expect(s.planets[0]!.rate).toBe(Pc.maxRate);
    for (let t = 0; t < 70; t++) step(s, hold(RIGHT), Pc);
    expect(s.planets[0]!.rate).toBe(-Pc.maxRate);
  });

  it('conserves rotation without input, and both buttons cancel', () => {
    const s = running([{ x: 0.5, y: 0.5, rate: 12345 }]);
    const a0 = s.planets[0]!.angle;
    for (let t = 0; t < 100; t++) step(s, t % 2 ? [] : hold(LEFT | RIGHT), Pc);
    expect(s.planets[0]!.rate).toBe(12345);
    expect(s.planets[0]!.angle).toBe((a0 + 100 * 12345) >>> 0);
  });

  it('leaves rotation alone through bounces', () => {
    const s = running([{ x: 0.5, y: 0.5, vx: 2, rate: 777 }, { x: 0.6, y: 0.5, vx: -2, rate: -555 }]);
    for (let t = 0; t < 120; t++) step(s, [], Pc);
    expect(s.planets.map((p) => p.rate)).toEqual([777, -555]);
  });

  it('pushes the way the planet faces, and only while running', () => {
    const s = running([{ x: 0.5, y: 0.5, angle: 0x40000000 }]); // facing +y
    step(s, hold(THRUST), Pc);
    expect(s.planets[0]!.vy).toBeCloseTo(DEFAULT_SETTINGS.thrust / 60, 12);
    expect(Math.abs(s.planets[0]!.vx)).toBeLessThan(1e-15);
    const pre = genesis({ ante: 5, minPlayers: 3, maxPlayers: 3 });
    step(pre, [{ id: testId(0), buttons: THRUST, events: JOIN | READY }], P);
    const v = Math.hypot(pre.planets[0]!.vx, pre.planets[0]!.vy);
    step(pre, hold(THRUST), P);
    expect(Math.hypot(pre.planets[0]!.vx, pre.planets[0]!.vy)).toBe(v); // a lone planet rests, thrust or not
    expect(pre.phase).not.toBe(RUNNING);
  });
});
