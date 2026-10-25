# M2 tuning: report

**Date:** 2026-10-24.
**Answers:** PLAN.md Q-12 (the physics values the requirements left **TBD**) and C-16 (what happens when a hunter catches its quarry). The owner left the choice to Claude's judgement for the MVP.
**Revised the same day** at the owner's request: keep Newtonian gravity, weaken it, and start the planets near the centre. §4 covers that, and its values replace §3's.
**Method:** `dev/tune.metrics.ts` measures each candidate. The raw passes are `pass-1.json` to `pass-10.json`. `dev/tuning.html` runs the same simulation live, with a slider per setting.

## 1. What was measured

| Metric | How |
|---|---|
| Ring held | Largest deviation from the ring radius while the correction holds a 3- or 8-planet ring for 2 minutes |
| Ring break-up | Seconds after release, with nobody pressing anything, until a ring is 10% out of round |
| Escape | Two planets at rest, touching; one thrusts straight away while the other coasts. Seconds until they're 0.3 apart. |
| Escape margin | Thrust ÷ (2 × the strongest pull at any distance). Both planets feel the pull, so escape needs a margin above 1. |
| Rounds | 12 rounds each with 3, 5 and 8 steering bots (`dev/steer.ts`: chase the quarry, veer from a close hunter), ante 5: median length, points moved per minute, top speed |

Steering bots aren't people, so round lengths are only a guide. Human rounds will probably run longer.

## 2. Findings

### 2.1 Newtonian gravity glues touching planets together

At the PLAN A.5 starting values (planet radius 0.03, ring period 8 s, pure 1/d² gravity), the pull between touching planets is about 25 arena sides per second². That's 40 times the planned thrust, and about 90 times the acceleration that holds the 3-planet ring. A pair that touches slowly can never part. With the M0 finding (planets at rest in contact score every substep), rounds froze within about 4–8 seconds of play.

### 2.2 Softening fixes it, but escape needs twice the peak pull

Softened gravity, a = Gm·d/(d² + ε²)^{3/2}, keeps 1/d² at range and weakens the pull up close. Its peak is about 0.77·Gm/ε² at d = ε/√2.

A touching quarry escapes only if thrust exceeds **twice** the peak pull, because its hunter is pulled along with it. The first passes missed that factor and showed no escapes at all, even with thrust above the peak.

| ε | 3-ring period | Thrust | Escape margin | Escape | 8-ring held to | 8-ring breaks after | Round length, 3 / 5 / 8 players | Points per min, 3 / 5 / 8 | Top speed |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 8 s | 0.6 | — | never | **21.6%** | 7 s | 8 / 5 / 4 s | 118 / 173 / 304 | 4.0 |
| 0.1 | 8 s | 0.6 | — | never | 19.2% | 9 s | 18 / 13 / 9 s | 68 / 113 / 189 | 2.8 |
| 0.2 | 8 s | 0.6 | — | never | 0.55% | 20 s | 32 / 33 / 13 s | 48 / 82 / 167 | 2.8 |
| 0.25 | 8 s | 1.5 | 1.15 | 2.5 s | 0.57% | 31 s | 35 / 19 / 14 s | 45 / 82 / 143 | 3.1 |
| 0.2 | 10 s | 1.5 | 1.21 | 1.9 s | 0.48% | 27 s | 28 / 14 / 12 s | 46 / 80 / 120 | 2.9 |
| 0.3 | 8 s | 1.2 | 1.24 | 1.0 s | 0.54% | 53 s | 40 / 26 / 11 s | 40 / 64 / 131 | 2.7 |
| 0.25 | 10 s | 1.2 | 1.43 | 0.9 s | 0.46% | 41 s | 47 / 21 / 17 s | 37 / 68 / 125 | 2.6 |
| **0.25** | **10 s** | **1.4** | **1.67** | **0.8 s** | **0.46%** | **41 s** | **46 / 20 / 13 s** | **40 / 75 / 128** | **2.7** |
| 0.3 | 10 s | 1.0 | 1.62 | 0.9 s | 0.43% | never in 60 s | 31 / 21 / 20 s | 37 / 68 / 109 | 2.6 |

The 8-ring results are with correction factor 2 in passes 2–4 and 1 in pass 1. Pass 4 confirmed that factor 1 holds as well (0.42%).

Three more things show up:
- **The correction:** below ε ≈ 0.2, correction factor 1 doesn't hold an 8-planet ring (19–22% out of round). With softening it holds at factor 1 or 2.
- **Too much softening** removes the ring's instability: at ε 0.3 with a 10 s period, the released 8-ring never broke up. The requirements describe the ring as unstable, so ε stays at 0.25.
- **Insensitive settings:** the re-arm gap (0.015 against 0.03) changed nothing measurable. Wall loss 0.3 against 0.2 only trimmed the top speed, from 2.6 to 2.5.

### 2.3 Scoring per contact episode (C-16)

A pair scores once per contact episode. The hunter's flag stays set until the surfaces are a full planet diameter apart: centres 4r apart. The owner set that on 2026-10-24, replacing the quarter diameter first chosen. Planets resting in contact, or pushed together by thrust, chatter without scoring again. A real bounce apart, then a new hit, scores again. Tests: `src/core/sim/rules.test.ts`, "scores once per contact episode".

### 2.4 The final settings, measured together (pass 5)

Passes 2–4 ran with correction factor 2. Pass 5 measured the settings as chosen, with correction factor 1, against the earlier gap:

| Re-arm gap | Round length, 3 / 5 / 8 players | Points per min, 3 / 5 / 8 | Top speed |
|---|---|---|---|
| **1 diameter** | **19 / 22 / 22 s** | **39 / 70 / 118** | **2.8** |
| 0.25 diameter (0.015) | 18 / 22 / 18 s | 41 / 70 / 118 | 2.8 |

The gap barely matters to steering bots: they rarely bounce apart by between a quarter and a full diameter.

Round lengths are medians of 12 bot rounds, so they're noisy. Against pass 4, the change from 46 / 20 / 13 s comes mostly from the correction factor and from sampling. Points per minute are the steadier measure.

## 3. First choice (superseded by §4)

| Setting | Value |
|---|---|
| Planet radius | 0.03 arena sides |
| Ring margin | 0.03 |
| Ring clearance | 0.03, giving a ring capacity of 30 |
| Gravity softening ε | 0.25 |
| 3-planet ring period | 10 s, so Gm ≈ 0.068 and the 8-planet ring turns at 0.20 turn/s |
| Thrust | 1.4 arena sides/s² (escape margin 1.67) |
| Wall energy loss | 0.2 |
| Correction factor | 1 |
| Re-arm gap | one planet diameter between the surfaces (the owner's change on 2026-10-24, replacing 0.015) |
| Ready expiry | 60 s |

**Checks that hold at these values** (the gate tests them):
- the correction keeps every ring from 1 to 8 planets within 1% for 10 minutes;
- the ring's rate stays under the 1 turn/s maximum rotation;
- planets can't tunnel up to 5 arena sides per second (the top speed seen was 2.7);
- points stay zero-sum.

**Still unknown:** how this feels to people. The tuning page is there to adjust it, and a change means re-emitting the goldens (`ROSLAMBO_EMIT_GOLDENS=1`), which is legitimate until the first release.

## 4. Revisited: Newtonian gravity

The owner pointed out that escaping only needs orbital speed, so any sustained thrust should do. They also pointed out that bouncing planets conserve energy. Both were right, and following them up found two flaws: one in the measurements, one in the physics.

### 4.1 The escape test measured only the hardest way out

§2.2 timed a quarry thrusting straight away from its hunter, which does need thrust above twice the pull. Escape is really about energy.

The new test thrusts **prograde**: along the pair's relative velocity, or sideways at first. It's steered through the real buttons, within the 1 turn/s rotation limit, and timed until the pair is 0.3 apart. It's sensitive to how the controller happens to meet the bounces, so it's reported as the median over 16 starts (8 headings, each sense of rotation).

### 4.2 Bounces leaked energy

Measured: an isolated Newtonian pair released a diameter apart should bounce at that height forever (the appendix's elastic case). In the simulation it settled into contact after about 50 bounces.

The cause was the contact handling. A contact is caught a substep late, after the planets have overlapped, and stopping them at touching sinks them a little into each other's gravity well at every bounce. That leak, not just the walls, drove much of the clustering and "chatter" seen since M0.

Three fixes were measured in a 1-D model of the integrator, over 10 minutes, starting a diameter apart:

| Contact handling | Result |
|---|---|
| Stop at touching (M0 to M2) | settles into contact within about 50 bounces |
| Mirror the overlap | bounces grow from 1 to 38 diameters |
| Mirror, then remove the excess speed | settles into contact |
| Kick–drift–kick, contacts at their exact time in the drift | 1 to 2,100 diameters at the stronger gravity |
| **Kick–drift–kick, each substep split at the predicted contact** | **exactly 1.000 diameter every minute; energy within 1e-4** |

The last is now the integrator (PLAN D-4, M2 amendment):
- Velocity Verlet.
- Each substep is split at the earliest predicted contact. Each contact time comes from the second-order expansion of a distance, solved with a stable quadratic.
- The bounce happens at that moment.

A gate test holds it: an isolated pair still bounces a full diameter high after 10 minutes, with energy within 0.1%.

### 4.3 Newtonian candidates

Gravity weakens with a smaller ring at the same ring period, since Gm ∝ R³ / T₃². ε = 0, correction factor 2 (1 can't hold a Newtonian 8-ring), energy-conserving bounces. Passes 8–10:

| Ring radius | Thrust | Gm | Escape speed | Median escape, of 16 starts | Round length, 3 / 5 / 8 players | Points per min | Time near another planet | Longest stuck spell (median) |
|---|---|---|---|---|---|---|---|---|
| 0.44 | 1.4 | 0.058 | 1.97 | 19 s | 17 / 12 / 10 s | 70 / 104 / 202 | 10–36% | 0.3–1.2 s |
| 0.22 | 0.6 | 0.0073 | 0.70 | 18 s (2 of 16 not within 60 s) | 47 / 30 / 29 s | 30 / 54 / 75 | 7–23% | 0.4–1.2 s |
| 0.22 | 0.8 | 0.0073 | 0.70 | 15 s | 38 / 22 / 25 s | 31 / 59 / 88 | 7–23% | 0.4–1.4 s |
| **0.18** | **0.6** | **0.0040** | **0.52** | **8.4 s** | **48 / 37 / 27 s** | **29 / 47 / 71** | **7–23%** | **0.3–1.1 s** |
| 0.18 | 0.8 | 0.0040 | 0.52 | 12.5 s | 48 / 56 / 25 s | 33 / 56 / 85 | 7–23% | 0.3–0.7 s |
| *softened (§3), thrust 1.4* | | 0.068 | 2.13 | 1.2 s | 40 / 29 / 17 s | 42 / 65 / 127 | 8–24% | 0.3–0.7 s |

**Conclusions:**
- With energy conserved and gravity weak, Newtonian play clusters no more than softened play did.
- The original thrust, 0.6, suffices.
- The cost: a pair stopped dead against each other takes several seconds to work free, not about one. Thrust has to build an orbit, and the rotation limit caps how much of it points the right way.
- A resting pair is a stalemate, not a drain: the hunter must also get a diameter clear to score again.

### 4.4 Final values

| Setting | Value |
|---|---|
| Gravity | Newtonian (softening ε = 0) |
| Ring radius | 0.18 arena sides: the planets start near the centre (the owner's suggestion) |
| 3-planet ring period | 10 s, so Gm ≈ 0.0040; the 8-planet ring turns at 0.22 turn/s |
| Thrust | 0.6 arena sides/s² |
| Correction factor | 2 |
| Planet radius | 0.03; ring clearance 0.03, so a ring capacity of 12 |
| Wall energy loss | 0.2 |
| Re-arm gap | one planet diameter |
| Ready expiry | 60 s |

**Measured together (pass 10):**
- the 8-ring is held within 0.24% and breaks up about 13 s after release;
- rounds last 48 / 37 / 27 s (3 / 5 / 8 bots, ante 5), at 29 / 47 / 71 points a minute;
- top speed 1.8 arena sides/s.

### 4.5 The rotation limit and the touching orbit

The owner's rule: the maximum rotation rate must be at least the orbital rate of two planets almost touching, √(2Gm/(2r)³). Only then can a planet circling another keep its thrust sideways. It accounts for the escape times in §4.3:

| Ring radius | Gm | Touching orbit | Median escape |
|---|---|---|---|
| 0.44 | 0.058 | 3.70 turn/s | 19 s (thrust 1.4) |
| 0.22 | 0.0073 | 1.31 turn/s | 18 s (thrust 0.6) |
| **0.18** | **0.0040** | **0.97 turn/s** | **8.4 s** (thrust 0.6) |

At the final values the rule holds with 3% to spare, against the 1 turn/s maximum. A gate test (`src/config.test.ts`) fails any re-tune that breaks it, and the tuning page shows the margin.

**Still unknown:** how it feels to people.
