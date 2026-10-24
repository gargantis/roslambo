// One tick of the round (PLAN §7.2): events, presence, Ready, the
// countdown, rotation, physics, scoring and the freeze. A pure function of
// the state and that tick's final inputs (D-7, D-8).

import { dir, fractionOfTurn, QUARTER_TURN } from './angle';
import { nameBytes } from './codec';
import type { SimParams } from './params';
import { physicsTick } from './physics';
import { COUNTDOWN, FROZEN, NONE, PRESTART, quarryOf, RUNNING, type Planet, type RoundState } from './state';

export const THRUST = 1;
export const LEFT = 2;
export const RIGHT = 4;

export const JOIN = 1;
export const LEAVE = 2;
export const READY = 4;
export const UNREADY = 8;

/** One player's final input for a tick. Absent players have none. */
export interface PlayerInput {
  id: string; // 32 lowercase hex digits
  buttons: number; // THRUST | LEFT | RIGHT
  events: number; // JOIN | LEAVE | READY | UNREADY
  name?: string; // with JOIN
}

const ID_RE = /^[0-9a-f]{32}$/;
const NAME_MAX_CHARS = 20;
const NAME_MAX_BYTES = 32;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

function cleanName(name: string | undefined): string {
  if (name === undefined || CONTROL_RE.test(name)) return '';
  if ([...name].length > NAME_MAX_CHARS || nameBytes(name) > NAME_MAX_BYTES) return '';
  return name;
}

/** Valid inputs, one per player, sorted by ID: the order never depends on
 *  how messages arrived (P4). */
function canonical(inputs: readonly PlayerInput[]): PlayerInput[] {
  const seen = new Set<string>();
  const out: PlayerInput[] = [];
  for (const inp of inputs) {
    if (!ID_RE.test(inp.id) || seen.has(inp.id)) continue;
    seen.add(inp.id);
    out.push(inp);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Every planet to its slot on the ideal ring, at the ring's slot velocity,
 *  facing its quarry and turning at the ring's rate (D-5). */
export function reformRing(s: RoundState, P: SimParams): void {
  const n = s.planets.length;
  const w = P.ringOmega(n);
  const R = P.ringRadius;
  const d = new Float64Array(2);
  s.planets.forEach((p, i) => {
    const a = (s.ringPhase + fractionOfTurn(i, n)) >>> 0;
    dir(a, d);
    p.x = P.cx + R * d[0]!;
    p.y = P.cy + R * d[1]!;
    p.vx = -w * R * d[1]!;
    p.vy = w * R * d[0]!;
    // The chord to the next slot points a quarter turn plus half a slot ahead.
    p.angle = (a + QUARTER_TURN + (n > 1 ? fractionOfTurn(1, 2 * n) : 0)) >>> 0;
    p.rate = P.ringRate(n);
    p.engaged = 0;
  });
}

const forces = {
  tx: new Float64Array(0),
  ty: new Float64Array(0),
  gain: new Int32Array(0),
};

/** Advances s to the next tick with that tick's final inputs. */
export function step(s: RoundState, inputs: readonly PlayerInput[], P: SimParams): void {
  s.tick += 1;
  if (s.phase === FROZEN) return;
  const t = s.tick;
  const ins = canonical(inputs);
  const byId = new Map(ins.map((x) => [x.id, x]));
  const indexOf = (id: string): number => s.planets.findIndex((p) => p.id === id);

  // 1. Events. Only before the countdown do they change the roster: the
  //    roster locks when it starts (Q-5).
  let reform = false;
  if (s.phase === PRESTART) {
    for (const x of ins) {
      if ((x.events & LEAVE) === 0) continue;
      const i = indexOf(x.id);
      if (i >= 0) {
        s.planets.splice(i, 1);
        reform = true;
      }
    }
    for (const x of ins) {
      if ((x.events & JOIN) === 0 || indexOf(x.id) >= 0 || s.planets.length >= s.maxPlayers) continue;
      s.planets.push({
        id: x.id, name: cleanName(x.name), joinTick: t, readyUntil: 0, lastInputTick: t, points: 0,
        angle: 0, rate: 0, x: 0, y: 0, vx: 0, vy: 0, engaged: 0,
      });
      reform = true;
    }
  }

  // 2. Presence. Before the countdown, a player silent for absenceTicks is
  //    removed (Q-15); later, a silent planet just drifts.
  for (const p of s.planets) if (byId.has(p.id)) p.lastInputTick = t;
  if (s.phase === PRESTART) {
    const before = s.planets.length;
    s.planets = s.planets.filter((p) => t - p.lastInputTick < P.settings.absenceTicks);
    if (s.planets.length !== before) reform = true;
  }
  if (reform) reformRing(s, P);

  // 3–5. Ready, and the countdown.
  if (s.phase === PRESTART) {
    for (const p of s.planets) {
      const x = byId.get(p.id);
      if (x && (x.events & READY) !== 0) p.readyUntil = t + P.readyExpiryTicks;
      if (x && (x.events & UNREADY) !== 0) p.readyUntil = 0; // Q-21
      if (p.readyUntil !== 0 && t >= p.readyUntil) p.readyUntil = 0;
    }
    if (s.planets.length >= s.minPlayers && s.planets.every((p) => p.readyUntil > t)) {
      s.phase = COUNTDOWN;
      s.countdownStart = t;
    }
  } else if (s.phase === COUNTDOWN && t >= s.countdownStart + P.countdownTicks) {
    s.phase = RUNNING;
    for (const p of s.planets) {
      p.points = s.ante;
      p.engaged = 0;
    }
  }

  // 6. Rotation, and thrust aimed for this tick.
  const n = s.planets.length;
  if (forces.tx.length < n) {
    forces.tx = new Float64Array(n);
    forces.ty = new Float64Array(n);
    forces.gain = new Int32Array(n);
  }
  const d = new Float64Array(2);
  for (let i = 0; i < n; i++) {
    const p = s.planets[i]!;
    const b = byId.get(p.id)?.buttons ?? 0;
    const left = (b & LEFT) !== 0;
    const right = (b & RIGHT) !== 0;
    if (left && !right) p.rate = Math.min(p.rate + P.rateAcc, P.maxRate);
    else if (right && !left) p.rate = Math.max(p.rate - P.rateAcc, -P.maxRate);
    p.angle = (p.angle + p.rate) >>> 0;
    if (s.phase === RUNNING && (b & THRUST) !== 0) {
      dir(p.angle, d);
      forces.tx[i] = d[0]! * P.settings.thrust;
      forces.ty[i] = d[1]! * P.settings.thrust;
    } else {
      forces.tx[i] = 0;
      forces.ty[i] = 0;
    }
    forces.gain[i] = 0;
  }

  // 7. Physics, with the correction until the countdown reaches 0.
  const ringRate = s.phase === RUNNING ? 0 : P.ringRate(n);
  const scoring = s.phase === RUNNING && n >= 3;
  physicsTick(s.planets, P, { tx: forces.tx, ty: forces.ty, correction: s.phase !== RUNNING, ringPhase: s.ringPhase, ringRate }, (i, j) => {
    if (!scoring) return;
    // A pair scores once per contact episode (C-16): the hunter's flag stays
    // set until the pair separates past the release distance.
    const h = quarryOf(i, n) === j ? i : quarryOf(j, n) === i ? j : -1;
    if (h < 0 || s.planets[h]!.engaged === 1) return;
    s.planets[h]!.engaged = 1;
    forces.gain[h] = forces.gain[h]! + 1;
  });
  if (s.phase !== RUNNING) s.ringPhase = (s.ringPhase + ringRate) >>> 0;

  // 8. Scoring: all of this tick's changes together (Q-13), then re-arm
  //    pairs that have separated, then the freeze.
  if (scoring) {
    for (let h = 0; h < n; h++) {
      const g = forces.gain[h]!;
      if (g === 0) continue;
      s.planets[h]!.points += g;
      s.planets[quarryOf(h, n)]!.points -= g;
    }
    for (let h = 0; h < n; h++) {
      const p = s.planets[h]!;
      if (p.engaged === 0) continue;
      const q = s.planets[quarryOf(h, n)]!;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      if (dx * dx + dy * dy > P.releaseD2) p.engaged = 0;
    }
    if (s.planets.some((p) => p.points <= 0)) {
      s.phase = FROZEN;
      s.freezeTick = t;
    }
  }
}

/** Planets at 0 points when the round froze. */
export function losers(s: RoundState): Planet[] {
  return s.freezeTick === NONE ? [] : s.planets.filter((p) => p.points <= 0);
}
