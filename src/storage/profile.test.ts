import { describe, expect, it } from 'vitest';
import { payAnte, settle } from '../core/ledger/ledger';
import { MemoryStorage } from './kv';
import { BACKUP_KEY, PROFILE_KEY, ProfileStore, parseProfile } from './profile';

const ID = '0123456789abcdef0123456789abcdef';

describe('the profile store (D-18)', () => {
  it('creates a profile once and reads it back on the next visit', () => {
    const kv = new MemoryStorage();
    const a = new ProfileStore(kv, () => ID);
    expect(a.get()).toEqual({ v: 1, playerId: ID, name: '', balance: 0, rounds: {} });
    a.update((p) => { p.name = 'Ada'; return true; });
    const b = new ProfileStore(kv, () => 'f'.repeat(32));
    expect(b.get().playerId).toBe(ID);
    expect(b.get().name).toBe('Ada');
  });

  it('backs up an unreadable profile before starting a fresh one', () => {
    const kv = new MemoryStorage();
    kv.setItem(PROFILE_KEY, '{"v":1,"playerId":"nope"');
    const s = new ProfileStore(kv, () => ID);
    expect(kv.getItem(BACKUP_KEY)).toBe('{"v":1,"playerId":"nope"');
    expect(s.get().playerId).toBe(ID);
  });

  it('writes a credit and its settled mark together: a failed write loses both, never one (P6)', () => {
    const kv = new MemoryStorage();
    const s = new ProfileStore(kv, () => ID);
    s.update((p) => payAnte(p, 'R', 5, 0));
    kv.failNextWrite = true;
    s.update((p) => settle(p, 'R', 5, 9, 1)); // the tab closed during this write
    const reloaded = new ProfileStore(kv, () => ID);
    expect(reloaded.get().balance).toBe(-5);
    expect(reloaded.get().rounds['R']).toMatchObject({ antePaid: true, settled: false });
    reloaded.update((p) => settle(p, 'R', 5, 9, 2)); // the result arrives again
    reloaded.update((p) => settle(p, 'R', 5, 9, 3)); // and again
    expect(new ProfileStore(kv, () => ID).get().balance).toBe(4);
  });

  it('works without storage, and says so', () => {
    const s = new ProfileStore(null, () => ID);
    expect(s.persistent).toBe(false);
    s.update((p) => { p.balance = 3; return true; });
    expect(s.get().balance).toBe(3);
  });

  it('rejects records of the wrong shape', () => {
    expect(parseProfile('[]')).toBeNull();
    expect(parseProfile(JSON.stringify({ v: 2, playerId: ID, name: '', balance: 0, rounds: {} }))).toBeNull();
    expect(parseProfile(JSON.stringify({ v: 1, playerId: ID, name: '', balance: 0.5, rounds: {} }))).toBeNull();
    expect(parseProfile(JSON.stringify({ v: 1, playerId: ID, name: '', balance: 0, rounds: { R: { ante: 1 } } }))).toBeNull();
    expect(parseProfile(JSON.stringify({ v: 1, playerId: ID, name: 'x', balance: -3, rounds: {} }))?.balance).toBe(-3);
  });
});
