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

/** Numbers and the orientation pip are drawn in this. */
export const INK = '#0b0d12';
/** Your planet's ring. Your quarry's and your hunter's marks differ in
 *  shape as well as colour, so they never rely on colour alone. */
export const MARK = '#ffffff';
/** Your quarry's ring, in four arcs. */
export const QUARRY = '#ffc145';
/** Your hunter's ring, dashed. */
export const HUNTER = '#ff5470';
export const ARENA = '#121620';
export const RING_GUIDE = '#283044';
/** Over each planet's colour: lit from the top left, darker at the limb. */
export const SHADE = ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)', 'rgba(11,13,18,0.34)'] as const;
/** A thrusting planet's flame, from its base to its tip. */
export const FLAME = ['rgba(255,240,180,0.95)', 'rgba(255,140,60,0.8)', 'rgba(255,90,40,0)'] as const;
/** Names under the planets, outlined so they read over anything. */
export const LABEL = '#d7deea';
export const LABEL_OUTLINE = 'rgba(11,13,18,0.92)';
