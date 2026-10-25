import { describe, expect, it } from 'vitest';
import { playersCap } from '../../config';
import { checkSettings } from './propose';

describe('Propose checks (REQUIREMENTS "Proposing")', () => {
  it('accepts whole numbers within the limits', () => {
    expect(checkSettings({ ante: 1, minPlayers: 3, maxPlayers: 3 })).toBeNull();
    expect(checkSettings({ ante: 50, minPlayers: 3, maxPlayers: playersCap })).toBeNull();
  });

  it('refuses an ante below 1 or not whole', () => {
    expect(checkSettings({ ante: 0, minPlayers: 3, maxPlayers: 8 })).toMatch(/ante/);
    expect(checkSettings({ ante: 2.5, minPlayers: 3, maxPlayers: 8 })).toMatch(/ante/);
    expect(checkSettings({ ante: Number.NaN, minPlayers: 3, maxPlayers: 8 })).toMatch(/ante/);
  });

  it('refuses a minimum below 3, a maximum below the minimum, and one above the cap', () => {
    expect(checkSettings({ ante: 1, minPlayers: 2, maxPlayers: 8 })).toMatch(/minimum/);
    expect(checkSettings({ ante: 1, minPlayers: 5, maxPlayers: 4 })).toMatch(/at least the minimum/);
    expect(checkSettings({ ante: 1, minPlayers: 3, maxPlayers: playersCap + 1 })).toMatch(/at most/);
  });
});
