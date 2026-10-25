// Witness records (PLAN §8.7, A.3, Q-10): the result of a round this
// browser saw end, with the players who haven't acknowledged it yet. At
// most 20, the oldest dropped first; each kept 30 days; dropped as soon as
// everyone has acknowledged.

import { config } from '../config';
import type { ResultRecord } from '../core/protocol/messages';
import { recordBytes, recordFromBytes } from '../core/results/record';
import { browserStorage, fromBase64, keysWith, toBase64, tryRead, tryWrite, type KeyValue } from './kv';

export const WITNESS_PREFIX = 'roslambo.v1.witness.';
const DAY_MS = 86_400_000;

export interface Witnessed {
  roundId: string;
  record: ResultRecord;
  unacknowledged: string[];
  expiresAt: number;
}

export class WitnessStore {
  private readonly kv: KeyValue | null;

  constructor(kv: KeyValue | null = browserStorage()) {
    this.kv = kv;
  }

  /** Keep a result until these players acknowledge it. */
  put(record: ResultRecord, unacknowledged: string[], now: number): void {
    const key = WITNESS_PREFIX + record.round;
    if (unacknowledged.length === 0) {
      tryWrite(this.kv, key, null);
      return;
    }
    const expiresAt = now + config.resultRetentionDays * DAY_MS;
    tryWrite(this.kv, key, JSON.stringify({ v: 1, record: toBase64(recordBytes(record)), unacknowledged, expiresAt }));
    const all = this.list(now);
    for (const old of all.slice(config.witnessedRoundsKept)) tryWrite(this.kv, WITNESS_PREFIX + old.roundId, null);
  }

  get(roundId: string): Witnessed | null {
    const raw = tryRead(this.kv, WITNESS_PREFIX + roundId);
    if (raw === null) return null;
    try {
      const x = JSON.parse(raw) as Record<string, unknown>;
      const bytes = x['v'] === 1 && typeof x['record'] === 'string' ? fromBase64(x['record']) : null;
      const record = bytes ? recordFromBytes(bytes) : null;
      const un = x['unacknowledged'];
      if (!record || record.round !== roundId || !Array.isArray(un) || !un.every((p) => typeof p === 'string') || typeof x['expiresAt'] !== 'number') return null;
      return { roundId, record, unacknowledged: un as string[], expiresAt: x['expiresAt'] };
    } catch {
      return null;
    }
  }

  /** A player sent SETTLED: true if this browser was waiting for it. */
  acknowledge(roundId: string, player: string): boolean {
    const w = this.get(roundId);
    if (!w || !w.unacknowledged.includes(player)) return false;
    const left = w.unacknowledged.filter((p) => p !== player);
    if (left.length === 0) tryWrite(this.kv, WITNESS_PREFIX + roundId, null);
    else tryWrite(this.kv, WITNESS_PREFIX + roundId, JSON.stringify({ v: 1, record: toBase64(recordBytes(w.record)), unacknowledged: left, expiresAt: w.expiresAt }));
    return true;
  }

  /** Live records, newest first; expired and unreadable ones are removed. */
  list(now: number): Witnessed[] {
    if (!this.kv) return [];
    const out: Witnessed[] = [];
    for (const key of keysWith(this.kv, WITNESS_PREFIX)) {
      const w = this.get(key.slice(WITNESS_PREFIX.length));
      if (!w || w.expiresAt <= now) tryWrite(this.kv, key, null);
      else out.push(w);
    }
    return out.sort((a, b) => b.expiresAt - a.expiresAt);
  }
}
