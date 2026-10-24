import { describe, expect, it } from 'vitest';
import { decodeState, encodeState, hashState } from './codec';
import { makeParams } from './params';
import { step } from './rules';
import { GOLDEN_SCRIPTS, scriptInputs } from './scripts';
import { genesis, type RoundState } from './state';

function statesOf(name: string, every: number): RoundState[] {
  const spec = GOLDEN_SCRIPTS.find((g) => g.name === name)!;
  const P = makeParams();
  const s = genesis(spec.round);
  const out: RoundState[] = [];
  for (let t = 1; t <= spec.ticks; t++) {
    step(s, scriptInputs(spec, t), P);
    if (t % every === 0) out.push(structuredClone(s));
  }
  return out;
}

describe('canonical state codec (A.1)', () => {
  it('round-trips every phase byte for byte', () => {
    for (const s of [...statesOf('eight', 250), ...statesOf('three, leave and rejoin', 250)]) {
      const bytes = encodeState(s);
      const back = decodeState(bytes);
      expect(back).toEqual(s);
      expect(encodeState(back!)).toEqual(bytes);
    }
  });

  it('gives different hashes to different states', () => {
    const hashes = statesOf('five', 100).map(hashState);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('rejects truncation, trailing bytes, another version and bad fields', () => {
    const s = statesOf('three', 1000)[0]!;
    const bytes = encodeState(s);
    expect(decodeState(bytes.subarray(0, bytes.length - 1))).toBeNull();
    expect(decodeState(new Uint8Array([...bytes, 0]))).toBeNull();
    const v2 = bytes.slice();
    v2[0] = 2;
    expect(decodeState(v2)).toBeNull();
    const badPhase = bytes.slice();
    badPhase[2] = 9;
    expect(decodeState(badPhase)).toBeNull();
    for (let i = 0; i < bytes.length; i += 7) expect(() => decodeState(bytes.subarray(0, i))).not.toThrow();
  });

  it('refuses to encode NaN', () => {
    const s = statesOf('three', 1000)[0]!;
    s.planets[0]!.vx = NaN;
    expect(() => encodeState(s)).toThrow();
  });
});
