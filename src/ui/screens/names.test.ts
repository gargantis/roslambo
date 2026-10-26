import { describe, expect, it } from 'vitest';
import { playerName } from './arena';

describe('player labels', () => {
  it('shows the display name', () => {
    expect(playerName('Ada', 'a'.repeat(32))).toBe('Ada');
  });

  it('labels a player without a name by their player ID, which stays with their browser, not by planet number', () => {
    expect(playerName('', '3f2a' + '0'.repeat(28))).toBe('Player 3F2A');
  });
});
