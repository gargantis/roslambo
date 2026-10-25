// The result record (PLAN A.2, §8.7): what a witness keeps and a settler
// asks for. Built from the confirmed frozen state, so every peer builds
// the same record.

import * as M from '../protocol/messages';
import { encodeState } from '../sim/codec';
import { hash64 } from '../sim/hash';
import type { RoundState } from '../sim/state';

/** The record of a frozen round. Its hash is of the state at the freeze
 *  tick: after it, a frozen state changes only its tick. */
export function resultRecord(roundId: string, s: RoundState): M.ResultRecord {
  return {
    round: roundId,
    ante: s.ante,
    freezeTick: s.freezeTick,
    finalHash: hash64(encodeState({ ...s, tick: s.freezeTick })),
    players: s.planets.map((p) => ({ player: p.id, name: p.name, points: p.points })),
  };
}

/** A.2 bytes: the RESULT payload without its type byte. */
export function recordBytes(r: M.ResultRecord): Uint8Array {
  return M.encodeResult(r).subarray(1);
}

export function recordFromBytes(b: Uint8Array): M.ResultRecord | null {
  const withType = new Uint8Array(b.length + 1);
  withType[0] = M.T.RESULT;
  withType.set(b, 1);
  const m = M.decode(withType);
  return m?.type === M.T.RESULT ? m.record : null;
}

/** This player's final points in a record, or null if it isn't in it. */
export function pointsOf(r: M.ResultRecord, player: string): number | null {
  return r.players.find((p) => p.player === player)?.points ?? null;
}
