# M2 tuning: report

**Date:** 2026-10-24.
**Answers:** PLAN.md Q-12 (the physics values the requirements left **TBD**) and C-16 (what happens when a hunter catches its quarry). The owner left the choice to Claude's judgement for the MVP.
**Method:** `dev/tune.metrics.ts` measures each candidate. The raw passes are `pass-1.json` to `pass-5.json`. `dev/tuning.html` runs the same simulation live, with a slider per setting.

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

## 3. Chosen values

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
