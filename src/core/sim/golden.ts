// Replays scripted rounds and hashes them at checkpoints: the goldens of
// PLAN §14, checked in Node and in every engine, and the canary (D-17).

import { hashState } from './codec';
import { DEFAULT_SETTINGS, makeParams, type SimParams } from './params';
import { step } from './rules';
import { CANARY_SCRIPT, GOLDEN_SCRIPTS, scriptInputs, type ScriptSpec } from './scripts';
import { genesis } from './state';

export const CHECKPOINT_EVERY = 500;

export interface GoldenResult {
  name: string;
  checkpoints: string[]; // the hash every CHECKPOINT_EVERY ticks
  final: string;
  phase: number;
  freezeTick: number;
  planets: number;
}

export function replay(spec: ScriptSpec, P: SimParams = makeParams()): GoldenResult {
  const s = genesis(spec.round);
  const checkpoints: string[] = [];
  for (let t = 1; t <= spec.ticks; t++) {
    step(s, scriptInputs(spec, t), P);
    if (t % CHECKPOINT_EVERY === 0) checkpoints.push(hashState(s));
  }
  return { name: spec.name, checkpoints, final: hashState(s), phase: s.phase, freezeTick: s.freezeTick, planets: s.planets.length };
}

export function goldenSuite(P: SimParams = makeParams()): GoldenResult[] {
  return GOLDEN_SCRIPTS.map((spec) => replay(spec, P));
}

/** The canary's settings: the defaults with a 1-second countdown. */
export function canaryParams(): SimParams {
  return makeParams({ ...DEFAULT_SETTINGS, countdownSeconds: 1 });
}

export function canaryHash(P: SimParams = canaryParams()): string {
  return replay(CANARY_SCRIPT, P).final;
}
