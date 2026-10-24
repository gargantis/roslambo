import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { hashState } from './codec';
import { dir } from './angle';
import { makeParams } from './params';
import { JOIN, LEAVE, READY, step, THRUST, UNREADY, type PlayerInput } from './rules';
import { GOLDEN_SCRIPTS, scriptInputs } from './scripts';
import { cloneState, COUNTDOWN, FROZEN, genesis, NONE, PRESTART, quarryOf, RUNNING, type RoundState } from './state';
import { NO_GRAVITY, paramsWith, running, testId } from './testing';

const P = makeParams();
const id = testId;
const present = (ks: number[], events = 0, extra: Partial<PlayerInput> = {}): PlayerInput[] =>
  ks.map((k) => ({ id: id(k), buttons: 0, events, ...extra }));

function lobby(max = 8): RoundState {
  return genesis({ ante: 5, minPlayers: 3, maxPlayers: max });
}

describe('joining and the ring', () => {
  it('numbers planets in join order and keeps it when one leaves', () => {
    const s = lobby();
    step(s, present([2]), P); // not a join: nothing happens
    expect(s.planets).toHaveLength(0);
    step(s, present([2], JOIN), P);
    step(s, present([0, 2], JOIN), P); // 2 is already in
    step(s, [...present([0, 2]), ...present([1], JOIN)], P);
    expect(s.planets.map((p) => p.id)).toEqual([id(2), id(0), id(1)]);
    step(s, [...present([2, 1]), ...present([0], LEAVE)], P);
    expect(s.planets.map((p) => p.id)).toEqual([id(2), id(1)]);
    step(s, [...present([2, 1]), ...present([0], JOIN)], P); // back, at the end
    expect(s.planets.map((p) => p.id)).toEqual([id(2), id(1), id(0)]);
  });

  it('puts every planet on the ring, facing its quarry, turning at the ring rate', () => {
    const d = new Float64Array(2);
    for (let n = 2; n <= 8; n++) {
      const s = lobby();
      step(s, present([...Array(n).keys()], JOIN), P);
      s.planets.forEach((p, i) => {
        expect(Math.hypot(p.x - P.cx, p.y - P.cy)).toBeCloseTo(P.ringRadius, 2);
        const q = s.planets[quarryOf(i, n)]!;
        dir(p.angle, d);
        const to = Math.atan2(q.y - p.y, q.x - p.x);
        expect(Math.abs(Math.atan2(d[1]!, d[0]!) - to) % (2 * Math.PI)).toBeLessThan(0.02);
        expect(p.rate).toBe(P.ringRate(n));
      });
    }
  });

  it('gives a lone planet no rotation, and resets rotations on each join or leave', () => {
    const s = lobby();
    step(s, present([0], JOIN), P);
    expect(s.planets[0]!.rate).toBe(0);
    step(s, present([0]), P);
    s.planets[0]!.rate = 999; // as if its player had turned it
    step(s, [...present([0]), ...present([1], JOIN)], P);
    expect(s.planets.map((p) => p.rate)).toEqual([P.ringRate(2), P.ringRate(2)]);
  });

  it('refuses joins beyond the maximum and after the countdown starts', () => {
    const s = lobby(3);
    step(s, present([0, 1, 2, 3], JOIN), P);
    expect(s.planets).toHaveLength(3);
    expect(s.planets.some((p) => p.id === id(3))).toBe(false);
    const t = lobby(4);
    step(t, present([0, 1, 2], JOIN | READY), P);
    expect(t.phase).toBe(COUNTDOWN);
    step(t, [...present([0, 1, 2]), ...present([3], JOIN)], P);
    expect(t.planets).toHaveLength(3);
  });

  it('removes a silent player before the countdown, but not after (Q-5, Q-15)', () => {
    const s = lobby();
    step(s, present([0, 1, 2], JOIN), P);
    for (let t = 0; t < P.settings.absenceTicks - 1; t++) step(s, present([0, 1]), P);
    expect(s.planets).toHaveLength(3);
    step(s, present([0, 1]), P);
    expect(s.planets.map((p) => p.id)).toEqual([id(0), id(1)]);

    const c = lobby();
    step(c, present([0, 1, 2], JOIN | READY), P);
    expect(c.phase).toBe(COUNTDOWN);
    step(c, [...present([0, 1]), ...present([2], LEAVE)], P); // a Leave in the countdown keeps the planet
    for (let t = 0; t < 400; t++) step(c, present([0, 1]), P);
    expect(c.planets).toHaveLength(3);
  });

  it('cleans names that are too long or hold control characters', () => {
    const s = lobby();
    step(s, [
      { id: id(0), buttons: 0, events: JOIN, name: 'Ana' },
      { id: id(1), buttons: 0, events: JOIN, name: 'x'.repeat(21) },
      { id: id(2), buttons: 0, events: JOIN, name: 'bad\u0007name' },
      { id: id(3), buttons: 0, events: JOIN, name: '🪐'.repeat(9) }, // 9 characters but 36 bytes
    ], P);
    expect(s.planets.map((p) => p.name)).toEqual(['Ana', '', '', '']);
  });
});

describe('Ready and the countdown', () => {
  it('starts the countdown when every joined player is ready and the minimum is met', () => {
    const s = lobby();
    step(s, present([0, 1], JOIN | READY), P);
    expect(s.phase).toBe(PRESTART); // ready, but below the minimum
    step(s, [...present([0, 1]), ...present([2], JOIN)], P);
    expect(s.phase).toBe(PRESTART); // the newcomer isn't ready
    step(s, present([0, 1, 2], READY), P);
    expect(s.phase).toBe(COUNTDOWN);
    expect(s.countdownStart).toBe(s.tick);
  });

  it('lets a Ready expire, and be cancelled (Q-21)', () => {
    const s = lobby();
    step(s, present([0], JOIN | READY), P);
    expect(s.planets[0]!.readyUntil).toBe(1 + P.readyExpiryTicks);
    step(s, present([0], UNREADY), P);
    expect(s.planets[0]!.readyUntil).toBe(0);
    step(s, present([0], READY), P);
    for (let t = 0; t < P.readyExpiryTicks; t++) step(s, present([0]), P);
    expect(s.planets[0]!.readyUntil).toBe(0);
  });

  it('starts the round 10 seconds later, with the ante as everyone’s points', () => {
    const s = lobby();
    step(s, present([0, 1, 2], JOIN | READY), P);
    const start = s.tick;
    while (s.phase === COUNTDOWN) step(s, present([0, 1, 2], 0, { buttons: THRUST }), P);
    expect(s.tick - start).toBe(600);
    expect(s.phase).toBe(RUNNING);
    expect(s.planets.map((p) => p.points)).toEqual([5, 5, 5]);
  });
});

describe('scoring (C-16, Q-13)', () => {
  const Pc = paramsWith(NO_GRAVITY);
  const r = Pc.r;

  it('moves a point from quarry to hunter on contact, around the cycle', () => {
    // 0 hits its quarry 1.
    const a = running([{ x: 0.3, y: 0.5, vx: 1 }, { x: 0.3 + 2 * r + 0.004, y: 0.5 }, { x: 0.5, y: 0.9 }]);
    for (let t = 0; t < 10; t++) step(a, [], Pc);
    expect(a.planets.map((p) => p.points)).toEqual([6, 4, 5]);
    // 2 hits 0: planet N's quarry is planet 1.
    const b = running([{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.9 }, { x: 0.5 - 2 * r - 0.004, y: 0.5, vx: 1 }]);
    for (let t = 0; t < 10; t++) step(b, [], Pc);
    expect(b.planets.map((p) => p.points)).toEqual([4, 5, 6]);
  });

  it('moves no points between planets that are not neighbours (1 and 3 of 4)', () => {
    const s = running([{ x: 0.3, y: 0.5, vx: 1 }, { x: 0.5, y: 0.9 }, { x: 0.3 + 2 * r + 0.004, y: 0.5 }, { x: 0.9, y: 0.9 }]);
    for (let t = 0; t < 10; t++) step(s, [], Pc);
    expect(s.planets[0]!.vx).toBeLessThan(0.01); // they did bounce
    expect(s.planets.map((p) => p.points)).toEqual([5, 5, 5, 5]);
  });

  it('scores once per contact episode, however long the touch lasts', () => {
    // The hunter thrusts into its quarry: they chatter, contact after
    // contact, but stay within the gap, so it's one episode.
    const s = running([{ x: 0.3, y: 0.5 }, { x: 0.3 + 2 * r, y: 0.5 }, { x: 0.5, y: 0.9 }]);
    for (let t = 0; t < 40; t++) step(s, present([0], 0, { buttons: THRUST }), Pc);
    expect(s.planets[1]!.vx).toBeCloseTo((P.settings.thrust * 40) / 60 / 2, 1); // the pair shares the push
    expect(s.planets.map((p) => p.points)).toEqual([6, 4, 5]);
    expect(s.planets[0]!.engaged).toBe(1);
    // Separated past the gap, then back: a second episode.
    s.planets[1]!.x = 0.9;
    step(s, [], Pc);
    expect(s.planets[0]!.engaged).toBe(0);
    s.planets[1]!.x = s.planets[0]!.x + 2 * r + 0.001;
    s.planets[1]!.y = s.planets[0]!.y;
    s.planets[1]!.vx = -1;
    step(s, [], Pc);
    expect(s.planets.map((p) => p.points)).toEqual([7, 3, 5]);
  });

  it('applies all of a tick’s changes together: losing and gaining in one tick nets zero (Q-13)', () => {
    // 1 has a single point. In one tick 1 hits its quarry 2, then 0 hits 1.
    const x0 = 0.3;
    const s = running([
      { x: x0, y: 0.5, vx: 1 },
      { x: x0 + 2 * r + 0.001, y: 0.5, vx: 1, points: 1 },
      { x: x0 + 4 * r + 0.002, y: 0.5, points: 9 },
    ]);
    step(s, [], Pc);
    expect(s.planets.map((p) => p.points)).toEqual([6, 1, 8]);
    expect(s.phase).toBe(RUNNING);
  });

  it('freezes the round the tick a player reaches 0, and then nothing moves', () => {
    const s = running([{ x: 0.3, y: 0.5, vx: 1 }, { x: 0.3 + 2 * r + 0.004, y: 0.5, points: 1 }, { x: 0.5, y: 0.9, vx: 0.5 }]);
    while (s.phase === RUNNING) step(s, [], Pc);
    expect(s.phase).toBe(FROZEN);
    expect(s.freezeTick).toBe(s.tick);
    expect(s.planets.map((p) => p.points)).toEqual([6, 0, 5]);
    const frozen = cloneState(s);
    step(s, present([0, 1, 2], 0, { buttons: THRUST }), Pc);
    expect({ ...s, tick: frozen.tick }).toEqual(frozen);
  });

  it('keeps points zero-sum through every scripted round', () => {
    for (const spec of GOLDEN_SCRIPTS) {
      const s = genesis(spec.round);
      for (let t = 1; t <= spec.ticks; t++) {
        step(s, scriptInputs(spec, t), P);
        if (s.phase === RUNNING || s.phase === FROZEN) {
          expect(s.planets.reduce((a, p) => a + p.points, 0)).toBe(s.planets.length * spec.round.ante);
        }
      }
      if (s.freezeTick !== NONE) expect(s.planets.some((p) => p.points === 0)).toBe(true);
    }
  });
});

describe('order independence (P4)', () => {
  it('gives the same state whatever order a tick’s inputs arrive in', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: GOLDEN_SCRIPTS.length - 1 }), fc.integer({ min: 1, max: 1500 }), fc.integer(), (g, upTo, seed) => {
        const spec = GOLDEN_SCRIPTS[g]!;
        const a = genesis(spec.round);
        const b = genesis(spec.round);
        let x = seed >>> 0;
        for (let t = 1; t <= upTo; t++) {
          const ins = scriptInputs(spec, t);
          step(a, ins, P);
          const shuffled = [...ins];
          for (let i = shuffled.length - 1; i > 0; i--) {
            x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
            const j = x % (i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
          }
          step(b, shuffled, P);
        }
        return hashState(a) === hashState(b);
      }),
      { numRuns: 25 },
    );
  });

  it('ignores duplicate and malformed player IDs', () => {
    const s = lobby();
    step(s, [{ id: 'not-an-id', buttons: 0, events: JOIN }, { id: 'ABCDEF'.repeat(5) + 'AB', buttons: 0, events: JOIN }, ...present([1, 1], JOIN)], P);
    expect(s.planets.map((p) => p.id)).toEqual([id(1)]);
  });
});
