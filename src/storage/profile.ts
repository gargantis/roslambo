// The profile record (PLAN §10, A.3): player ID, display name, balance and
// the round ledger, under one key. Every change is one setItem of the
// whole record, so a credit and its "settled" mark land together (D-18).
// An unreadable record is copied to a backup key before a fresh one
// replaces it, so a parsing bug can't silently zero a balance.

import type { LedgerEntry, Profile } from '../core/ledger/ledger';
import { fitName } from '../core/names';
import { browserStorage } from './kv';

export const PROFILE_KEY = 'roslambo.v1.profile';
export const BACKUP_KEY = 'roslambo.v1.profile.backup';

/** What the store needs from localStorage. */
export type KeyValue = Pick<Storage, 'getItem' | 'setItem'>;

/** D-20: once per browser. */
export function newPlayerId(): string {
  return crypto.randomUUID().replace(/-/g, '').toLowerCase();
}

const ID_RE = /^[0-9a-f]{32}$/;

function isEntry(e: unknown): e is LedgerEntry {
  if (typeof e !== 'object' || e === null) return false;
  const x = e as Record<string, unknown>;
  return Number.isSafeInteger(x['ante']) && typeof x['joined'] === 'boolean' && typeof x['antePaid'] === 'boolean'
    && typeof x['settled'] === 'boolean' && typeof x['seenAt'] === 'number';
}

/** A stored profile, or null if it isn't one. */
export function parseProfile(raw: string): Profile | null {
  let x: unknown;
  try {
    x = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof x !== 'object' || x === null) return null;
  const p = x as Record<string, unknown>;
  if (p['v'] !== 1 || typeof p['playerId'] !== 'string' || !ID_RE.test(p['playerId'])) return null;
  if (typeof p['name'] !== 'string' || !Number.isSafeInteger(p['balance'])) return null;
  const rounds = p['rounds'];
  if (typeof rounds !== 'object' || rounds === null || Array.isArray(rounds)) return null;
  if (!Object.values(rounds).every(isEntry)) return null;
  return { v: 1, playerId: p['playerId'], name: fitName(p['name']), balance: p['balance'] as number, rounds: rounds as Record<string, LedgerEntry> };
}

export class ProfileStore {
  /** False when the browser refused to store the profile: it lasts only
   *  until the page closes. */
  persistent = true;
  private profile: Profile;
  private readonly kv: KeyValue | null;

  constructor(kv: KeyValue | null = browserStorage(), makeId: () => string = newPlayerId) {
    this.kv = kv;
    let raw: string | null = null;
    try {
      raw = kv?.getItem(PROFILE_KEY) ?? null;
    } catch {
      this.persistent = false;
    }
    const parsed = raw === null ? null : parseProfile(raw);
    if (parsed) {
      this.profile = parsed;
      return;
    }
    if (raw !== null) this.write(BACKUP_KEY, raw);
    this.profile = { v: 1, playerId: makeId(), name: '', balance: 0, rounds: {} };
    this.write(PROFILE_KEY, JSON.stringify(this.profile));
  }

  /** A copy: change it through update(). */
  get(): Profile {
    return structuredClone(this.profile);
  }

  /** Applies a change and stores the whole profile in one write if the
   *  change says it changed something. */
  update(change: (p: Profile) => boolean): boolean {
    const next = structuredClone(this.profile);
    if (!change(next)) return false;
    this.profile = next;
    this.write(PROFILE_KEY, JSON.stringify(next));
    return true;
  }

  private write(key: string, value: string): void {
    try {
      if (!this.kv) throw new Error('no storage');
      this.kv.setItem(key, value);
    } catch {
      this.persistent = false;
    }
  }
}
