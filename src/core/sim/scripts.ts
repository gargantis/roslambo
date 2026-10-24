// Scripted rounds for the goldens and the canary (PLAN §14, D-17): inputs
// derived from a seed and the tick alone, so any engine can replay a round
// bit for bit. Dev and test only; not a bot feature.

import { JOIN, LEAVE, LEFT, READY, RIGHT, THRUST, type PlayerInput } from './rules';
import type { RoundSettings } from './state';

export interface ScriptSpec {
  name: string;
  seed: number;
  players: number; // how many try to join
  round: RoundSettings;
  ticks: number;
  joinEvery: number; // player k joins at tick 1 + k·joinEvery
  readyAt: number; // player k presses Ready at readyAt + k
  earlyReady?: { player: number; at: number }; // a Ready that expires (Q-21, ready expiry)
  leaveRejoin?: { player: number; leaveAt: number; rejoinAt: number };
  silent?: { player: number; from: number; to: number };
}

function mix(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

export function scriptPlayerId(seed: number, k: number): string {
  let s = '';
  for (let w = 0; w < 4; w++) s += mix(mix(seed, k), w).toString(16).padStart(8, '0');
  return s;
}

/** Buttons held in 23-tick spells: thrust three quarters of the time. */
export function scriptButtons(seed: number, k: number, t: number): number {
  const h = mix(mix(seed, k), Math.floor(t / 23));
  let b = 0;
  if ((h & 3) !== 0) b |= THRUST;
  const r = (h >>> 2) & 7;
  if (r === 1 || r === 2) b |= LEFT;
  else if (r === 3 || r === 4) b |= RIGHT;
  return b;
}

/** The final inputs of tick t. */
export function scriptInputs(spec: ScriptSpec, t: number): PlayerInput[] {
  const out: PlayerInput[] = [];
  for (let k = 0; k < spec.players; k++) {
    const joinAt = 1 + k * spec.joinEvery;
    if (t < joinAt) continue;
    const lr = spec.leaveRejoin?.player === k ? spec.leaveRejoin : undefined;
    if (lr && t > lr.leaveAt && t < lr.rejoinAt) continue; // away
    const si = spec.silent?.player === k ? spec.silent : undefined;
    if (si && t >= si.from && t < si.to) continue;
    let events = 0;
    if (t === joinAt || (lr && t === lr.rejoinAt)) events |= JOIN;
    if (lr && t === lr.leaveAt) events |= LEAVE;
    if (t === spec.readyAt + k || (lr && t === lr.rejoinAt + 5)) events |= READY;
    if (spec.earlyReady?.player === k && t === spec.earlyReady.at) events |= READY;
    out.push({
      id: scriptPlayerId(spec.seed, k),
      buttons: scriptButtons(spec.seed, k, t),
      events,
      ...((events & JOIN) !== 0 ? { name: `P${k + 1}` } : {}),
    });
  }
  // Arrival order must not matter (P4): hand the inputs over reversed.
  return out.reverse();
}

const round = (ante: number, maxPlayers: number): RoundSettings => ({ ante, minPlayers: 3, maxPlayers });

/** The golden suite: every phase, roster rule and ring size up to 12. */
export const GOLDEN_SCRIPTS: ScriptSpec[] = [
  { name: 'lone planet', seed: 1, players: 1, round: round(3, 8), ticks: 3000, joinEvery: 1, readyAt: 10 },
  { name: 'binary pair', seed: 2, players: 2, round: round(3, 8), ticks: 3000, joinEvery: 30, readyAt: 100 },
  { name: 'three', seed: 3, players: 3, round: round(3, 8), ticks: 6000, joinEvery: 20, readyAt: 100 },
  { name: 'three, leave and rejoin', seed: 4, players: 3, round: round(3, 8), ticks: 6000, joinEvery: 20, readyAt: 400, leaveRejoin: { player: 1, leaveAt: 150, rejoinAt: 300 } },
  { name: 'four', seed: 5, players: 4, round: round(5, 8), ticks: 6000, joinEvery: 15, readyAt: 100 },
  { name: 'five', seed: 6, players: 5, round: round(5, 8), ticks: 6000, joinEvery: 15, readyAt: 100 },
  { name: 'six', seed: 7, players: 6, round: round(5, 8), ticks: 6000, joinEvery: 15, readyAt: 120 },
  { name: 'eight', seed: 8, players: 8, round: round(5, 8), ticks: 8000, joinEvery: 10, readyAt: 120 },
  { name: 'eight, one silent while running', seed: 9, players: 8, round: round(10, 8), ticks: 8000, joinEvery: 10, readyAt: 120, silent: { player: 3, from: 800, to: 1300 } },
  { name: 'ten', seed: 10, players: 10, round: round(5, 10), ticks: 6000, joinEvery: 10, readyAt: 150 },
  { name: 'twelve', seed: 11, players: 12, round: round(5, 12), ticks: 5000, joinEvery: 8, readyAt: 150 },
  { name: 'ready expires', seed: 12, players: 3, round: round(3, 8), ticks: 8000, joinEvery: 2000, readyAt: 4100, earlyReady: { player: 0, at: 10 } },
  { name: 'full round refuses joins', seed: 13, players: 5, round: round(3, 3), ticks: 4000, joinEvery: 20, readyAt: 120 },
];

/** D-17: 8 planets through a short countdown, then thrusting into each
 *  other and the walls. Run with a 1-second countdown (golden.ts), since
 *  the canary checks arithmetic, not timings: about 5 ms on a desktop. */
export const CANARY_SCRIPT: ScriptSpec = {
  name: 'canary', seed: 99, players: 8, round: round(5, 8), ticks: 400, joinEvery: 1, readyAt: 10,
};
