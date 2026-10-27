import { describe, expect, it } from 'vitest';
import { config } from '../config';
import type { ResultRecord } from '../core/protocol/messages';
import { encodeState } from '../core/sim/codec';
import { hash64 } from '../core/sim/hash';
import { genesis } from '../core/sim/state';
import { MemoryStorage } from './kv';
import { ROUND_PREFIX, SavedRounds } from './rounds';
import { relayProblem, SETTINGS_KEY, SettingsStore, turnProblem } from './settings';
import { WitnessStore } from './witness';

const id = (k: number): string => (k + 1).toString(16).padStart(32, '0');
const DAY = 86_400_000;

function record(round: string): ResultRecord {
  return { round, ante: 3, freezeTick: 1234, finalHash: '0123456789abcdef', players: [{ player: id(1), name: 'Ada', points: 6 }, { player: id(2), name: '', points: 0 }] };
}

describe('saved rounds (§10)', () => {
  it('reads back the state, its hash and its timeline', () => {
    const kv = new MemoryStorage();
    const s = { ...genesis({ ante: 4, minPlayers: 3, maxPlayers: 5 }), tick: 321 };
    new SavedRounds(kv).save('R1', 'ab'.repeat(8), s, 0);
    const back = new SavedRounds(kv).load('R1')!;
    expect(back.state).toEqual(s);
    expect(back.hash).toBe(hash64(encodeState(s)));
    expect(back.timelineId).toBe('ab'.repeat(8));
    expect(new SavedRounds(kv).ids()).toEqual(['R1']);
  });

  it('ignores a damaged save', () => {
    const kv = new MemoryStorage();
    kv.setItem(`${ROUND_PREFIX}R`, JSON.stringify({ v: 1, timelineId: 'ab'.repeat(8), tick: 1, state: 'not base64!', savedAt: 0 }));
    expect(new SavedRounds(kv).load('R')).toBeNull();
    kv.setItem(`${ROUND_PREFIX}R`, '{');
    expect(new SavedRounds(kv).load('R')).toBeNull();
  });
});

describe('witness records (§8.7, Q-10)', () => {
  it('keeps a result until every player has acknowledged it', () => {
    const w = new WitnessStore(new MemoryStorage());
    w.put(record('R'), [id(1), id(2)], 0);
    expect(w.get('R')!.record).toEqual(record('R'));
    expect(w.acknowledge('R', id(1))).toBe(true);
    expect(w.acknowledge('R', id(1))).toBe(false);
    expect(w.get('R')!.unacknowledged).toEqual([id(2)]);
    w.acknowledge('R', id(2));
    expect(w.get('R')).toBeNull();
  });

  it('stores nothing when nobody is waiting, drops expired records, and keeps the newest 20', () => {
    const w = new WitnessStore(new MemoryStorage());
    w.put(record('none'), [], 0);
    expect(w.get('none')).toBeNull();
    for (let i = 0; i < 25; i++) w.put(record(`R${i}`), [id(2)], i * 1000);
    const kept = w.list(25_000);
    expect(kept).toHaveLength(config.witnessedRoundsKept);
    expect(kept[0]!.roundId).toBe('R24');
    expect(kept.some((x) => x.roundId === 'R4')).toBe(false);
    expect(w.list(31 * DAY)).toEqual([]);
  });
});

describe('settings (§11)', () => {
  it('accepts wss relays and complete TURN servers, and says what is wrong otherwise', () => {
    expect(relayProblem('wss://relay.example.com')).toBeNull();
    expect(relayProblem('ws://relay.example.com')).toMatch(/wss/);
    expect(relayProblem('relay.example.com')).toMatch(/URL/);
    expect(relayProblem('wss://user:pw@relay.example.com')).toMatch(/password/);
    expect(turnProblem({ urls: 'turns:turn.example.com:443', username: 'u', credential: 'c' })).toBeNull();
    expect(turnProblem({ urls: 'stun:x', username: 'u', credential: 'c' })).toMatch(/turn:/);
    expect(turnProblem({ urls: 'turn:x', username: '', credential: 'c' })).toMatch(/user name/);
  });

  it('stores valid settings and refuses invalid ones', () => {
    const kv = new MemoryStorage();
    const s = new SettingsStore(kv);
    expect(s.set({ relays: ['wss://a.example'], turn: [{ urls: 'turn:t.example', username: 'u', credential: 'c' }], names: true })).toBeNull();
    expect(s.set({ relays: ['http://nope'], turn: [], names: false })).toMatch(/wss/);
    expect(new SettingsStore(kv).get()).toEqual({ relays: ['wss://a.example'], turn: [{ urls: 'turn:t.example', username: 'u', credential: 'c' }], names: true });
  });

  it('shows no names under the planets until a player chooses them, including in settings saved before the choice existed', () => {
    expect(new SettingsStore(new MemoryStorage()).get().names).toBe(false);
    const kv = new MemoryStorage();
    kv.setItem(SETTINGS_KEY, JSON.stringify({ v: 1, relays: ['wss://a.example'], turn: [] }));
    expect(new SettingsStore(kv).get()).toEqual({ relays: ['wss://a.example'], turn: [], names: false });
  });
});
