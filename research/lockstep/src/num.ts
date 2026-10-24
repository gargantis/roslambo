// Exact-operations maths for the deterministic simulation (PLAN D-1, D-2).
// Only + - * / %, comparisons, bit operations and Math.sqrt / abs / min /
// max / floor / trunc / imul appear here: IEEE 754 rounds each of them
// exactly, so every engine computes the same bits.

/** Binary angles: 2^32 units per turn. */
export const TURN = 4294967296;
export const QUARTER_TURN = 1073741824;

const OCTANT = 536870912; // 2^29 units, one eighth of a turn
// π/4 over 2^29: radians per unit. Dividing by a power of two is exact.
const RAD_PER_UNIT = 0.7853981633974483 / OCTANT;

// Taylor coefficients, each one exact division at load.
const S3 = -1 / 6;
const S5 = 1 / 120;
const S7 = -1 / 5040;
const S9 = 1 / 362880;
const S11 = -1 / 39916800;
const S13 = 1 / 6227020800;
const S15 = -1 / 1307674368000;
const C2 = -1 / 2;
const C4 = 1 / 24;
const C6 = -1 / 720;
const C8 = 1 / 40320;
const C10 = -1 / 3628800;
const C12 = 1 / 479001600;
const C14 = -1 / 87178291200;
const C16 = 1 / 20922789888000;

function sinPoly(x: number): number {
  const x2 = x * x;
  return x * (1 + x2 * (S3 + x2 * (S5 + x2 * (S7 + x2 * (S9 + x2 * (S11 + x2 * (S13 + x2 * S15)))))));
}

function cosPoly(x: number): number {
  const x2 = x * x;
  return 1 + x2 * (C2 + x2 * (C4 + x2 * (C6 + x2 * (C8 + x2 * (C10 + x2 * (C12 + x2 * (C14 + x2 * C16)))))));
}

/** Writes the cosine and sine of a binary angle into out[0] and out[1].
 *  The octant comes from the top 3 bits; odd octants use the exact integer
 *  complement, so the polynomial always sees [0, π/4]. */
export function dir(angle: number, out: Float64Array): void {
  const a = angle >>> 0;
  const oct = a >>> 29;
  const r = a & 0x1fffffff;
  const x = ((oct & 1) === 1 ? OCTANT - r : r) * RAD_PER_UNIT;
  const s = sinPoly(x);
  const c = cosPoly(x);
  switch (oct) {
    case 0: out[0] = c; out[1] = s; break;
    case 1: out[0] = s; out[1] = c; break;
    case 2: out[0] = -s; out[1] = c; break;
    case 3: out[0] = -c; out[1] = s; break;
    case 4: out[0] = -c; out[1] = -s; break;
    case 5: out[0] = -s; out[1] = -c; break;
    case 6: out[0] = s; out[1] = -c; break;
    default: out[0] = c; out[1] = -s; break;
  }
}

/** k/n of a turn as a binary angle. */
export function fractionOfTurn(k: number, n: number): number {
  return Math.floor((k * TURN) / n) >>> 0;
}
