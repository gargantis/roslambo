// Every setting in one place (REQUIREMENTS "Configuration": every setting
// should be easy to change). The build hash of D-16 will cover all of it.
//
// Lengths are in arena sides, times in seconds. Values marked TBD in the
// requirements are PLAN A.5 starting values until M2's tuning page settles
// them (Q-12).

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
  readyExpirySeconds: 60, // TBD, about a minute
  displayNameMaxChars: 20, // Q-22

  // Arena and planets
  arenaSide: 1,
  planetRadius: 0.03, // TBD
  ringMargin: 0.03, // TBD
  ringClearance: 0.03, // TBD
  ringPeriod3Seconds: 8, // TBD: the 3-planet ring period, which sets Gm (Q-12)
  thrust: 0.6, // TBD, arena sides per second²
  wallEnergyLoss: 0.2, // TBD, fraction of kinetic energy per wall bounce (Q-14)
  correctionFactor: 1, // TBD
  maxRotationTurnsPerSecond: 1,
  rotationAccelTurnsPerSecond2: 2,

  // Missed results (Q-10)
  resultRetentionDays: 30,
  witnessedRoundsKept: 20,
  unsettledRoundsWatched: 10,
} as const;

/** Binary-angle units per turn (D-2). */
export const TURN = 4294967296;

/** S_N = ¼ Σ_{k=1}^{N-1} 1/sin(πk/N) (REQUIREMENTS, Appendix). Config-time
 *  only: the simulation computes it with its own exact-ops sine (D-2). */
export function ringSum(n: number): number {
  let s = 0;
  for (let k = 1; k < n; k++) s += 1 / Math.sin((Math.PI * k) / n);
  return s / 4;
}

/** R = L/2 − r − margin; the inscribed radius of the square (D-6). */
export const ringRadius = config.arenaSide / 2 - config.planetRadius - config.ringMargin;

/** Gm from the 3-planet ring period: v₃ = 2πR/T₃, Gm = v₃²·R / S₃. */
export const gm = (() => {
  const v3 = (2 * Math.PI * ringRadius) / config.ringPeriod3Seconds;
  return (v3 * v3 * ringRadius) / ringSum(3);
})();

/** The most planets the ring holds with the clearance between neighbours. */
export const ringCapacity = Math.floor(
  Math.PI / Math.asin((2 * config.planetRadius + config.ringClearance) / (2 * ringRadius)),
);

/** The largest maximum a proposer may set: the ring limit and the mesh cap (Q-3). */
export const playersCap = Math.min(ringCapacity, config.maxPlayersCap);

/** The ring's rotation rate with n planets, in turns per second. */
export function ringTurnsPerSecond(n: number): number {
  if (n < 2) return 0;
  const v = Math.sqrt((gm * ringSum(n)) / ringRadius);
  return v / ringRadius / (2 * Math.PI);
}

/** Rotation in binary-angle units per tick (D-2). */
export const maxRateUnits = Math.round((TURN * config.maxRotationTurnsPerSecond) / config.tickRate);
export const rateAccelUnits = Math.round((TURN * config.rotationAccelTurnsPerSecond2) / (config.tickRate * config.tickRate));

export const countdownTicks = config.countdownSeconds * config.tickRate;
export const readyExpiryTicks = config.readyExpirySeconds * config.tickRate;
