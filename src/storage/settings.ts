// Settings (PLAN §11, A.3): extra signalling relays, the player's own
// TURN server, and whether names show under the planets (the owner,
// 2026-10-26). Checked when typed; used by every room opened after.

import { browserStorage, tryRead, tryWrite, type KeyValue } from './kv';

export const SETTINGS_KEY = 'roslambo.v1.settings';

export interface TurnServer {
  urls: string;
  username: string;
  credential: string;
}

export interface Settings {
  relays: string[];
  turn: TurnServer[];
  names: boolean; // draw names under the planets; off unless chosen
}

const MAX_RELAYS = 10;

/** Null if this is a relay URL roslambo will use, else why not. */
export function relayProblem(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return `“${url}” isn’t a URL.`;
  }
  if (u.protocol !== 'wss:') return `“${url}” must start with wss://.`;
  if (u.username || u.password) return `“${url}” mustn’t contain a user name or password.`;
  return null;
}

/** Null if this TURN server is complete, else what's missing. */
export function turnProblem(t: TurnServer): string | null {
  if (!/^turns?:[^\s]+$/.test(t.urls)) return 'A TURN URL starts with turn: or turns:, for example turns:turn.example.com:443.';
  if (!t.username || !t.credential) return 'A TURN server needs its user name and credential.';
  return null;
}

function parse(raw: string | null): Settings {
  const empty: Settings = { relays: [], turn: [], names: false };
  if (raw === null) return empty;
  try {
    const x = JSON.parse(raw) as Record<string, unknown>;
    if (x['v'] !== 1) return empty;
    const relays = Array.isArray(x['relays']) ? x['relays'].filter((r): r is string => typeof r === 'string' && relayProblem(r) === null) : [];
    const turn = Array.isArray(x['turn'])
      ? (x['turn'] as unknown[]).filter((t): t is TurnServer => {
        const o = t as Record<string, unknown>;
        return typeof o?.['urls'] === 'string' && typeof o['username'] === 'string' && typeof o['credential'] === 'string' && turnProblem(o as unknown as TurnServer) === null;
      })
      : [];
    return { relays: relays.slice(0, MAX_RELAYS), turn, names: x['names'] === true };
  } catch {
    return empty;
  }
}

export class SettingsStore {
  private readonly kv: KeyValue | null;
  private value: Settings;

  constructor(kv: KeyValue | null = browserStorage()) {
    this.kv = kv;
    this.value = parse(tryRead(kv, SETTINGS_KEY));
  }

  get(): Settings {
    return structuredClone(this.value);
  }

  /** Stores valid settings; returns the first problem otherwise. */
  set(s: Settings): string | null {
    if (s.relays.length > MAX_RELAYS) return `At most ${MAX_RELAYS} extra relays.`;
    for (const r of s.relays) {
      const p = relayProblem(r);
      if (p) return p;
    }
    for (const t of s.turn) {
      const p = turnProblem(t);
      if (p) return p;
    }
    this.value = structuredClone(s);
    tryWrite(this.kv, SETTINGS_KEY, JSON.stringify({ v: 1, ...s }));
    return null;
  }
}
