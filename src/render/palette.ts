// Planet colours (PLAN §12): 12, light enough to carry a dark number, far
// apart in OKLab, and with cycle neighbours (each planet's hunter and
// quarry, for every N) still apart under simulated protanopia,
// deuteranopia and tritanopia. Found by a search; palette.test.ts checks
// the properties. Numbers are always drawn, so colour is never the only cue.

export const PLANET_COLOURS = [
  '#d4f73e', '#91fbee', '#bc95a4', '#febfb4', '#fb6fce', '#3ede8d',
  '#4fb31c', '#b384fd', '#f8753e', '#a9c9f8', '#d9af21', '#21b2d9',
] as const;

/** The colour of planet number k (1-based). */
export function planetColour(k: number): string {
  return PLANET_COLOURS[(k - 1) % PLANET_COLOURS.length]!;
}

/** Numbers, the notch and the planet outline are drawn in this. */
export const INK = '#0b0d12';
/** Your planet, your quarry and your hunter are marked in this, by shape. */
export const MARK = '#ffffff';
export const ARENA = '#121620';
export const RING_GUIDE = '#283044';
