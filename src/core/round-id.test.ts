import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { formatRoundId, generateRoundId, joinLink, nextRoundId, normalizeRoundId, roundIdFromHash } from './round-id';

const SHAPE = /^[0-9A-HJKMNP-TV-Z]{21}$/;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

describe('round ID', () => {
  it('generates 21 Crockford characters with a valid check', () => {
    for (let i = 0; i < 100; i++) {
      const id = generateRoundId();
      expect(id).toMatch(SHAPE);
      expect(normalizeRoundId(id)).toBe(id);
    }
  });

  it('formats in groups of four', () => {
    expect(formatRoundId('K7QM2XDP4TR8WHZN3VBC7')).toBe('K7QM-2XDP-4TR8-WHZN-3VBC-7');
  });

  it('accepts dashes, spaces, lowercase and the Crockford look-alikes', () => {
    const id = generateRoundId();
    expect(normalizeRoundId(formatRoundId(id).toLowerCase())).toBe(id);
    expect(normalizeRoundId(formatRoundId(id).replace(/-/g, ' '))).toBe(id);
    expect(normalizeRoundId(id.replace(/0/g, 'O').replace(/1/g, 'I'))).toBe(id);
    expect(normalizeRoundId(id.replace(/1/g, 'l'))).toBe(id);
  });

  it('rejects every single wrong character', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20 }), fc.integer({ min: 1, max: 31 }), (pos, shift) => {
        const id = generateRoundId();
        const swapped = ALPHABET[(ALPHABET.indexOf(id[pos]!) + shift) % 32]!;
        const bad = id.slice(0, pos) + swapped + id.slice(pos + 1);
        return normalizeRoundId(bad) === null;
      }),
    );
  });

  it('rejects wrong lengths and letters outside the alphabet', () => {
    const id = generateRoundId();
    expect(normalizeRoundId(id.slice(0, 20))).toBeNull();
    expect(normalizeRoundId(id + '0')).toBeNull();
    expect(normalizeRoundId('')).toBeNull();
    expect(normalizeRoundId('UUUU-UUUU-UUUU-UUUU-UUUU-U')).toBeNull();
  });

  it('derives the same Play again ID for every press, and a different one each round (Q-8)', async () => {
    const id = generateRoundId();
    const next = await nextRoundId(id);
    expect(next).toMatch(SHAPE);
    expect(normalizeRoundId(next)).toBe(next);
    expect(await nextRoundId(id)).toBe(next);
    expect(next).not.toBe(id);
    expect(await nextRoundId(next)).not.toBe(next);
  });

  it('reads and writes #join= links', () => {
    const id = generateRoundId();
    const link = joinLink('https://example.test/play/?x=1#old', id);
    expect(link).toBe(`https://example.test/play/?x=1#join=${id}`);
    expect(roundIdFromHash(`#join=${id}`)).toBe(id);
    expect(roundIdFromHash(`#join=${formatRoundId(id).toLowerCase()}`)).toBe(id);
    expect(roundIdFromHash('#join=nonsense')).toBeNull();
    expect(roundIdFromHash('')).toBeNull();
  });
});
