// A steering bot for the tuning page and the tuning metrics: chase the
// quarry, veer away from a close hunter. Dev-only: roslambo has no bots
// (REQUIREMENTS, out of scope), and this never ships.

import { hunterOf, quarryOf, RUNNING, type RoundState } from '../src/core/sim/state';
import { LEFT, RIGHT, THRUST } from '../src/core/sim/rules';
import type { SimParams } from '../src/core/sim/params';

const TWO_PI = 2 * Math.PI;
const TURN = 4294967296;

export interface SteerStyle {
  gain: number; // desired turn rate per radian of aim error
  fear: number; // weight of fleeing a hunter closer than fearRange
  fearRange: number;
  aimTolerance: number; // radians: thrust only when aimed this well
  sidewaysFlee: boolean; // when touching its hunter, thrust prograde to orbit free
}

export const DEFAULT_STYLE: SteerStyle = { gain: 4, fear: 1.5, fearRange: 0.2, aimTolerance: 0.5, sidewaysFlee: true };

/** The unit direction that adds energy fastest: along the relative velocity,
 *  or sideways to the line between the planets when there's none yet. */
export function prograde(rvx: number, rvy: number, ox: number, oy: number): [number, number] {
  const v = Math.hypot(rvx, rvy);
  if (v > 0.05) return [rvx / v, rvy / v];
  const o = Math.hypot(ox, oy) || 1;
  return [-oy / o, ox / o];
}

function wrap(a: number): number {
  return a - TWO_PI * Math.round(a / TWO_PI);
}

export function steer(s: RoundState, i: number, P: SimParams, style: SteerStyle = DEFAULT_STYLE): number {
  const n = s.planets.length;
  const me = s.planets[i]!;
  if (n < 2) return 0;
  const q = s.planets[quarryOf(i, n)]!;
  let tx = q.x - me.x;
  let ty = q.y - me.y;
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl;
  ty /= tl;
  if (n >= 3) {
    const h = s.planets[hunterOf(i, n)]!;
    const hx = me.x - h.x;
    const hy = me.y - h.y;
    const hd = Math.hypot(hx, hy) || 1;
    if (style.sidewaysFlee && hd < 4 * P.r) {
      // Within a diameter of the hunter: pulling straight away loses to
      // gravity, so thrust along the relative velocity (or sideways) and
      // orbit free.
      const [px, py] = prograde(me.vx - h.vx, me.vy - h.vy, hx, hy);
      tx = px;
      ty = py;
    } else if (hd < style.fearRange) {
      tx += (style.fear * hx) / hd;
      ty += (style.fear * hy) / hd;
    }
  }
  const want = Math.atan2(ty, tx);
  const heading = (me.angle / TURN) * TWO_PI;
  const err = wrap(want - heading);
  const rate = (me.rate / TURN) * TWO_PI * P.settings.tickRate; // rad/s
  const maxRate = TWO_PI * P.settings.maxRotationTurnsPerSecond;
  const desired = Math.max(-maxRate, Math.min(maxRate, style.gain * err));
  let b = 0;
  if (rate < desired - 0.3) b |= LEFT;
  else if (rate > desired + 0.3) b |= RIGHT;
  if (s.phase === RUNNING && Math.abs(err) < style.aimTolerance) b |= THRUST;
  return b;
}
