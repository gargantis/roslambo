// Scripted inputs for the spike: a stateless hash of (seed, tick segment),
// so any tick's buttons can be recomputed. Dev-only, not a bot feature.

import { LEFT, RIGHT, THRUST } from './sim.ts';

const SEGMENT = 23; // ticks per held combination

export function botInput(seed: number, tick: number): number {
  const seg = Math.floor(tick / SEGMENT);
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seg + 1, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  let b = 0;
  if ((h & 3) !== 0) b |= THRUST;
  const r = (h >>> 2) & 7;
  if (r === 1 || r === 2) b |= LEFT;
  else if (r === 3 || r === 4) b |= RIGHT;
  return b;
}
