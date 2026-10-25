import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { encodeState as encodeRoundState } from '../sim/codec';
import { makeParams } from '../sim/params';
import { JOIN, READY, step } from '../sim/rules';
import { genesis } from '../sim/state';
import { MAX_MESSAGE } from './bytes';
import {
  decode, encodeAgain, encodeFwd, encodeHello, encodePeers, encodeRefuse, encodeResult, encodeResultReq,
  encodeSettled, encodeState, encodeStateReq, encodeTick, NO_TICK, PROTOCOL_VERSION, ROLE, T, TIMELINE, ZERO_HASH,
  type InputRecord, type StateMsg, type Tick,
} from './messages';

const id = (k: number): string => (k + 1).toString(16).padStart(32, '0');
const hash = 'a1b2c3d4e5f60718';

const tick: Omit<Tick, 'type'> = {
  t: 1234, buttons: 5, voteTick: 1200, voteHash: hash, phase: 0.25, histMask: 0b1010_0000_0000_0011,
  hist: [1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7, 0],
  events: [{ back: 0, events: JOIN | READY, name: 'Ana' }, { back: 3, events: READY, name: '' }],
};

function roundState(players: number): { bytes: Uint8Array; roster: string[] } {
  const s = genesis({ ante: 5, minPlayers: 3, maxPlayers: 12 });
  step(s, Array.from({ length: players }, (_, k) => ({ id: id(k), buttons: 0, events: JOIN, name: `P${k}` })), makeParams());
  return { bytes: encodeRoundState(s), roster: s.planets.map((p) => p.id) };
}

describe('wire protocol (PLAN §9)', () => {
  it('round-trips every message', () => {
    const { bytes, roster } = roundState(4);
    const inputs: InputRecord[][] = [
      [{ player: id(0), buttons: 1, events: 0, name: '' }, { player: id(9), buttons: 0, events: JOIN, name: 'Late' }],
      [],
      [{ player: id(2), buttons: 7, events: READY, name: '' }],
    ];
    const cases: [Uint8Array, unknown][] = [
      [encodeHello({ protocol: PROTOCOL_VERSION, build: hash, player: id(3), role: ROLE.PLAYER, timeline: hash, timelineKind: TIMELINE.LIVE, phase: 1, finalTick: 99, hash, holdsResult: false, name: 'Zoë' }),
        { type: T.HELLO, protocol: PROTOCOL_VERSION, build: hash, player: id(3), role: ROLE.PLAYER, timeline: hash, timelineKind: TIMELINE.LIVE, phase: 1, finalTick: 99, hash, holdsResult: false, name: 'Zoë' }],
      [encodeRefuse(3), { type: T.REFUSE, reason: 3 }],
      [encodeTick(tick), { type: T.TICK, ...tick }],
      [encodeFwd(id(7), encodeTick(tick)), { type: T.FWD, origin: id(7), tick: { type: T.TICK, ...tick } }],
      [encodePeers([id(1), id(2)]), { type: T.PEERS, players: [id(1), id(2)] }],
      [encodeAgain(), { type: T.AGAIN }],
      [encodeStateReq(NO_TICK, ''), { type: T.STATE_REQ, tick: NO_TICK, want: ZERO_HASH }],
      [encodeState({ timeline: hash, senderTick: 50, phase: 0.5, g: 30, senderFinal: 38, state: bytes, roster, inputs }),
        { type: T.STATE, timeline: hash, senderTick: 50, phase: 0.5, g: 30, senderFinal: 38, state: bytes, roster, inputs }],
      [encodeResultReq(id(4)), { type: T.RESULT_REQ, player: id(4) }],
      [encodeResult({ round: 'K7QM2XDP4TR8WHZN3VBC7', ante: 5, freezeTick: 900, finalHash: hash, players: [{ player: id(0), name: 'A', points: 7 }, { player: id(1), name: '', points: -1 }] }),
        { type: T.RESULT, record: { round: 'K7QM2XDP4TR8WHZN3VBC7', ante: 5, freezeTick: 900, finalHash: hash, players: [{ player: id(0), name: 'A', points: 7 }, { player: id(1), name: '', points: -1 }] } }],
      [encodeSettled(id(5)), { type: T.SETTLED, player: id(5) }],
    ];
    for (const [bytes, want] of cases) expect(decode(bytes)).toEqual(want);
  });

  it('keeps a TICK small: 29 bytes without events', () => {
    expect(encodeTick({ ...tick, events: [] }).length).toBe(29);
  });

  it('fits STATE within 16,000 bytes by sending fewer input ticks', () => {
    const { bytes, roster } = roundState(12);
    const full: InputRecord[] = Array.from({ length: 12 }, (_, k) => ({ player: id(100 + k), buttons: 1, events: 0, name: '' }));
    const msg = encodeState({ timeline: hash, senderTick: 0, phase: 0, g: 0, senderFinal: 0, state: bytes, roster, inputs: Array(400).fill(full) });
    expect(msg.length).toBeLessThanOrEqual(MAX_MESSAGE);
    const back = decode(msg) as StateMsg;
    expect(back.inputs.length).toBeGreaterThan(10);
    expect(back.inputs.length).toBeLessThan(400);
  });

  it('never throws on arbitrary bytes, and rejects truncations', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 300 }), (b) => {
      decode(b);
      return true;
    }), { numRuns: 2000 });
    const msg = encodeTick(tick);
    for (let i = 0; i < msg.length; i++) expect(decode(msg.subarray(0, i))).toBeNull();
    expect(decode(new Uint8Array([...msg, 0]))).toBeNull();
  });

  it('rejects unknown event kinds and bad strings', () => {
    const msg = encodeTick({ ...tick, events: [{ back: 0, events: READY, name: '' }] });
    const bad = msg.slice();
    bad[30] = 9; // the kind byte
    expect(decode(bad)).toBeNull();
    const hello = encodeHello({ protocol: 1, build: hash, player: id(0), role: 1, timeline: ZERO_HASH, timelineKind: 0, phase: 0, finalTick: 0, hash: ZERO_HASH, holdsResult: false, name: 'ab' });
    const badUtf8 = hello.slice();
    badUtf8[badUtf8.length - 1] = 0xff;
    expect(decode(badUtf8)).toBeNull();
  });
});
