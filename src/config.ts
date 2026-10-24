// Every setting in one place (REQUIREMENTS "Configuration": every setting
// should be easy to change). The build hash of D-16 will cover all of it.
//
// Lengths are in arena sides, times in seconds. The values the requirements
// left TBD were chosen at M2 from the measurements in research/tuning/
// (Q-12); each says what it was.

export const config = {
  // Timeline (PLAN A.4; M0 confirmed or amended these)
  tickRate: 60,
  substeps: 4,
  inputDelayTicks: 2,
  lateWindowTicks: 12,
  voteWindowTicks: 12,
  stateHistoryTicks: 256,
  inputHistoryTicks: 16,
  absenceTicks: 180, // Q-15: no input for 3 s before the countdown = disconnected
  joinWarmupMs: 500,
  clockSettleMs: 2000,

  // Rounds
  minPlayers: 3,
  maxPlayersCap: 8, // Q-3: the mesh cap
  maxSpectators: 4, // Q-3
  countdownSeconds: 10,
  readyExpirySeconds: 60, // was TBD, "about a minute"
  displayNameMaxChars: 20, // Q-22

  // Arena and planets
  arenaSide: 1,
  planetRadius: 0.03, // was TBD
  ringMargin: 0.03, // was TBD
  ringClearance: 0.03, // was TBD: a ring capacity of 30
  ringPeriod3Seconds: 10, // was TBD: the 3-planet ring period, which sets Gm (Q-12)
  softening: 0.25, // gravity softening ε (C-16): a touching quarry can thrust free
  thrust: 1.4, // was TBD, arena sides per second²: 1.67 × twice the peak pull
  wallEnergyLoss: 0.2, // was TBD, fraction of kinetic energy per wall bounce (Q-14)
  correctionFactor: 1, // was TBD
  separationGap: 0.015, // C-16: a pair scores again only after separating this far
  maxRotationTurnsPerSecond: 1,
  rotationAccelTurnsPerSecond2: 2,

  // Missed results (Q-10)
  resultRetentionDays: 30,
  witnessedRoundsKept: 20,
  unsettledRoundsWatched: 10,
} as const;

/** Binary-angle units per turn (D-2). */
export const TURN = 4294967296;

/** S_N = ¼ Σ_{k=1}^{N-1} 1/sin(πk/N) (REQUIREMENTS, Appendix): the
 *  Newtonian ring sum, for checks only. The simulation derives Gm and the
 *  ring's speed itself, with softening and exact operations
 *  (src/core/sim/params.ts). */
export function ringSum(n: number): number {
  let s = 0;
  for (let k = 1; k < n; k++) s += 1 / Math.sin((Math.PI * k) / n);
  return s / 4;
}

/** R = L/2 − r − margin; the inscribed radius of the square (D-6). */
export const ringRadius = config.arenaSide / 2 - config.planetRadius - config.ringMargin;

/** The most planets the ring holds with the clearance between neighbours. */
export const ringCapacity = Math.floor(
  Math.PI / Math.asin((2 * config.planetRadius + config.ringClearance) / (2 * ringRadius)),
);

/** The largest maximum a proposer may set: the ring limit and the mesh cap (Q-3). */
export const playersCap = Math.min(ringCapacity, config.maxPlayersCap);

/** Rotation in binary-angle units per tick (D-2). */
export const maxRateUnits = Math.round((TURN * config.maxRotationTurnsPerSecond) / config.tickRate);
export const rateAccelUnits = Math.round((TURN * config.rotationAccelTurnsPerSecond2) / (config.tickRate * config.tickRate));

export const countdownTicks = config.countdownSeconds * config.tickRate;
export const readyExpiryTicks = config.readyExpirySeconds * config.tickRate;
