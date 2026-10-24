// M0 run 1: the same scripted simulation, offline, in every engine.

import { botInput } from './bots.ts';
import { DEFAULT_SIM, genesis, hashState, Sim, type SimConfig } from './sim.ts';

export interface GoldenRun {
  n: number;
  ticks: number;
  contacts: number;
  hashes: string[]; // one per `every` ticks
}

export function runGolden(n: number, ticks: number, every: number): GoldenRun {
  const cfg: SimConfig = { ...DEFAULT_SIM, n };
  const sim = new Sim(cfg);
  const s = genesis(cfg);
  const inputs = new Uint8Array(n);
  const hashes: string[] = [];
  for (let t = 1; t <= ticks; t++) {
    for (let p = 0; p < n; p++) inputs[p] = botInput(p + 1, t);
    sim.step(s, inputs);
    if (t % every === 0) hashes.push(hashState(s));
  }
  return { n, ticks, contacts: s.contacts, hashes };
}

/** The runs every engine must reproduce bit for bit. */
export function goldenSuite(): GoldenRun[] {
  return [runGolden(3, 100_000, 1000), runGolden(8, 100_000, 1000), runGolden(12, 20_000, 1000)];
}
