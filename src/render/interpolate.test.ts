import { describe, expect, it } from 'vitest';
import { genesis, type Planet, type RoundState } from '../core/sim/state';
import { interpolate, lerpAngle } from './interpolate';

const TURN = 4294967296;

function planet(id: string, x: number, y: number, angle: number): Planet {
  return { id, name: '', joinTick: 0, readyUntil: 0, lastInputTick: 0, points: 1, angle, rate: 0, x, y, vx: 0, vy: 0, engaged: 0 };
}

function state(planets: Planet[]): RoundState {
  return { ...genesis({ ante: 1, minPlayers: 3, maxPlayers: 8 }), planets };
}

describe('interpolation (PLAN §12)', () => {
  it('moves angles the shorter way round, across zero in both directions', () => {
    expect(lerpAngle(TURN - 100, 100, 0.5)).toBe(0);
    expect(lerpAngle(100, TURN - 100, 0.5)).toBe(0);
    expect(lerpAngle(TURN - 100, 100, 0.25)).toBe(TURN - 50);
    expect(lerpAngle(0, TURN / 4, 0.5)).toBe(TURN / 8);
  });

  it('blends positions, and matches planets by ID when the numbering changed', () => {
    const prev = state([planet('a', 0, 0, 0), planet('b', 1, 1, 0)]);
    const next = state([planet('b', 0.5, 0.5, 0), planet('c', 0.2, 0.2, 0)]);
    const f = interpolate(prev, next, 0.5);
    expect(f.map((p) => p.id)).toEqual(['b', 'c']);
    expect([f[0]!.x, f[0]!.y]).toEqual([0.75, 0.75]);
    expect([f[1]!.x, f[1]!.y]).toEqual([0.2, 0.2]); // new: drawn where it is
  });

  it('draws the newest state at f = 1 and the previous at f = 0', () => {
    const prev = state([planet('a', 0.1, 0.2, 0)]);
    const next = state([planet('a', 0.3, 0.4, TURN / 2)]);
    expect(interpolate(prev, next, 1)[0]).toMatchObject({ x: 0.3, y: 0.4, theta: Math.PI });
    expect(interpolate(prev, next, 0)[0]).toMatchObject({ x: 0.1, y: 0.2, theta: 0 });
  });

  it('reuses the output array', () => {
    const out = interpolate(state([planet('a', 0, 0, 0)]), state([planet('a', 0, 0, 0)]), 0.5);
    const again = interpolate(state([]), state([]), 0.5, out);
    expect(again).toBe(out);
    expect(again).toHaveLength(0);
  });
});
