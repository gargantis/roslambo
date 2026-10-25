// Interpolation between predicted ticks (PLAN §12): the frame draws the
// state one tick behind the newest, at the fraction of the current tick
// that has passed. Render-only maths, so Math.* is fine here.

import type { RoundState } from '../core/sim/state';

const TURN = 4294967296;
const HALF = 2147483648;

export interface DrawnPlanet {
  id: string;
  x: number;
  y: number;
  /** Facing, radians anticlockwise from +x (the simulation's y points up). */
  theta: number;
}

/** Binary angles a → b by fraction f, the shorter way round. */
export function lerpAngle(a: number, b: number, f: number): number {
  let d = (b - a) % TURN;
  if (d >= HALF) d -= TURN;
  else if (d < -HALF) d += TURN;
  const x = (a + d * f) % TURN;
  return x < 0 ? x + TURN : x;
}

export function toRadians(binaryAngle: number): number {
  return (binaryAngle / TURN) * 2 * Math.PI;
}

/** The planets of `next`, moved back towards `prev` by 1 − f. A planet
 *  that wasn't in `prev` is drawn where `next` has it. */
export function interpolate(prev: RoundState, next: RoundState, f: number, out: DrawnPlanet[] = []): DrawnPlanet[] {
  out.length = next.planets.length;
  next.planets.forEach((p, i) => {
    const q = prev.planets[i]?.id === p.id ? prev.planets[i] : prev.planets.find((x) => x.id === p.id);
    const d = out[i] ?? { id: '', x: 0, y: 0, theta: 0 };
    d.id = p.id;
    if (q) {
      d.x = q.x + (p.x - q.x) * f;
      d.y = q.y + (p.y - q.y) * f;
      d.theta = toRadians(lerpAngle(q.angle, p.angle, f));
    } else {
      d.x = p.x;
      d.y = p.y;
      d.theta = toRadians(p.angle);
    }
    out[i] = d;
  });
  return out;
}
