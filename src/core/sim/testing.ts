// Helpers for the simulation tests: hand-placed states and settings that
// isolate one effect. Never imported by shipped code.

import { DEFAULT_SETTINGS, makeParams, type SimParams, type SimSettings } from './params';
import { genesis, RUNNING, type Planet, type RoundState } from './state';

export const testId = (k: number): string => (k + 1).toString(16).padStart(32, '0');

export function paramsWith(over: Partial<SimSettings>): SimParams {
  return makeParams({ ...DEFAULT_SETTINGS, ...over });
}

/** Gravity too weak to matter: isolates contacts and walls. */
export const NO_GRAVITY: Partial<SimSettings> = { ringPeriod3Seconds: 1e9 };

export interface Placed {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  angle?: number;
  rate?: number;
  points?: number;
}

/** A running round with planets exactly where the test puts them. */
export function running(placed: Placed[], ante = 5): RoundState {
  const s = genesis({ ante, minPlayers: 3, maxPlayers: Math.max(3, placed.length) });
  s.phase = RUNNING;
  s.countdownStart = 0;
  s.planets = placed.map((p, k): Planet => ({
    id: testId(k), name: '', joinTick: 0, readyUntil: 0, lastInputTick: 0,
    points: p.points ?? ante, angle: p.angle ?? 0, rate: p.rate ?? 0,
    x: p.x, y: p.y, vx: p.vx ?? 0, vy: p.vy ?? 0, engaged: 0,
  }));
  return s;
}

export function kineticEnergy(s: RoundState): number {
  return s.planets.reduce((e, p) => e + 0.5 * (p.vx * p.vx + p.vy * p.vy), 0);
}
