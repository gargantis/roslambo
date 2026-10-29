import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { botId } from '../bot/bot';
import { forget, isPractice, noteJoined, notePractice, payAnte, prune, settle, settlePractice, unsettled, type Profile } from './ledger';

const fresh = (): Profile => ({ v: 1, playerId: 'a'.repeat(32), name: '', balance: 0, rounds: {} });
const DAY = 86_400_000;

describe('the ledger (P6)', () => {
  it('pays the ante once and credits the result once', () => {
    const p = fresh();
    expect(noteJoined(p, 'R', 5, 0)).toBe(true);
    expect(noteJoined(p, 'R', 5, 1)).toBe(false);
    expect(p.balance).toBe(0);
    expect(payAnte(p, 'R', 5, 2)).toBe(true);
    expect(payAnte(p, 'R', 5, 3)).toBe(false);
    expect(p.balance).toBe(-5);
    expect(unsettled(p)).toEqual(['R']);
    expect(settle(p, 'R', 5, 8, 4)).toBe(true);
    expect(settle(p, 'R', 5, 8, 5)).toBe(false);
    expect(p.balance).toBe(3); // a net change of 8 − 5
    expect(unsettled(p)).toEqual([]);
  });

  it('pays and settles in one step when the result is the first news of the start', () => {
    const p = fresh();
    noteJoined(p, 'R', 4, 0);
    expect(settle(p, 'R', 4, 0, 1)).toBe(true);
    expect(p.balance).toBe(-4);
    expect(p.rounds['R']).toMatchObject({ antePaid: true, settled: true });
  });

  it('keeps the balance equal to the sum of net changes, whatever order and repeats the calls come in', () => {
    const call = fc.record({ round: fc.constantFrom('A', 'B', 'C'), op: fc.constantFrom('join', 'pay', 'settle') });
    fc.assert(fc.property(fc.array(call, { maxLength: 40 }), (calls) => {
      const p = fresh();
      const ante = { A: 3, B: 5, C: 1 } as Record<string, number>;
      const points = { A: 0, B: 9, C: 2 } as Record<string, number>;
      for (const c of calls) {
        if (c.op === 'join') noteJoined(p, c.round, ante[c.round]!, 0);
        else if (c.op === 'pay') payAnte(p, c.round, ante[c.round]!, 0);
        else settle(p, c.round, ante[c.round]!, points[c.round]!, 0);
      }
      let expected = 0;
      for (const [id, e] of Object.entries(p.rounds)) {
        if (e.antePaid) expected -= ante[id]!;
        if (e.settled) expected += points[id]!;
      }
      expect(p.balance).toBe(expected);
    }));
  });

  it('forgets old settled rounds but keeps unsettled ones', () => {
    const p = fresh();
    settle(p, 'old', 2, 2, 0);
    payAnte(p, 'waiting', 2, 0);
    settle(p, 'recent', 2, 2, 29 * DAY);
    expect(prune(p, 31 * DAY, 30 * DAY)).toBe(true);
    expect(Object.keys(p.rounds).sort()).toEqual(['recent', 'waiting']);
  });

  it('neither pays nor credits a practice round, and forgets it at its result (Q-23)', () => {
    const p = fresh();
    noteJoined(p, 'R', 5, 0);
    expect(notePractice(p, 'R', 5, 1)).toBe(true);
    expect(notePractice(p, 'R', 5, 2)).toBe(false);
    expect(p.rounds['R']).toMatchObject({ practice: true, antePaid: false, settled: false });
    expect(unsettled(p)).toEqual([]);
    expect(settlePractice(p, 'R', 5, 9, 3)).toBe(true);
    expect(settlePractice(p, 'R', 5, 9, 4)).toBe(false);
    expect(p.rounds['R']).toBeUndefined();
    // A result that is the first news of the start forgets the round too.
    noteJoined(p, 'S', 5, 5);
    expect(settlePractice(p, 'S', 5, 0, 6)).toBe(true);
    expect(p.balance).toBe(0);
    // A paid ante is never stranded: that round settles as usual.
    payAnte(p, 'T', 5, 7);
    expect(notePractice(p, 'T', 5, 8)).toBe(false);
    expect(settlePractice(p, 'T', 5, 9, 9)).toBe(true);
    expect(p.balance).toBe(4);
  });

  it('tells a practice round by its players: one of them is a bot', () => {
    const me = 'a'.repeat(32);
    expect(isPractice([me, 'b'.repeat(32)])).toBe(false);
    expect(isPractice([me, botId(me, 0)])).toBe(true);
    expect(isPractice([botId(me, 0), botId(me, 1), botId(me, 2)])).toBe(true);
  });

  it('forgets a round that never started for this player, but never one it paid for', () => {
    const p = fresh();
    noteJoined(p, 'left', 3, 0);
    payAnte(p, 'paid', 3, 0);
    expect(forget(p, 'left')).toBe(true);
    expect(forget(p, 'paid')).toBe(false);
    expect(Object.keys(p.rounds)).toEqual(['paid']);
  });
});
