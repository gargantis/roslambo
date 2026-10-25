// The round ledger (PLAN §10, D-18): each round's ante is paid once and
// its result credited at most once (P6). Pure: these functions change a
// profile in memory and say whether they did; src/storage writes the whole
// profile in one step, so a closed tab can't leave half a transition.

export interface LedgerEntry {
  ante: number;
  joined: boolean;
  antePaid: boolean;
  settled: boolean;
  seenAt: number; // ms since the epoch
}

export interface Profile {
  v: 1;
  playerId: string; // 32 lowercase hex digits (D-20)
  name: string;
  balance: number;
  rounds: Record<string, LedgerEntry>;
}

function entry(p: Profile, roundId: string, ante: number, now: number): LedgerEntry {
  let e = p.rounds[roundId];
  if (!e) {
    e = { ante, joined: true, antePaid: false, settled: false, seenAt: now };
    p.rounds[roundId] = e;
  }
  return e;
}

/** The player's JOIN became final. */
export function noteJoined(p: Profile, roundId: string, ante: number, now: number): boolean {
  if (p.rounds[roundId]) return false;
  entry(p, roundId, ante, now);
  return true;
}

/** The round's start is confirmed with this player in it: pay the ante. */
export function payAnte(p: Profile, roundId: string, ante: number, now: number): boolean {
  const e = entry(p, roundId, ante, now);
  if (e.antePaid) return false;
  e.antePaid = true;
  e.seenAt = now;
  p.balance -= e.ante;
  return true;
}

/** The freeze is confirmed, or a result arrived: credit the final points.
 *  A player who first learns of the start here pays in the same write. */
export function settle(p: Profile, roundId: string, ante: number, finalPoints: number, now: number): boolean {
  const e = entry(p, roundId, ante, now);
  if (e.settled) return false;
  if (!e.antePaid) {
    e.antePaid = true;
    p.balance -= e.ante;
  }
  e.settled = true;
  e.seenAt = now;
  p.balance += finalPoints;
  return true;
}

/** Rounds whose ante was paid and whose result hasn't arrived (§8.7). */
export function unsettled(p: Profile): string[] {
  return Object.entries(p.rounds).filter(([, e]) => e.antePaid && !e.settled).map(([id]) => id);
}

/** Forget settled rounds, and rounds never started, older than the
 *  retention period. Unsettled rounds stay until settled. */
export function prune(p: Profile, now: number, retentionMs: number): boolean {
  let changed = false;
  for (const [id, e] of Object.entries(p.rounds)) {
    if ((e.settled || !e.antePaid) && now - e.seenAt > retentionMs) {
      delete p.rounds[id];
      changed = true;
    }
  }
  return changed;
}
