import { describe, expect, it } from 'vitest';
import { arenaLayout, LAYOUT } from './layout';

describe('arena layout (PLAN §11)', () => {
  it('fills the width of an upright phone, with the buttons below (a Pixel 8a in Chrome)', () => {
    expect(arenaLayout(412, 780)).toEqual({ mode: 'below', arena: 412 - 2 * LAYOUT.gutter });
  });

  it('fills the height of a phone held sideways, with the buttons beside (Q-20)', () => {
    const l = arenaLayout(915, 360);
    expect(l.mode).toBe('beside');
    expect(l.arena).toBe(360 - 2 * LAYOUT.gutter);
  });

  it('centres a capped arena on a desktop, with the buttons below', () => {
    expect(arenaLayout(1920, 1080)).toEqual({ mode: 'below', arena: LAYOUT.maxArena });
  });

  it('is limited by the height when the window is short and wide but not sideways-phone wide', () => {
    const l = arenaLayout(1280, 600);
    expect(l.arena).toBeLessThanOrEqual(600 - 2 * LAYOUT.gutter);
    expect(l.arena).toBeGreaterThan(400);
  });

  it('gives spectators, who have no buttons, a larger arena', () => {
    expect(arenaLayout(412, 480, false).arena).toBeGreaterThan(arenaLayout(412, 480, true).arena);
  });

  it('never goes below the minimum size', () => {
    expect(arenaLayout(100, 100).arena).toBe(LAYOUT.minArena);
  });
});
