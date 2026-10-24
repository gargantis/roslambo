// Simulation parameters: the settings of src/config.ts, and the constants
// derived from them with exact operations only (D-1), so every engine
// derives the same bits. The tuning page passes its own settings.

import { config } from '../../config';
import { dir, fractionOfTurn, TURN } from './angle';

export interface SimSettings {
  tickRate: number;
  substeps: number;
  planetRadius: number;
  ringMargin: number;
  ringPeriod3Seconds: number;
  softening: number;
  thrust: number;
  wallEnergyLoss: number;
  correctionFactor: number;
  rearmGapDiameters: number;
  countdownSeconds: number;
  readyExpirySeconds: number;
  absenceTicks: number;
  maxRotationTurnsPerSecond: number;
  rotationAccelTurnsPerSecond2: number;
}

export const DEFAULT_SETTINGS: SimSettings = {
  tickRate: config.tickRate,
  substeps: config.substeps,
  planetRadius: config.planetRadius,
  ringMargin: config.ringMargin,
  ringPeriod3Seconds: config.ringPeriod3Seconds,
  softening: config.softening,
  thrust: config.thrust,
  wallEnergyLoss: config.wallEnergyLoss,
  correctionFactor: config.correctionFactor,
  rearmGapDiameters: config.rearmGapDiameters,
  countdownSeconds: config.countdownSeconds,
  readyExpirySeconds: config.readyExpirySeconds,
  absenceTicks: config.absenceTicks,
  maxRotationTurnsPerSecond: config.maxRotationTurnsPerSecond,
  rotationAccelTurnsPerSecond2: config.rotationAccelTurnsPerSecond2,
};

/** A wall as a half-plane: inside is nx·x + ny·y ≤ c, with (nx, ny) a unit
 *  outward normal (D-6). */
export interface Wall {
  nx: number;
  ny: number;
  c: number;
}

/** The unit square, its centre, and its inscribed radius. */
const SQUARE = {
  walls: [
    { nx: -1, ny: 0, c: 0 },
    { nx: 1, ny: 0, c: 1 },
    { nx: 0, ny: -1, c: 0 },
    { nx: 0, ny: 1, c: 1 },
  ] as Wall[],
  cx: 0.5,
  cy: 0.5,
  inradius: 0.5,
};

const TWO_PI = 2 * Math.PI;
const MAX_RING = 256;

export interface SimParams {
  readonly settings: SimSettings;
  readonly dt: number; // one substep, s
  readonly r: number;
  readonly twoR: number;
  readonly minD2: number; // (2r)², the closest gravity ever acts from
  readonly eps2: number; // softening²
  readonly releaseD2: number; // a scoring pair re-arms when its centres are farther apart than this, squared
  readonly wallK: number; // speed factor per wall bounce
  readonly walls: readonly Wall[];
  readonly cx: number;
  readonly cy: number;
  readonly ringRadius: number;
  readonly gm: number;
  readonly maxRate: number; // binary-angle units per tick
  readonly rateAcc: number; // per tick, per tick
  readonly countdownTicks: number;
  readonly readyExpiryTicks: number;
  /** The ring's angular speed with n planets, rad/s (0 below 2). */
  ringOmega(n: number): number;
  /** The same in binary-angle units per tick: the ring's phase step and the
   *  default rotation rate (D-5). */
  ringRate(n: number): number;
}

/** Inward acceleration on one planet of an n-ring of radius R, per unit Gm,
 *  under softened gravity. With ε = 0 this is S_N / R² (the appendix). */
function ringPull(n: number, R: number, eps2: number): number {
  const d = new Float64Array(2);
  let inward = 0;
  for (let k = 1; k < n; k++) {
    dir(fractionOfTurn(k, n), d);
    const dx = R * (d[0]! - 1);
    const dy = R * d[1]!;
    const s2 = dx * dx + dy * dy + eps2;
    inward -= dx / (s2 * Math.sqrt(s2));
  }
  return inward;
}

export function makeParams(settings: SimSettings = DEFAULT_SETTINGS): SimParams {
  const r = settings.planetRadius;
  const ringRadius = SQUARE.inradius - r - settings.ringMargin;
  const eps2 = settings.softening * settings.softening;
  // Gm from the 3-planet ring period: ω₃²·R = Gm · pull(3).
  const w3 = TWO_PI / settings.ringPeriod3Seconds;
  const gm = (w3 * w3 * ringRadius) / ringPull(3, ringRadius, eps2);
  const omega = new Float64Array(MAX_RING + 1).fill(-1);
  const rate = new Float64Array(MAX_RING + 1).fill(-1);
  const ringOmega = (n: number): number => {
    if (n < 2) return 0;
    if (omega[n]! < 0) omega[n] = Math.sqrt((gm * ringPull(n, ringRadius, eps2)) / ringRadius);
    return omega[n]!;
  };
  const ringRate = (n: number): number => {
    if (n < 2) return 0;
    if (rate[n]! < 0) rate[n] = Math.round(((ringOmega(n) / TWO_PI) * TURN) / settings.tickRate);
    return rate[n]!;
  };
  const twoR = 2 * r;
  // Touching centres are 2r apart; the surfaces must open a further gap,
  // counted in planet diameters (C-16).
  const release = twoR + settings.rearmGapDiameters * twoR;
  return {
    settings,
    dt: 1 / (settings.tickRate * settings.substeps),
    r,
    twoR,
    minD2: twoR * twoR,
    eps2,
    releaseD2: release * release,
    wallK: Math.sqrt(1 - settings.wallEnergyLoss),
    walls: SQUARE.walls,
    cx: SQUARE.cx,
    cy: SQUARE.cy,
    ringRadius,
    gm,
    maxRate: Math.round((TURN * settings.maxRotationTurnsPerSecond) / settings.tickRate),
    rateAcc: Math.round((TURN * settings.rotationAccelTurnsPerSecond2) / (settings.tickRate * settings.tickRate)),
    countdownTicks: settings.countdownSeconds * settings.tickRate,
    readyExpiryTicks: settings.readyExpirySeconds * settings.tickRate,
    ringOmega,
    ringRate,
  };
}
