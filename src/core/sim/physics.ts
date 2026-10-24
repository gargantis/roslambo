// One tick of physics in fixed substeps (PLAN D-4, D-5): softened gravity,
// thrust, the pre-start correction, semi-implicit Euler, then planet and
// wall contacts. Exact operations only (D-1); pairs in index order.

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

/** Called for each approaching contact between planets i < j. */
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

export function physicsTick(planets: Planet[], P: SimParams, f: TickForces, onContact: ContactSink): void {
  const n = planets.length;
  ensure(n);
  const S = P.settings.substeps;
  for (let k = 0; k < S; k++) {
    accelerate(planets, P, f, k, S);
    integrate(planets, P.dt);
    planetContacts(planets, P, onContact);
    wallContacts(planets, P);
  }
}

function accelerate(planets: Planet[], P: SimParams, f: TickForces, k: number, S: number): void {
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
      if (d2 < minD2) d2 = minD2; // overlap never spikes gravity
      const s2 = d2 + eps2;
      const g = gm / (s2 * Math.sqrt(s2));
      ax[i] = ax[i]! + dx * g;
      ay[i] = ay[i]! + dy * g;
      ax[j] = ax[j]! - dx * g;
      ay[j] = ay[j]! - dy * g;
    }
  }
  if (f.correction && n >= 2) {
    // D-5: a spring-damper toward each planet's slot on the ideal ring, at
    // this substep's end. ω² stiffness and 2ω damping, scaled by c.
    const w = P.ringOmega(n);
    const c = P.settings.correctionFactor;
    const R = P.ringRadius;
    const phase = (f.ringPhase + Math.floor((f.ringRate * (k + 1)) / S)) >>> 0;
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

function integrate(planets: Planet[], dt: number): void {
  const { ax, ay } = scratch;
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i]!;
    p.vx += ax[i]! * dt;
    p.vy += ay[i]! * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

function planetContacts(planets: Planet[], P: SimParams, onContact: ContactSink): void {
  const n = planets.length;
  const { minD2, twoR } = P;
  for (let i = 0; i < n; i++) {
    const a = planets[i]!;
    for (let j = i + 1; j < n; j++) {
      const b = planets[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD2) continue;
      const dvx = b.vx - a.vx;
      const dvy = b.vy - a.vy;
      if (dvx * dx + dvy * dy >= 0) continue; // touching but separating
      const dist = Math.sqrt(d2);
      if (dist === 0) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      // Equal masses, elastic: swap the velocity components along n.
      const vn = dvx * nx + dvy * ny;
      a.vx += vn * nx;
      a.vy += vn * ny;
      b.vx -= vn * nx;
      b.vy -= vn * ny;
      const half = (twoR - dist) / 2;
      a.x -= nx * half;
      a.y -= ny * half;
      b.x += nx * half;
      b.y += ny * half;
      onContact(i, j);
    }
  }
}

function wallContacts(planets: Planet[], P: SimParams): void {
  const { r, wallK } = P;
  for (const p of planets) {
    for (const w of P.walls) {
      const out = w.nx * p.x + w.ny * p.y - (w.c - r);
      const vn = w.nx * p.vx + w.ny * p.vy;
      if (out <= 0 || vn <= 0) continue;
      // Reflect, then lose the energy fraction (Q-14), then move back inside.
      p.vx = (p.vx - 2 * vn * w.nx) * wallK;
      p.vy = (p.vy - 2 * vn * w.ny) * wallK;
      p.x -= out * w.nx;
      p.y -= out * w.ny;
    }
  }
}
