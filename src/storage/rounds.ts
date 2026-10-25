// Saved rounds (PLAN §10, A.3): the newest final state of each round this
// browser plays in, saved every second and on pagehide, so a round that
// everyone left can resume (§8.5). Removed once the round is settled.

import type { SavedTimeline } from '../core/session/session';
import { decodeState, encodeState } from '../core/sim/codec';
import { hash64 } from '../core/sim/hash';
import type { RoundState } from '../core/sim/state';
import { browserStorage, fromBase64, keysWith, toBase64, tryRead, tryWrite, type KeyValue } from './kv';

export const ROUND_PREFIX = 'roslambo.v1.round.';

export class SavedRounds {
  private readonly kv: KeyValue | null;

  constructor(kv: KeyValue | null = browserStorage()) {
    this.kv = kv;
  }

  save(roundId: string, timelineId: string, state: RoundState, now: number): boolean {
    const v = { v: 1, timelineId, tick: state.tick, state: toBase64(encodeState(state)), savedAt: now };
    return tryWrite(this.kv, ROUND_PREFIX + roundId, JSON.stringify(v));
  }

  /** The save, or null if there is none or it doesn't read back. */
  load(roundId: string): SavedTimeline | null {
    const raw = tryRead(this.kv, ROUND_PREFIX + roundId);
    if (raw === null) return null;
    try {
      const x = JSON.parse(raw) as Record<string, unknown>;
      if (x['v'] !== 1 || typeof x['timelineId'] !== 'string' || !/^[0-9a-f]{16}$/.test(x['timelineId'])) return null;
      const bytes = typeof x['state'] === 'string' ? fromBase64(x['state']) : null;
      const state = bytes ? decodeState(bytes) : null;
      if (!bytes || !state || state.tick !== x['tick']) return null;
      return { timelineId: x['timelineId'], state, hash: hash64(bytes) };
    } catch {
      return null;
    }
  }

  remove(roundId: string): void {
    tryWrite(this.kv, ROUND_PREFIX + roundId, null);
  }

  ids(): string[] {
    return this.kv ? keysWith(this.kv, ROUND_PREFIX).map((k) => k.slice(ROUND_PREFIX.length)) : [];
  }
}
