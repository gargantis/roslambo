// Tuning metrics for Q-12 (PLAN M2): run with
//   npx vitest run --config dev/vitest.config.ts
// Each candidate setting is measured on the ring, on escaping a touch, and
// on whole rounds between steering bots. Writes research/tuning/results.json
// (the passes behind the M2 choice are research/tuning/pass-*.json).

import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { makeParams, DEFAULT_SETTINGS, type SimSettings, type SimParams } from '../src/core/sim/params';
import { step, JOIN, READY, THRUST, type PlayerInput } from '../src/core/sim/rules';
import { genesis, RUNNING, FROZEN, type RoundState } from '../src/core/sim/state';
import { steer, DEFAULT_STYLE, type SteerStyle } from './steer';

const id = (k: number): string => (k + 1).toString(16).padStart(32, '0');

function lobby(n: number, ante: number): { s: RoundState; join: PlayerInput[] } {
  const s = genesis({ ante, minPlayers: 3, maxPlayers: Math.max(3, n) });
  const join = Array.from({ length: n }, (_, k) => ({ id: id(k), buttons: 0, events: JOIN, name: `B${k + 1}` }));
  return { s, join };
}

/** Largest relative deviation from the ring radius, held by the correction for `seconds`. */
function ringHold(P: SimParams, n: number, seconds: number): number {
  const { s, join } = lobby(n, 3);
  step(s, join, P);
  const present = join.map((j) => ({ ...j, events: 0 }));
  let worst = 0;
  for (let t = 0; t < seconds * 60; t++) {
    step(s, present, P);
    for (const p of s.planets) worst = Math.max(worst, Math.abs(Math.hypot(p.x - P.cx, p.y - P.cy) - P.ringRadius) / P.ringRadius);
  }
  return worst;
}

/** Seconds after release until the ring is 10% out of round, nobody pressing anything. */
function ringBreak(P: SimParams, n: number): number {
  const { s, join } = lobby(n, 1000);
  step(s, join, P);
  step(s, join.map((j) => ({ ...j, events: READY })), P);
  while (s.phase !== RUNNING) step(s, join.map((j) => ({ ...j, events: 0 })), P);
  for (let t = 1; t <= 60 * 60; t++) {
    step(s, [], P);
    const cx = s.planets.reduce((a, p) => a + p.x, 0) / n;
    const cy = s.planets.reduce((a, p) => a + p.y, 0) / n;
    for (const p of s.planets) if (Math.abs(Math.hypot(p.x - cx, p.y - cy) - P.ringRadius) > 0.1 * P.ringRadius) return t / 60;
  }
  return Infinity;
}

/** Two planets at rest, touching; one thrusts straight away while the other
 *  coasts. Both feel the pull, so this needs thrust above twice the peak
 *  pull. Seconds until 0.3 apart, past the peak. */
function escape(P: SimParams): number {
  const s = genesis({ ante: 1000, minPlayers: 3, maxPlayers: 3 });
  s.phase = RUNNING;
  const base = { name: '', joinTick: 0, readyUntil: 0, lastInputTick: 0, points: 1000, rate: 0, vx: 0, vy: 0, engaged: 0 };
  s.planets.push({ ...base, id: id(0), angle: 0, x: 0.5, y: 0.5 });
  s.planets.push({ ...base, id: id(1), angle: 0, x: 0.5 + P.twoR, y: 0.5 }); // faces +x, away from the other
  for (let t = 1; t <= 600; t++) {
    step(s, [{ id: id(1), buttons: THRUST, events: 0 }], P);
    if (Math.hypot(s.planets[1]!.x - s.planets[0]!.x, s.planets[1]!.y - s.planets[0]!.y) > 0.3) return t / 60;
  }
  return Infinity;
}

interface RoundStats {
  seconds: number; // from the start until the freeze
  frozen: boolean;
  points: number; // transfers per minute
  maxSpeed: number;
}

function round(P: SimParams, n: number, ante: number, seed: number, maxSeconds: number): RoundStats {
  const { s, join } = lobby(n, ante);
  step(s, join, P);
  step(s, join.map((j) => ({ ...j, events: READY })), P);
  while (s.phase !== RUNNING) step(s, join.map((j) => ({ ...j, events: 0 })), P);
  // Vary the bots a little per seed, so rounds differ.
  const styles: SteerStyle[] = join.map((_, k) => {
    const r = Math.sin(seed * 97 + k * 13) * 0.5 + 0.5;
    return { ...DEFAULT_STYLE, gain: 3 + 2 * r, fear: 1 + r, aimTolerance: 0.35 + 0.3 * r };
  });
  let maxSpeed = 0;
  let transfers = 0;
  const start = s.tick;
  while (s.phase === RUNNING && s.tick - start < maxSeconds * 60) {
    const before = s.planets.map((p) => p.points);
    step(s, s.planets.map((p, i) => ({ id: p.id, buttons: steer(s, i, P, styles[i]), events: 0 })), P);
    s.planets.forEach((p, i) => {
      if (p.points > before[i]!) transfers += p.points - before[i]!;
      maxSpeed = Math.max(maxSpeed, Math.hypot(p.vx, p.vy));
    });
  }
  const seconds = (s.tick - start) / 60;
  return { seconds, frozen: (s.phase as number) === FROZEN, points: (transfers / seconds) * 60, maxSpeed };
}

/** The strongest pull between two planets at any distance from contact out. */
function peakPull(P: SimParams): number {
  let best = 0;
  for (let d = P.twoR; d < 1; d += 0.001) best = Math.max(best, (P.gm * d) / Math.pow(d * d + P.eps2, 1.5));
  return best;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function measure(settings: SimSettings): Record<string, unknown> {
  const P = makeParams(settings);
  const rounds = (n: number) => Array.from({ length: 12 }, (_, seed) => round(P, n, 5, seed, 300));
  const out: Record<string, unknown> = {
    gm: +P.gm.toFixed(4),
    contactPull: +(P.gm * P.twoR / Math.pow(P.minD2 + P.eps2, 1.5)).toFixed(2),
    escapeMargin: +(settings.thrust / (2 * peakPull(P))).toFixed(2),
    ring8TurnsPerSec: +((P.ringOmega(8) / (2 * Math.PI))).toFixed(3),
    hold8: +ringHold(P, 8, 120).toFixed(4),
    hold3: +ringHold(P, 3, 120).toFixed(4),
    break3: +ringBreak(P, 3).toFixed(1),
    break8: +ringBreak(P, 8).toFixed(1),
    escape: +escape(P).toFixed(2),
  };
  for (const n of [3, 5, 8]) {
    const rs = rounds(n);
    out[`n${n}`] = {
      medianSeconds: +median(rs.map((r) => r.seconds)).toFixed(1),
      unfinished: rs.filter((r) => !r.frozen).length,
      pointsPerMin: +median(rs.map((r) => r.points)).toFixed(1),
      maxSpeed: +Math.max(...rs.map((r) => r.maxSpeed)).toFixed(2),
    };
  }
  return out;
}

const CANDIDATES: Record<string, Partial<SimSettings>> = JSON.parse(process.env.TUNE_CANDIDATES ?? '{"baseline": {}}');

it('measures the tuning candidates', () => {
  const results: Record<string, unknown> = {};
  for (const [name, over] of Object.entries(CANDIDATES)) results[name] = { settings: over, ...measure({ ...DEFAULT_SETTINGS, ...over }) };
  writeFileSync(process.env.TUNE_OUT ?? 'research/tuning/results.json', JSON.stringify(results, null, 1));
}, 30 * 60_000);
