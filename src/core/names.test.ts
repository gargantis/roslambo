import { describe, expect, it } from 'vitest';
import { fitName } from './names';

describe('display names (Q-22)', () => {
  it('keeps a short name and trims spaces', () => {
    expect(fitName('  Ada  ')).toBe('Ada');
  });

  it('cuts to 20 characters, counting characters rather than code units', () => {
    expect(fitName('x'.repeat(25))).toBe('x'.repeat(20));
    expect([...fitName('🪐'.repeat(25))]).toHaveLength(8); // 4 bytes each, so the byte limit binds
  });

  it('cuts to 32 bytes on a character boundary', () => {
    const name = fitName('é'.repeat(20)); // 2 bytes each
    expect(name).toBe('é'.repeat(16));
  });

  it('removes control characters', () => {
    expect(fitName('a\u0000b\nc\u007f')).toBe('abc');
  });
});
