// The round state (PLAN §7.1). Everything here is canonical: encoded by
// codec.ts, hashed for votes, sent in STATE. Spectators and a proposer who
// hasn't joined as a player are not in it.

export const PRESTART = 0;
export const COUNTDOWN = 1;
export const RUNNING = 2;
export const FROZEN = 3;
export type Phase = typeof PRESTART | typeof COUNTDOWN | typeof RUNNING | typeof FROZEN;

export const NONE = 0xffffffff;

export interface Planet {
  id: string; // player ID: 32 lowercase hex digits
  name: string;
  joinTick: number;
  readyUntil: number; // 0: not ready
  lastInputTick: number;
  points: number;
  angle: number; // binary angle (D-2)
  rate: number; // binary-angle units per tick
  x: number;
  y: number;
  vx: number;
  vy: number;
  engaged: number; // 1 while touching its quarry in one contact episode (C-16)
}

export interface RoundState {
  phase: Phase;
  tick: number;
  ante: number;
  minPlayers: number;
  maxPlayers: number;
  countdownStart: number; // NONE before the countdown
  freezeTick: number; // NONE until the round ends
  ringPhase: number; // binary angle of slot 0
  planets: Planet[]; // in planet-number order: planet i + 1 is planets[i]
}

export interface RoundSettings {
  ante: number;
  minPlayers: number;
  maxPlayers: number;
}

/** Tick 0 of a new round: settings, no planets (PLAN §8.2). */
export function genesis(settings: RoundSettings): RoundState {
  return {
    phase: PRESTART,
    tick: 0,
    ante: settings.ante,
    minPlayers: settings.minPlayers,
    maxPlayers: settings.maxPlayers,
    countdownStart: NONE,
    freezeTick: NONE,
    ringPhase: 0,
    planets: [],
  };
}

export function clonePlanet(p: Planet): Planet {
  return { ...p };
}

export function cloneState(s: RoundState): RoundState {
  return { ...s, planets: s.planets.map(clonePlanet) };
}

/** Planet i's quarry (planet i + 1, wrapping), by index. */
export function quarryOf(i: number, n: number): number {
  return i + 1 === n ? 0 : i + 1;
}

/** Planet i's hunter (planet i − 1, wrapping), by index. */
export function hunterOf(i: number, n: number): number {
  return i === 0 ? n - 1 : i - 1;
}
