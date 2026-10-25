// One tick of physics in fixed substeps (PLAN D-4, D-5): gravity, thrust,
// the pre-start correction, and elastic contacts. Exact operations only
// (D-1); pairs in index order.
//
// Bounces conserve energy, so the integrator must too. Velocity Verlet
// (kick, drift, kick) alone does for smooth forces, but a contact caught a
// substep late leaks or gains energy at every bounce. So each substep is
// split at the moment of the next contact, predicted from the second-order
// expansion of each distance, and the bounce happens exactly then. An
// isolated pair then bounces at the same height for as long as you like
// (physics.test.ts).

import { dir, fractionOfTurn } from './angle';
import type { SimParams } from './params';
import type { Planet } from './state';

export interface TickForces {
  /** Thrust acceleration per planet for this tick, already aimed (D-2). */
  tx: Float64Array;
  ty: Float64Array;
  /** The pre-start correction: on before the countdown reaches 0. */
  correction: boolean;
  ringPhase: number; // at the start of the tick
  ringRate: number; // binary-angle units per tick
}

/** Called for each contact between planets i < j, at the moment it happens. */
export type ContactSink = (i: number, j: number) => void;

const scratch = {
  ax: new Float64Array(0),
  ay: new Float64Array(0),
  d: new Float64Array(2),
};

function ensure(n: number): void {
  if (scratch.ax.length < n) {
    scratch.ax = new Float64Array(n);
    scratch.ay = new Float64Array(n);
  }
}

const NONE = 0;
const PAIR = 1;
const WALL = 2;

export function physicsTick(planets: Planet[], P: SimParams, f: TickForces, onContact: ContactSink): void {
  const n = planets.length;
  ensure(n);
  const S = P.settings.substeps;
  // Bounded work per substep. Planets resting against each other would
  // bounce ever faster (a Zeno sequence); past the cap, the rest of the
  // substep runs without prediction and overlaps are settled after it.
  const maxEvents = 4 * n + 8;
  accelerate(planets, P, f, 0, S);
  for (let k = 0; k < S; k++) {
    let left = P.dt;
    let events = 0;
    while (left > 0) {
      const predict = events < maxEvents;
      let h = left;
      let kind = NONE;
      let ei = 0;
      let ej = 0;
      if (predict) {
        const e = nextContact(planets, P, left);
        h = e.h;
        kind = e.kind;
        ei = e.i;
        ej = e.j;
      }
      if (h > 0) {
        kick(planets, h / 2);
        drift(planets, h);
        accelerate(planets, P, f, k + (P.dt - left + h) / P.dt, S);
        kick(planets, h / 2);
      }
      if (kind === PAIR) bouncePair(planets, ei, ej, onContact);
      else if (kind === WALL) bounceWall(planets[ei]!, P.walls[ej]!, P.wallK);
      left -= h;
      events++;
      if (!predict) break;
    }
    settleOverlaps(planets, P, onContact);
  }
}

/** Accelerations at the current positions and velocities, at substep
 *  progress `when` (0 at the tick's start, S at its end). */
function accelerate(planets: Planet[], P: SimParams, f: TickForces, when: number, S: number): void {
  const n = planets.length;
  const { ax, ay, d } = scratch;
  for (let i = 0; i < n; i++) {
    ax[i] = f.tx[i]!;
    ay[i] = f.ty[i]!;
  }
  const { gm, minD2, eps2 } = P;
  for (let i = 0; i < n; i++) {
    const pi = planets[i]!;
    for (let j = i + 1; j < n; j++) {
      const pj = planets[j]!;
      const dx = pj.x - pi.x;
      const dy = pj.y - pi.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < minD2) d2 = minD2; // an overlap never spikes gravity
      const s2 = d2 + eps2;
      const g = gm / (s2 * Math.sqrt(s2));
      ax[i] = ax[i]! + dx * g;
      ay[i] = ay[i]! + dy * g;
      ax[j] = ax[j]! - dx * g;
      ay[j] = ay[j]! - dy * g;
    }
  }
  if (f.correction && n >= 2) {
    // D-5: a spring-damper toward each planet's slot on the ideal ring.
    // ω² stiffness and 2ω damping, scaled by c.
    const w = P.ringOmega(n);
    const c = P.settings.correctionFactor;
    const R = P.ringRadius;
    const phase = (f.ringPhase + Math.floor((f.ringRate * when) / S)) >>> 0;
    for (let i = 0; i < n; i++) {
      const p = planets[i]!;
      dir((phase + fractionOfTurn(i, n)) >>> 0, d);
      const sx = P.cx + R * d[0]!;
      const sy = P.cy + R * d[1]!;
      const svx = -w * R * d[1]!;
      const svy = w * R * d[0]!;
      ax[i] = ax[i]! + c * (w * w * (sx - p.x) + 2 * w * (svx - p.vx));
      ay[i] = ay[i]! + c * (w * w * (sy - p.y) + 2 * w * (svy - p.vy));
    }
  }
}

function kick(planets: Planet[], h: number): void {
  const { ax, ay } = scratch;
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i]!;
    p.vx += ax[i]! * h;
    p.vy += ay[i]! * h;
  }
}

function drift(planets: Planet[], h: number): void {
  for (const p of planets) {
    p.x += p.vx * h;
    p.y += p.vy * h;
  }
}

/** Smallest t in (0, ∞) with s + ṡ·t + ½s̈·t² = 0, for s > 0; Infinity if
 *  none. The form 2s / (−ṡ + √(ṡ² − 2s̈s)) is stable as s̈ → 0. */
function firstRoot(s: number, sd: number, sdd: number): number {
  const disc = sd * sd - 2 * sdd * s;
  if (disc < 0) return Infinity;
  const den = Math.sqrt(disc) - sd;
  return den > 0 ? (2 * s) / den : Infinity;
}

const event = { h: 0, kind: NONE, i: 0, j: 0 };

/** The first contact within `left`: a touching pair or wall that is
 *  approaching now (h = 0), or the earliest predicted one. */
function nextContact(planets: Planet[], P: SimParams, left: number): typeof event {
  const n = planets.length;
  const { ax, ay } = scratch;
  const { twoR, r } = P;
  event.h = left;
  event.kind = NONE;
  for (let i = 0; i < n; i++) {
    const a = planets[i]!;
    for (let j = i + 1; j < n; j++) {
      const b = planets[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dvx = b.vx - a.vx;
      const dvy = b.vy - a.vy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) continue;
      const s = dist - twoR;
      const sd = (dx * dvx + dy * dvy) / dist;
      if (s <= 0) {
        if (sd < 0) return now(PAIR, i, j);
        continue;
      }
      const sdd = (dvx * dvx + dvy * dvy - sd * sd + dx * (ax[j]! - ax[i]!) + dy * (ay[j]! - ay[i]!)) / dist;
      const t = firstRoot(s, sd, sdd);
      if (t < event.h) {
        event.h = t;
        event.kind = PAIR;
        event.i = i;
        event.j = j;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const p = planets[i]!;
    for (let w = 0; w < P.walls.length; w++) {
      const wall = P.walls[w]!;
      const s = wall.c - r - (wall.nx * p.x + wall.ny * p.y);
      const sd = -(wall.nx * p.vx + wall.ny * p.vy);
      if (s <= 0) {
        if (sd < 0) return now(WALL, i, w);
        continue;
      }
      const t = firstRoot(s, sd, -(wall.nx * ax[i]! + wall.ny * ay[i]!));
      if (t < event.h) {
        event.h = t;
        event.kind = WALL;
        event.i = i;
        event.j = w;
      }
    }
  }
  return event;
}

function now(kind: number, i: number, j: number): typeof event {
  event.h = 0;
  event.kind = kind;
  event.i = i;
  event.j = j;
  return event;
}

/** Equal masses, elastic: swap the velocity components along the line
 *  between the centres, if they are approaching. */
function bouncePair(planets: Planet[], i: number, j: number, onContact: ContactSink): void {
  const a = planets[i]!;
  const b = planets[j]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return;
  const nx = dx / dist;
  const ny = dy / dist;
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn >= 0) return;
  a.vx += vn * nx;
  a.vy += vn * ny;
  b.vx -= vn * nx;
  b.vy -= vn * ny;
  onContact(i, j);
}

/** Reflect off a wall moving outward, then lose the energy fraction (Q-14). */
function bounceWall(p: Planet, w: { nx: number; ny: number }, wallK: number): void {
  const vn = w.nx * p.vx + w.ny * p.vy;
  if (vn <= 0) return;
  p.vx = (p.vx - 2 * vn * w.nx) * wallK;
  p.vy = (p.vy - 2 * vn * w.ny) * wallK;
}

/** After each substep: whatever still overlaps (only planets resting
 *  together, after the event cap) bounces now and is moved apart, so
 *  nothing passes through anything. */
function settleOverlaps(planets: Planet[], P: SimParams, onContact: ContactSink): void {
  const n = planets.length;
  for (let i = 0; i < n; i++) {
    const a = planets[i]!;
    for (let j = i + 1; j < n; j++) {
      const b = planets[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= P.minD2 || d2 === 0) continue;
      const dist = Math.sqrt(d2);
      const half = (P.twoR - dist) / 2;
      bouncePair(planets, i, j, onContact);
      a.x -= (dx / dist) * half;
      a.y -= (dy / dist) * half;
      b.x += (dx / dist) * half;
      b.y += (dy / dist) * half;
    }
  }
  for (const p of planets) {
    for (const w of P.walls) {
      const out = w.nx * p.x + w.ny * p.y - (w.c - P.r);
      if (out <= 0) continue;
      bounceWall(p, w, P.wallK);
      p.x -= out * w.nx;
      p.y -= out * w.ny;
    }
  }
}
