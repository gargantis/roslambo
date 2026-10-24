import { describe, expect, it } from 'vitest';
import {
  config, countdownTicks, gm, maxRateUnits, playersCap, rateAccelUnits, ringCapacity, ringRadius,
  ringSum, ringTurnsPerSecond,
} from './config';

// PLAN §7.5: the settings must stay consistent with each other.
describe('config', () => {
  it('reproduces the ring speeds of the requirements appendix', () => {
    const v = (n: number) => Math.sqrt(ringSum(n));
    const table: [number, number][] = [[4, 1.29], [5, 1.54], [6, 1.78], [8, 2.2], [10, 2.59], [12, 2.94], [16, 3.58], [20, 4.15]];
    for (const [n, ratio] of table) expect(v(n) / v(3)).toBeCloseTo(ratio, 2);
    expect(ringSum(1)).toBe(0);
    expect(ringSum(2)).toBeCloseTo(0.25, 12);
  });

  it('keeps the maximum rotation above the ring rate at the most players', () => {
    expect(config.maxRotationTurnsPerSecond).toBeGreaterThan(ringTurnsPerSecond(playersCap));
  });

  it('fits the mesh cap on the ring, and at least the minimum', () => {
    expect(ringCapacity).toBeGreaterThanOrEqual(config.maxPlayersCap);
    expect(playersCap).toBe(config.maxPlayersCap);
    expect(config.minPlayers).toBeGreaterThanOrEqual(3);
    expect(playersCap).toBeGreaterThanOrEqual(config.minPlayers);
  });

  it('keeps the ring inside the arena with a positive Gm', () => {
    expect(ringRadius).toBeGreaterThan(0);
    expect(ringRadius + config.planetRadius).toBeLessThan(config.arenaSide / 2);
    expect(gm).toBeGreaterThan(0);
  });

  it('cannot tunnel at 5 arena sides per second (D-4)', () => {
    const perSubstep = 5 / (config.tickRate * config.substeps);
    expect(perSubstep).toBeLessThan(config.planetRadius); // into a wall
    expect(2 * perSubstep).toBeLessThan(2 * config.planetRadius); // two planets head on
  });

  it('turns rotation settings into the binary-angle units of D-2', () => {
    expect(maxRateUnits).toBe(71582788);
    expect(rateAccelUnits).toBe(2386093);
    // Half a second from rest to the maximum (REQUIREMENTS "Rotation acceleration").
    expect(Math.round(maxRateUnits / rateAccelUnits)).toBe(config.tickRate / 2);
  });

  it('keeps the timeline windows inside the state history', () => {
    expect(countdownTicks).toBe(600);
    expect(config.lateWindowTicks + config.voteWindowTicks + config.inputDelayTicks).toBeLessThan(config.stateHistoryTicks);
    expect(config.inputHistoryTicks).toBeGreaterThanOrEqual(config.inputDelayTicks + config.lateWindowTicks);
  });
});
