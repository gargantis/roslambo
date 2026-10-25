// Arena layout maths (PLAN §11 "Layout"): the square arena as large as the
// window allows with the buttons below it (a phone upright, a desktop), or
// beside it when that gives a larger arena (a phone sideways, Q-20).

export const LAYOUT = {
  gutter: 16, // REQUIREMENTS: 16 px at the sides on a phone
  header: 52, // the scoreboard or status line above the arena
  buttonsBelow: 100, // the button row and its gap
  sideColumn: 176, // the button column, when it's beside the arena
  maxArena: 760,
  minArena: 160,
};

export interface Layout {
  mode: 'below' | 'beside';
  arena: number; // CSS pixels
}

export function arenaLayout(width: number, height: number, buttons = true): Layout {
  const g = LAYOUT.gutter;
  const reserved = LAYOUT.header + (buttons ? LAYOUT.buttonsBelow : g);
  const below = Math.min(width - 2 * g, height - reserved, LAYOUT.maxArena);
  const beside = Math.min(width - 3 * g - LAYOUT.sideColumn, height - 2 * g, LAYOUT.maxArena);
  const mode = beside > below ? 'beside' : 'below';
  return { mode, arena: Math.max(LAYOUT.minArena, Math.floor(mode === 'beside' ? beside : below)) };
}
