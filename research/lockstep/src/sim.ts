// The spike's minimal simulation (PLAN §15 M0): gravity, elastic planet
// bounces, lossy walls, thrust and conserved rotation in a unit square.
// No ring, no scoring. Exact operations only (D-1); pairs in index order.

import { dir, fractionOfTurn, QUARTER_TURN } from './num.ts';
import { hash64 } from './hash.ts';

export interface SimConfig {
  n: number;
  tickRate: number;
  substeps: number;
  radius: number;
  gm: number;
  thrust: number;
  wallLoss: number;
}

// Starting values from PLAN A.5, in units of the arena side.
export const DEFAULT_SIM: SimConfig = {
  n: 3,
  tickRate: 60,
  substeps: 4,
  radius: 0.03,
  gm: 0.091,
  thrust: 0.6,
  wallLoss: 0.2,
};

export const THRUST = 1;
export const LEFT = 2;
export const RIGHT = 4;

// D-2: binary-angle units per tick at 60 ticks/s.
export const MAX_RATE = 71582788; // 1 turn/s
export const RATE_ACC = 2386093; // 2 turns/s², per tick

export interface State {
  tick: number;
  contacts: number;
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  angle: Uint32Array;
  rate: Int32Array;
}

export function emptyState(n: number): State {
  return {
    tick: 0,
    contacts: 0,
    x: new Float64Array(n),
    y: new Float64Array(n),
    vx: new Float64Array(n),
    vy: new Float64Array(n),
    angle: new Uint32Array(n),
    rate: new Int32Array(n),
  };
}

/** Planets evenly spaced on a circle, moving tangentially. */
export function genesis(cfg: SimConfig): State {
  const s = emptyState(cfg.n);
  const d = new Float64Array(2);
  for (let i = 0; i < cfg.n; i++) {
    const a = fractionOfTurn(i, cfg.n);
    dir(a, d);
    s.x[i] = 0.5 + 0.3 * d[0]!;
    s.y[i] = 0.5 + 0.3 * d[1]!;
    s.vx[i] = -0.15 * d[1]!;
    s.vy[i] = 0.15 * d[0]!;
    s.angle[i] = (a + QUARTER_TURN) >>> 0;
  }
  return s;
}

export function copyState(dst: State, src: State): void {
  dst.tick = src.tick;
  dst.contacts = src.contacts;
  dst.x.set(src.x);
  dst.y.set(src.y);
  dst.vx.set(src.vx);
  dst.vy.set(src.vy);
  dst.angle.set(src.angle);
  dst.rate.set(src.rate);
}

export function cloneState(src: State): State {
  const s = emptyState(src.x.length);
  copyState(s, src);
  return s;
}

/** Fault injection: a nudge far below anything visible. */
export function corrupt(s: State): void {
  s.x[0] = s.x[0]! + 1e-9;
}

export class Sim {
  private readonly dt: number;
  private readonly twoR: number;
  private readonly minD2: number;
  private readonly lo: number;
  private readonly hi: number;
  private readonly wallK: number;
  private readonly ax: Float64Array;
  private readonly ay: Float64Array;
  private readonly tx: Float64Array;
  private readonly ty: Float64Array;
  private readonly d = new Float64Array(2);
  readonly cfg: SimConfig;

  constructor(cfg: SimConfig) {
    this.cfg = cfg;
    this.dt = 1 / (cfg.tickRate * cfg.substeps);
    this.twoR = 2 * cfg.radius;
    this.minD2 = this.twoR * this.twoR;
    this.lo = cfg.radius;
    this.hi = 1 - cfg.radius;
    // Q-14: the whole kinetic energy drops by the loss fraction.
    this.wallK = Math.sqrt(1 - cfg.wallLoss);
    this.ax = new Float64Array(cfg.n);
    this.ay = new Float64Array(cfg.n);
    this.tx = new Float64Array(cfg.n);
    this.ty = new Float64Array(cfg.n);
  }

  /** Advances s by one tick. inputs[i] holds planet i's buttons (0 when absent). */
  step(s: State, inputs: ArrayLike<number>): void {
    const n = s.x.length;
    for (let i = 0; i < n; i++) {
      const b = inputs[i]!;
      const left = (b & LEFT) !== 0;
      const right = (b & RIGHT) !== 0;
      let rate = s.rate[i]!;
      if (left && !right) rate = Math.min(rate + RATE_ACC, MAX_RATE);
      else if (right && !left) rate = Math.max(rate - RATE_ACC, -MAX_RATE);
      s.rate[i] = rate;
      s.angle[i] = (s.angle[i]! + rate) >>> 0;
      if ((b & THRUST) !== 0) {
        dir(s.angle[i]!, this.d);
        this.tx[i] = this.d[0]! * this.cfg.thrust;
        this.ty[i] = this.d[1]! * this.cfg.thrust;
      } else {
        this.tx[i] = 0;
        this.ty[i] = 0;
      }
    }
    for (let k = 0; k < this.cfg.substeps; k++) this.substep(s, n);
    s.tick += 1;
  }

  private substep(s: State, n: number): void {
    const { x, y, vx, vy } = s;
    const { ax, ay, minD2, twoR, dt, lo, hi, wallK } = this;
    const gm = this.cfg.gm;
    for (let i = 0; i < n; i++) {
      ax[i] = this.tx[i]!;
      ay[i] = this.ty[i]!;
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = x[j]! - x[i]!;
        const dy = y[j]! - y[i]!;
        let d2 = dx * dx + dy * dy;
        if (d2 < minD2) d2 = minD2;
        const f = gm / (d2 * Math.sqrt(d2));
        ax[i] = ax[i]! + dx * f;
        ay[i] = ay[i]! + dy * f;
        ax[j] = ax[j]! - dx * f;
        ay[j] = ay[j]! - dy * f;
      }
    }
    for (let i = 0; i < n; i++) {
      vx[i] = vx[i]! + ax[i]! * dt;
      vy[i] = vy[i]! + ay[i]! * dt;
      x[i] = x[i]! + vx[i]! * dt;
      y[i] = y[i]! + vy[i]! * dt;
    }
    // Planet contacts: touching and approaching only, so one bounce is one contact.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = x[j]! - x[i]!;
        const dy = y[j]! - y[i]!;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD2) continue;
        const dvx = vx[j]! - vx[i]!;
        const dvy = vy[j]! - vy[i]!;
        if (dvx * dx + dvy * dy >= 0) continue;
        const d = Math.sqrt(d2);
        if (d === 0) continue;
        const nx = dx / d;
        const ny = dy / d;
        const vn = dvx * nx + dvy * ny;
        vx[i] = vx[i]! + vn * nx;
        vy[i] = vy[i]! + vn * ny;
        vx[j] = vx[j]! - vn * nx;
        vy[j] = vy[j]! - vn * ny;
        const half = (twoR - d) / 2;
        x[i] = x[i]! - nx * half;
        y[i] = y[i]! - ny * half;
        x[j] = x[j]! + nx * half;
        y[j] = y[j]! + ny * half;
        s.contacts++;
      }
    }
    for (let i = 0; i < n; i++) {
      if (x[i]! < lo && vx[i]! < 0) {
        vx[i] = -vx[i]! * wallK;
        vy[i] = vy[i]! * wallK;
        x[i] = lo;
      } else if (x[i]! > hi && vx[i]! > 0) {
        vx[i] = -vx[i]! * wallK;
        vy[i] = vy[i]! * wallK;
        x[i] = hi;
      }
      if (y[i]! < lo && vy[i]! < 0) {
        vy[i] = -vy[i]! * wallK;
        vx[i] = vx[i]! * wallK;
        y[i] = lo;
      } else if (y[i]! > hi && vy[i]! > 0) {
        vy[i] = -vy[i]! * wallK;
        vx[i] = vx[i]! * wallK;
        y[i] = hi;
      }
    }
  }
}

// Canonical bytes (the hash input and the STATE payload):
// u32 tick, u32 contacts, u8 n, then per planet f64 x y vx vy, u32 angle, i32 rate.
const HEADER = 9;
const PER_PLANET = 40;

export function stateSize(n: number): number {
  return HEADER + n * PER_PLANET;
}

export function encodeState(s: State): Uint8Array {
  const n = s.x.length;
  const out = new Uint8Array(stateSize(n));
  const v = new DataView(out.buffer);
  v.setUint32(0, s.tick, true);
  v.setUint32(4, s.contacts, true);
  v.setUint8(8, n);
  let o = HEADER;
  for (let i = 0; i < n; i++) {
    const xi = s.x[i]!;
    if (xi !== xi) throw new Error('NaN in state');
    v.setFloat64(o, xi, true);
    v.setFloat64(o + 8, s.y[i]!, true);
    v.setFloat64(o + 16, s.vx[i]!, true);
    v.setFloat64(o + 24, s.vy[i]!, true);
    v.setUint32(o + 32, s.angle[i]!, true);
    v.setInt32(o + 36, s.rate[i]!, true);
    o += PER_PLANET;
  }
  return out;
}

export function decodeState(bytes: Uint8Array): State | null {
  if (bytes.length < HEADER) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = v.getUint8(8);
  if (bytes.length !== stateSize(n)) return null;
  const s = emptyState(n);
  s.tick = v.getUint32(0, true);
  s.contacts = v.getUint32(4, true);
  let o = HEADER;
  for (let i = 0; i < n; i++) {
    s.x[i] = v.getFloat64(o, true);
    s.y[i] = v.getFloat64(o + 8, true);
    s.vx[i] = v.getFloat64(o + 16, true);
    s.vy[i] = v.getFloat64(o + 24, true);
    s.angle[i] = v.getUint32(o + 32, true);
    s.rate[i] = v.getInt32(o + 36, true);
    o += PER_PLANET;
  }
  return s;
}

export function hashState(s: State): string {
  return hash64(encodeState(s));
}
