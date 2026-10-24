# roslambo: Plan

**Status:** approved by the owner on 2026-10-24.
- The owner left the open questions to Claude's judgement for the MVP, so every question is settled at its proposal except four. Q-1, Q-2, Q-9 and Q-19 need facts or choices only the owner has.
- Q-19 was settled on 2026-10-24: no license. The owner keeps all rights.
- Manual runs are deferred for now (§15).
- M2 finished on 2026-10-24: the tuning is in [research/tuning/REPORT.md](research/tuning/REPORT.md). Its amendments are marked "M2".
- M0 finished on 2026-10-24: see [research/lockstep/REPORT.md](research/lockstep/REPORT.md). Its amendments are marked "M0" in §3, §4, §9 and A.4.

**Date:** 2026-10-24; approved 2026-10-24.
**Answers:** the "First deliverable" section of [REQUIREMENTS.md](REQUIREMENTS.md) (branch `mvp`, commit 859b87b).

How to read this:
- **§0** summarises the plan.
- **§1** is the questions for you (Q-n): requirement gaps and changes. Each has a proposal; none is decided.
- **§2** lists the requirement wording that your answers would change.
- **§3** is the conflicts and realism register (C-n).
- **§4** is the design decisions (D-n), each with the options rejected and the cost if it's wrong.
- **§5** is the evidence.
- **§6–§14** are the design, **§15** the milestones, **§16–§19** the notes, traceability, third parties and deferrals.
- **Appendix A** holds byte formats, storage schema, constants and pinned versions.

Approval needs only §0–§4. Once the plan is approved, a Q, C, D or M number is never reused: a settled item keeps its number and records what settled it.

---

## 0. Summary

**Core idea: one deterministic timeline per round.**
- Everything that matters is a pure function of the round's settings and the stream of player inputs, tick by tick: joins, Readys, the countdown, thrust, bounces, points and the freeze.
- Peers exchange inputs, and vote with a hash of the state they computed.
- The same inputs give the same state. The vote catches the cases where inputs reached peers differently, and the losing peers copy the winning state.

**The stack:**

| Area | Choice |
|---|---|
| Simulation | Pure TypeScript. 60 ticks per second, 4 physics substeps per tick. float64 restricted to exact operations, enforced by lint. Angles are 32-bit binary angles; sine and cosine are our own polynomial. |
| Timeline | Rollback lockstep: a 2-tick input delay, then a 12-tick window for late inputs. After that the tick is final, and a missing input counts as "no buttons", so a silent player drifts. |
| Consensus | Every input message carries a 64-bit hash of the sender's newest final state. The plurality of player votes wins, with the smallest hash on a tie. A peer on the losing side fetches the winning state and replays from it. |
| Networking | Trystero 0.26.0 over Nostr, unpatched. One binary action carries every message. Full mesh, with forwarding for pairs that can't connect. amorfus's relays and STUN; TURN only if the user brings one. |
| Rendering | Canvas 2D, interpolated between ticks. Screens and buttons are DOM. |
| Persistence | localStorage. One profile record (player ID, name, balance, round ledger) written in one step, plus saved round states and witness records. One game tab per browser. |
| Build | Vite 8, TypeScript 6.0, ESLint 10, vitest, Playwright with Chromium, Firefox and WebKit. |
| Hosting | Cloudflare Workers static assets: assets only, request logs off. |

**Approval changed these requirements** (exact wording in §2; applied to REQUIREMENTS.md on 2026-10-24, except the acceptance lines, which wait for Q-1 and Q-2):
- Votes carry a hash of the newest final tick, not "the state for the previous tick" (Q-4).
- Players and spectators get a mesh cap, not only the ring limit (Q-3).
- A disconnect during the countdown keeps the planet (Q-5).
- Home lists unsettled rounds (Q-6).
- A rule for two histories of one round (Q-7) and for the Play again round ID (Q-8).
- The acceptance test gets named networks and devices (Q-1, Q-2).

**Biggest risks:**
1. Without TURN, some pairs of networks can't connect, phones on mobile data especially. In lockstep a missing pair breaks the game, not just a view of it, and forwarding helps only when a third peer reaches both (C-1).
2. Determinism across V8, SpiderMonkey and JavaScriptCore follows from the ECMAScript spec, but nothing has proved it for this code. M0 tests it first (C-7).
3. Each player sends 60 messages per second to every other peer. Nobody has measured that on a phone; M0 does (C-2).
4. Safari may delete a player's identity and balance after 7 days without a visit (C-5).
5. Every gameplay constant is **TBD**, and the rules let a hunter that catches its quarry drain it quickly (C-16). M2's tuning page settles the constants with you.

**What approval authorises:** the decisions in §4, M0 (a throwaway spike), then M1–M6.
- It does **not** authorise deploying. The first deploy waits for your go-ahead and a domain (Q-9).
- REQUIREMENTS.md is yours. The §2 edits go in only after you answer, in one commit that cites the Q-numbers.

**What this rests on (§5):** your requirements, amorfus's plan and networking code, and Trystero 0.26.0's source. Nothing has been measured for this plan. The only numbers are the physics appendix, re-run, and limits read from Trystero's source.

**Approved** on 2026-10-24, with the settlements recorded at the top of §1.

---

## 1. Questions for you

**Settled on 2026-10-24.** The owner left these to Claude's judgement for the MVP:
- Q-3 to Q-8 and Q-10 to Q-22 are settled at their proposals, except Q-19.
- Q-12's values are chosen on M2's tuning page and recorded in REQUIREMENTS.md's Configuration table.

**Still open:**

| # | Needed by |
|---|---|
| Q-1 (reference devices) | M4 |
| Q-2 (machines, people and networks for the deferred manual runs) | M6 |
| Q-9 (domain) | M6 |

### Group A — needs your answer

| # | Question | Proposal | Needed by |
|---|---|---|---|
| Q-1 | Which reference devices for "60 fps on mid-range hardware"? | You name one phone (model and browser) and one laptop with integrated graphics. A run passes if the frame interval stays at p95 ≤ 18 ms and max ≤ 50 ms through a scripted 2-minute round with 8 planets, at 60 Hz. | M4 |
| Q-2 | Which networks and people for the acceptance test, and for M0's manual run? | **Must pass:** three machines on at least two home broadband networks, the phone on Wi-Fi. **Best effort:** the phone on mobile data. Who provides the machines? Is one of them a Mac or an iPhone, so that real Safari is tested? | M6 (was M0, before the manual runs were deferred) |
| Q-3 | Should the number of players be capped by what a full mesh can carry, as well as by the ring (C-2)? | Yes: maximum players ≤ the lesser of the ring limit and 8, and at most 4 spectators, which is exactly the performance requirement. Raised later if M3's load test allows. | M1 |
| Q-4 | Can votes use a hash of the newest final tick, instead of each player broadcasting "its state for the previous tick" (C-3)? | Yes. The input message carries the hash; the full state goes only to a peer that lost a vote or just arrived. The voted tick trails the live tick by about 0.2 s. | M0 |
| Q-5 | What happens to a player who disconnects, or presses Leave, during the countdown? | The roster locks when the countdown starts. Their planet stays and drifts, they pay the ante, and the countdown goes on. Alternative: they're removed, and the countdown is cancelled if fewer than the minimum remain. | M2 |
| Q-6 | Does opening the game count as "returning" to an unsettled round that is still running, or paused? (C-6) | No. In the background the browser only asks for results. Home lists your unsettled rounds with **Rejoin** (running) or **Resume** (paused), and a round resumes only when you open it. This adds a list to Home. | M5 |
| Q-7 | Which history wins when two meet? This happens when players return to a paused round with saves from different ticks, or when one player resumed alone before another came back. | A running round beats a saved state. Between saved states the later tick wins, then the smaller hash. The losing history is dropped, points included. | M3 |
| Q-8 | How do two Play again presses at the same moment become one round? | Derive the new round ID from the old one: the first 100 bits of SHA-256("roslambo again" + old ID), plus the check character. Every press leads to the same room, so there's no race. This bends "100 random bits". Alternative: a random ID announced on the old round's timeline, where the first press by tick wins and spectators' presses are relayed by a player. | M4 |
| Q-9 | Which domain? | — | M6 |
| Q-10 | How long do witnesses keep results, and how many rooms may a browser watch at once? | 30 days. At most 20 witnessed rounds and 10 unsettled rounds at a time, to limit load on the public relays (C-6). | M5 |
| Q-11 | Accept Safari's storage limit (C-5)? | Accept it, like clearing browser data, and say so in the README. Alternative: export and import of identity and balance, which would be a new requirement. | M5 |
| Q-12 | How to settle the physics **TBD**s: thrust, ring margin and clearance, wall energy loss, arena size, planet size, mass and G, the correction factor, and the Ready expiry? | On M2's tuning page, together, starting from Appendix A.5. Mass and G only ever appear as their product Gm. I propose setting Gm through a more intuitive value, the period of a 3-planet ring. **Settled at M2** by measurement (research/tuning/REPORT.md), and recorded in REQUIREMENTS.md's Configuration table. | M2 |

### Group B — proposal ready; confirm or override

| # | Question | Proposal |
|---|---|---|
| Q-13 | Points in a single tick (C-11) | All scoring contacts in a tick apply together. The round freezes at the end of any tick in which a player is at 0, and several players can end at 0. |
| Q-14 | Wall energy loss (C-12) | The planet's whole kinetic energy drops by the fraction: reflect, then scale the speed by √(1 − loss). Alternative: only the part of the velocity toward the wall loses energy. |
| Q-15 | When a player counts as disconnected before the countdown | No input for 3 seconds (180 final ticks). |
| Q-16 | Two tabs of one browser share one player ID (C-15) | One game tab at a time. A second tab offers to take over. |
| Q-17 | Everyone in a room sees every player's ID, so anyone can claim to be a returning player (C-14) | Honor system for the MVP. A key pair per browser can fix it later. |
| Q-18 | Keys on non-QWERTY keyboards (C-17) | Physical key positions (`KeyW`, `KeyA`, `KeyD`), so AZERTY plays on Z, Q and D. |
| Q-19 | License | **Settled 2026-10-24 by the owner: no license, all rights reserved.** `package.json` says `"license": "UNLICENSED"`, and the README says no license is granted. The repo is public (checked 2026-10-24), so it can be read but not reused. Bundled packages' own notices still ship (§18). |
| Q-20 | A phone held sideways | The arena fills the height, with the buttons in a column beside it. |
| Q-21 | Cancelling Ready | Pressing Ready again cancels it, except during the countdown. |
| Q-22 | Display name length | Up to 20 characters, always shown as plain text. |

---

## 2. Requirement changes your answers would make

REQUIREMENTS.md is yours. These edits went in on 2026-10-24, in one commit that cites the Q-numbers, except three rows that wait: Q-1 and Q-2 (the acceptance lines) and Q-12 (the values, from M2).

| Requirement (current) | Amended wording | From |
|---|---|---|
| "Each player broadcasts its state for the previous tick and its own control inputs to every other peer" | "Each player broadcasts its control inputs, and a hash of its state for its newest final tick, to every other peer. A peer sends its full state only to a peer that asks for it" | Q-4 |
| "the **maximum players**: at least the minimum, and no more than the ring can hold" | "… no more than the ring can hold, and no more than the mesh cap (8 for now)". Add under *Joining*: "A round accepts up to 4 spectators" | Q-3 |
| "A player who leaves or disconnects before the countdown is removed from the ring" | Add: "A player who leaves or disconnects during the countdown keeps their planet, which drifts" | Q-5 |
| Screens, Home: "the player's balance and display name (editable), with **Propose a round** and **Join**" | Add: "and their unsettled rounds, each with **Rejoin** or **Resume**" | Q-6 |
| *Disconnects* | Add: "If peers hold different histories of a round, a running round wins over a saved state, and between saved states the later tick wins" | Q-7 |
| Round ID: "100 random bits" | "100 random bits; for Play again, 100 bits derived from the previous round ID" | Q-8 |
| *Scoring* | Add: "Point changes within one tick apply together" | Q-13 |
| Physics: "lose a fraction of their energy" | "lose a fraction of their kinetic energy" | Q-14 |
| *Persistence* | Add: "One game tab per browser" | Q-16 |
| Acceptance: "Three browsers on different machines …" | "… on the networks named in `docs/acceptance.md` …" | Q-2 |
| Acceptance: "60 fps on the reference devices (**TBD**)" | "… on the devices and by the frame-time criteria in `docs/acceptance.md`" | Q-1 |
| Configuration table | The values you sign off at M2 | Q-12 |

---

## 3. Conflicts and realism register

**Severity:**
- **Major:** changes an acceptance line, or leaves a residual you must accept.
- **Minor:** met by a definition, a design choice or one of your answers.

### Major

**C-1 — Without TURN, some players can't connect, and in lockstep a missing link breaks the game.**
- **Problem:**
  - Trystero builds a full mesh. Strict NATs and carrier-grade NAT, common on mobile data, often can't connect directly. amorfus quotes 20–30% of WebRTC sessions needing a TURN relay; that's an industry figure, not measured here.
  - The acceptance test includes a phone.
  - If peer A never receives player B's inputs, A's simulation differs from everyone else's at every tick.
  - Trystero's peer-assisted signaling (issue #161) is still open.
- **Proposed resolution:**
  - Peers forward inputs for a pair that can't connect (D-14).
  - TURN in Settings.
  - A clear failure message.
  - Acceptance on named networks (Q-2).
  - M0 tries real networks first, so this is measured first, not last.
- **Residual:** two peers that can meet only through TURN, with no common neighbour, can't play together.

**C-2 — The ring holds far more planets than a full mesh can carry.**
- **Problem:**
  - With sensible sizes the ring holds 25–41 planets (appendix).
  - Each player sends a message every tick to every other peer. With 8 players and 4 spectators that's 660 messages per second out and 420 in, per player. With 41 players it's 2,400 out.
  - Trystero opens one WebRTC connection per pair: 66 connections for 12 peers, 820 for 41.
  - In amorfus, a 4-peer mesh took 3.8–6.4 s to form, on one machine.
  - No palette has 41 colours that people can tell apart (C-13).
- **Proposed resolution:** the Q-3 cap. M0 and M3 measure the real limits.

**C-3 — "Broadcasts its state for the previous tick" doesn't fit the traffic note or the timing of inputs.**
- **Problem:**
  - A full state every tick costs players × peers × about 1 KB × 60 per second.
  - "The previous tick" can't be final yet. A tick is final only once every player's input for it has had time to arrive.
- **Proposed resolution:** Q-4.

**C-4 — 60 fps can't be tested until the devices are named.**
- **Problem:** no device, scenario or metric.
- **Proposed resolution:** Q-1, recorded in `docs/acceptance.md` at M4.

**C-5 — Safari may not keep the identity and balance "across visits".**
- **Status:** accepted limitation, unless you choose the Q-11 alternative.
- **Problem:**
  - WebKit documented in 2020 that Safari deletes all of a site's script-writable storage, localStorage and IndexedDB included, after 7 days of Safari use without the user interacting with that site. I haven't re-checked this against current Safari.
  - Web apps added to the Home Screen are exempt.
  - The effect is a new identity with a balance of 0, and the loss of unsettled rounds and witness records.
- **Proposed resolution:** Q-11.

**C-6 — The missed-results design has limits.**
- **Problem:**
  - Passive peers don't connect to each other, so a witness never hears about a settlement made while it was away. It waits until the retention period ends.
  - Every watched room costs a subscription and periodic announcements on six public relays, per browser. Many rooms could hit relay rate limits.
  - The requirements don't say whether rejoining an unsettled round in the background counts as returning to it. If it does, merely opening the game would resume paused rounds and take control of planets.
- **Proposed resolution:** acknowledgements (D-19), the Q-10 caps and Q-6.

**C-7 — The determinism test covers engines, not the browsers people actually use.**
- **Problem:**
  - Playwright's WebKit is not Safari, and iOS runs its own JavaScriptCore build.
  - ECMAScript makes `+ − × ÷` and `Math.sqrt` exact, so correct engines must agree. A JIT bug would break that silently.
- **Proposed resolution:**
  - Golden hashes in Node and in all three Playwright engines, run against the production bundle.
  - A startup canary in every browser (D-17), so a browser that computes differently refuses to play instead of desyncing.
  - Manual runs in real Safari on macOS and iOS at M6. M0's manual run is deferred (§15).

### Minor

| # | Problem | Proposed resolution |
|---|---|---|
| C-8 | Leaving or disconnecting *during* the countdown isn't specified. | Q-5 |
| C-9 | Two histories of a paused round need a rule (shared-timeline note). | Q-7, D-12 |
| C-10 | Two Play again presses at once (shared-timeline note). | Q-8 |
| C-11 | Several point changes in one tick, and several players reaching 0 together, aren't specified. | Q-13 |
| C-12 | "Lose a fraction of their energy" can mean total kinetic energy or only the motion toward the wall. | Q-14 |
| C-13 | "A distinct color" per planet works up to about 10–12 planets. | The Q-3 cap. Numbers are always drawn. |
| C-14 | Player IDs are broadcast in the room, so any peer can take over an absent player's planet, or collect their result. | Q-17: honor system. |
| C-15 | Two tabs in one browser are one player, and would send conflicting inputs. | Q-16 |
| C-16 | **A caught quarry probably can't escape.** Gravity at contact is R²/(4r²·S₃) times the acceleration that holds a 3-planet ring: about 90 for r = 0.07R, regardless of G and m. Once a hunter and its quarry touch at low speed, thrust on the scale of the ring's forces can't separate them, and every elastic bounce scores (the appendix shows 30 contacts in 3 time units). Rounds may end soon after the first capture. This is as specified for the MVP. | **M0 measured worse** (REPORT §3.4): with gravity alone, planets come to rest touching and register about 170 approach-gated contacts a second. **Settled at M2** (research/tuning/REPORT.md):
  - gravity is softened (ε = 0.25), so a touching quarry can thrust free when thrust beats twice the peak pull (1.4 against about 0.84);
  - a pair scores once per contact episode, re-arming once the surfaces are a full planet diameter apart (the owner's change on 2026-10-24; M2 had used a quarter diameter).

  Both are now in REQUIREMENTS.md. |
| C-17 | `W`, `A`, `D` are awkward on AZERTY and other layouts. | Q-18 |
| C-18 | It's unknown whether Playwright's WebKit on Linux has working WebRTC. | **Settled by M0:** it does, with Trystero's mDNS-to-loopback test option (REPORT §2). |
| C-19 | With two voters, any disagreement is a tie, and the smallest hash wins whether right or wrong. This happens before the countdown, and when only 2 of a round's players are connected. | Accepted. Honest peers rarely disagree (D-7). |
| C-20 | Browsers throttle timers in background tabs, and iOS suspends them. | A hidden player stops sending, so their planet drifts, as for a disconnect. On return the browser resyncs (D-23). Before the countdown, 3 s away removes them (Q-15). |
| C-21 | "No tracking" vs what P2P exposes: peers see each other's IP addresses; relays and STUN servers see IP addresses and timing; Cloudflare can keep request logs. | Logs off (D-25). §18 lists what each party sees. No analytics. |

---

## 4. Decisions

Each decision gives the choice, the options rejected, and the cost if it's wrong. Values marked *provisional* are confirmed or changed by M0.

### Simulation

**D-1 — float64 restricted to exact operations.**
- **Choice:**
  - The simulation uses JavaScript numbers with only `+ − × ÷`, `%`, comparisons, bit operations, `Math.sqrt`, `Math.abs/min/max/floor/ceil/round/trunc/fround/imul/clz32` and literal constants.
  - ESLint bans every other `Math` member in `src/core/sim/**`, along with `**`, `Math.random`, `Date`, `performance`, `crypto` and `Intl`. `**` is banned because ECMAScript leaves exponentiation implementation-approximated.
  - NaN must never occur; the state codec asserts it.
- **Rejected:**
  - 32-bit fixed point: gravity's 1/d² spans a wide range, so overflow handling would be needed everywhere.
  - BigInt: slow, and allocates on every operation.
  - WebAssembly: a second toolchain, and it needs the same discipline anyway.
- **Cost if wrong:** some browser's JIT bends IEEE rules. The goldens and the canary catch it. The fallback is fixed point inside `src/core/sim/math`, a few hundred lines, plus re-tuning.
- **M0, confirmed:** Node, Chromium 156, Firefox 157 and WebKit 27.2 matched at all 220 checkpoints over 220,000 ticks and about 2.2 million contacts (REPORT §2). The polynomial `dir()` is within 7×10⁻¹⁶ of `Math.cos` and `Math.sin`.

**D-2 — Angles are 32-bit binary angles, with our own sine and cosine.**
- **Choice:**
  - 2³² units per turn. Orientation is a u32 that wraps with `>>> 0`.
  - The rotation rate is an i32, in units per tick. The maximum is round(2³²/60) = 71,582,788. The acceleration is round(2 · 2³²/60²) = 2,386,093 per tick, so a planet reaches the maximum from rest in 30 ticks, which is 0.5 s.
  - `dsin` and `dcos` take the octant from the top 3 bits, then evaluate a fixed polynomial on [0, π/4] in Horner form.
- **Rejected:**
  - `Math.sin` and `Math.cos`: engines may differ in the last bit, and a hash sees that.
  - A direction table, the requirements' suggestion: it rounds thrust to the table's resolution, and the ring needs angles such as k/N of a turn anyway. A 4,096-entry table is the fallback.
- **Cost if wrong:** a polynomial error shows only as a tiny direction error, the same on every machine. Low.

**D-3 — 60 ticks per second, 4 physics substeps.**
- **Choice:** one tick is 1/60 s, with one input per player per tick. Physics runs in 4 substeps of 1/240 s.
- **Rejected:**
  - 30 Hz: coarser controls, and more risk of planets passing through each other.
  - 120 Hz: twice the messages.
  - A variable timestep: not deterministic.
- **Cost if wrong:** message counts scale with the tick rate. If M0 finds 60 messages per second per peer too many for a phone, each message can carry 2 ticks of input, without touching the simulation.
- **M0, confirmed on desktop:** with 8 players and 4 spectators, a player tick costs 0.8 ms on average (p95 about 2.3 ms), mostly sending (REPORT §2). The phone is unmeasured until the deferred manual run.

**D-4 — Integration and contacts.**
- **Choice:** each substep runs:
  1. Forces: gravity for each pair i < j in planet order, using max(d, 2r) as the distance so an overlap never makes it spike; thrust; the pre-start correction.
  2. Semi-implicit Euler: velocity first, then position.
  3. Planet contacts, in pair order. If two planets touch while moving toward each other, swap the components of their velocities along the line between them (equal masses, elastic) and separate the overlap. Record the contact.
  4. Wall contacts, the same way, with the energy loss (Q-14).

  Scoring contacts are collected and applied at the end of the tick (Q-13).
- **"One contact, one point":** only planets moving toward each other count, so the ticks they still overlap after a bounce don't score again.
- **Rejected:**
  - Continuous collision detection: more code, and substeps suffice. A test asserts no tunnelling up to 5 arena widths per second.
  - An iterative impulse solver: equal-mass circles don't need one.
  - Velocity Verlet: fine too, but Euler is simpler when contacts change velocities mid-step.
- **Cost if wrong:** feel and energy drift. The tuning page shows it, and the integrator is one module.
- **M2, amended** (C-16; research/tuning/REPORT.md):
  - Gravity is softened: a = Gm·d/(d² + ε²)^{3/2}, still with d ≥ 2r.
  - A hunter's `engaged` flag (A.1) makes a pair score once per contact episode, until it separates past 2r + gap.

**D-5 — Pre-start ring: ideal slots, plus a spring.**
- **Choice:**
  - An ideal ring turns at ω_N = v_N/R (appendix formula). Its phase is a binary angle, advanced by a fixed integer each tick.
  - Planet i's slot is at phase + i/N of a turn.
  - Correction: a = c · (ω_N² · (slot − x) + 2ω_N · (slot velocity − v)), where c is the correction factor. It's added to gravity until the countdown reaches 0.
  - A join or leave snaps every planet to its new slot and slot velocity, keeping the ring's phase, and resets every rotation to the default: facing the quarry (slot angle + ¼ + 1/(2N) of a turn), turning at ω_N. A lone planet doesn't rotate.
- **Rejected:**
  - Placing planets on their slots every tick: gravity would then do nothing, but the requirements say gravity holds the ring.
  - Gliding planets to their new slots: slower, and neighbours can touch on the way.
- **Cost if wrong:** looks only.
- **M2, amended:** with softening, the ring's speed comes from a direct sum of the softened pulls on one planet, using exact operations. A test checks it against the appendix formula at ε = 0. Gm is set from the 3-planet ring period.

**D-6 — The arena is a convex polygon.**
- **Choice:** walls are a list of half-planes. The ring radius uses the inscribed radius, R = inradius − r − margin, which is L/2 − r − margin for the square.
- **Rejected:** hard-coded square bounds; the requirements ask for a design that doesn't depend on the shape.
- **Cost if wrong:** none.

### Timeline and consensus

**D-7 — Rollback lockstep.**
- **Choice:**
  - A player's input for tick t is sampled at their local tick t − d and sent at once. The input delay d is 2 ticks (33 ms), *provisional*.
  - Each peer simulates up to the present with the inputs it has. A missing remote input is predicted as that player's last known input.
  - A late input makes the peer re-simulate from that tick. This is cheap: 12 ticks × 4 substeps × 28 pairs.
  - Tick t becomes **final** at local tick t + w, where the late window w is 12 ticks (200 ms), *provisional*. An input still missing then is final as "no buttons", which makes a silent player drift.
  - Points, the countdown and the results are taken from final ticks.
- **Rejected:**
  - Plain lockstep that waits for every input: one slow player stalls everyone, and detecting a disconnect takes seconds.
  - An input delay without rollback: the same tolerance would need d ≈ w, which means 200 ms of lag on every key.
  - A host peer that decides: that isn't majority voting, and the host could leave.
- **Cost if wrong:** if remote planets visibly jump too often, raise d. Plain delay lockstep is the special case w = d, in the same code.
- **M0, amended** (REPORT §3.1): a joiner lost inputs that were in flight when its STATE was built, and diverged once each time.
  - Every TICK now repeats the sender's previous 16 inputs (§9.3).
  - A joiner holds finalisation until it has heard from every player active in the STATE, at most 500 ms.
  - A joiner votes only once a tally agrees with it, or after a resync.
  - With these, joiner divergences fell to zero in every run.

**D-8 — Every roster change is an input on the timeline.**
- **Choice:**
  - JOIN (with the name), LEAVE and READY travel as events inside a peer's input for a tick.
  - The state transition applies them deterministically. Joins in (tick, player ID) order give the planet numbers.
  - A join beyond the maximum, or after the countdown has started, is ignored, and that peer remains a spectator.
  - A player whose inputs have been missing for k = 180 final ticks (Q-15) is removed before the countdown.
  - Ready expiry and the start of the countdown are computed from the state.
- **Rejected:**
  - The proposer or an elected leader admits players: a single point of failure, and the proposer may leave.
  - Each peer's arrival order: it differs between peers, which is the shared-timeline note's point.
- **Cost if wrong:** a wrong rule is still deterministic, so it shows up in tests and is fixed in one place.

**D-9 — Votes.**
- **Choice:**
  - Every input message carries (vote tick, vote hash) for the sender's newest final tick.
  - The hash is 64 bits: MurmurHash3 x86-32 run twice with two seeds over the canonical state bytes (A.1).
  - At local tick g + w + v, each peer tallies the votes for tick g that it has received from the round's players. The vote window v is 12 ticks, *provisional*.
  - The hash with the most votes wins. A tie goes to the numerically smallest hash, read as an unsigned big-endian number.
  - A peer with no players connected trusts its own state.
- **Rejected:**
  - SHA-256 through `crypto.subtle`: asynchronous at 60 Hz, and cryptographic strength buys nothing under the honor system.
  - A vote every few ticks: an input message goes every tick anyway, and the vote adds 12 bytes.
  - Full states: C-3.
- **Cost if wrong:** a deliberately crafted hash collision counts as cheating, which is out of scope. Changing the hash means one function plus the goldens.
- **M0, amended** (REPORT §3.2): a peer more than about 200 ms away heard only its own vote by tally time, and stayed diverged.
  - A vote now counts whenever it arrives, while its tick is still in the 256-tick history, and a changed outcome triggers the resync.
  - Confirmed: a corrupted peer is caught at the first tally of the corrupted tick (0.4 s) and repaired one round trip later.

**D-10 — Resync, and only confirmed results count.**
- **Choice:**
  - A peer whose hash lost asks a peer on the winning side for STATE: that state, plus the sender's inputs after it. It replaces its own state and re-simulates.
  - A spectator or player arriving mid-round does the same.
  - The freeze is acted on only after the vote for the freeze tick confirms it. That covers the results screen, balances and the witness record.
- **Rejected:** acting on the local freeze, because a peer in the minority could credit a round that didn't end.
- **Cost if wrong:** about 0.4 s between the freeze and the results screen.

**D-11 — The tick clock.**
- **Choice:**
  - Ticks come from `performance.now()`.
  - A peer arriving aligns its clock to the peer that sends it STATE: that peer's tick, plus half the round trip measured with Trystero's `ping`.
  - After that, each peer compares when input messages arrive with when it expected them, and runs up to 1% fast or slow to stay at the median of the players.
  - A peer more than w/2 behind jumps to the median and resyncs.
- **Rejected:**
  - `Date.now()`: machine clocks can be seconds apart.
  - NTP or HTTP time: contacts a third party.
- **Cost if wrong:** more late inputs and resyncs, which M0's telemetry shows.
- **M0, amended** (REPORT §3.3), replacing the ±1% rule above. Jitter biased every peer's estimate the same way, and with two peers the "median" was the larger offset, so one joiner moved everyone. Now:
  - proportional correction (0.5% per tick of offset, at most 2%) with a 1-tick deadband;
  - beyond w/2, a jump forward or a pause;
  - the true median;
  - a player's offset counts only after 2 s.

  The 120 s three-engine run then had no jumps and no late inputs.

**D-12 — Timeline identity and merging.**
- **Choice:**
  - Each timeline has an ID: a hash of the round ID, the proposer's player ID and its start time. A resumed round gets a new ID, derived from its saved state.
  - HELLO says which timeline a peer holds. When two meet in one room, both sides apply the same rule: Q-7, and for two empty timelines from a Play again race, the older one.
  - The losing peer drops its timeline and takes the winner's STATE. Its player re-sends JOIN if the winner hasn't reached the countdown yet.
- **Rejected:** asking the user to choose, because peers could choose differently.
- **Cost if wrong:** a history is lost in a rare case. Q-7 decides which one.

### Networking

**D-13 — Trystero 0.26.0, unpatched, actions only.**
- **Choice:**
  - `@trystero-p2p/nostr` 0.26.0, pinned exactly. One binary action carries every message (§9). `maxReceiveBytes` is 1 MiB; the default is 256 MiB.
  - Only `src/net/trystero.ts` imports the library.
  - The room config is an object literal typed against `JoinRoomConfig`. This is amorfus's lesson: an untyped spread there silently fell back to the library's own relays.
  - 0.26.0 adds a per-room receive budget, payload size checks, receive approval and pending-data timeouts. Together they cover what amorfus patched; M0 floods it to confirm.
  - Optional, only if M0 shows stalls on the reliable channel: a negotiated, unordered, no-retransmit channel for input messages. Trystero shares one connection per remote peer across rooms and keeps it about 123 s after leaving, so that channel would need a room tag on every frame, as in amorfus.
- **Rejected:**
  - 0.25.4 with amorfus's patch: 0.26.0 has the limits, and #195 and #196 were closed with it.
  - PeerJS, simple-peer, libp2p and the others: amorfus PLAN §10.1.
- **Cost if wrong:** re-apply amorfus's patch, which already exists.
- **M0, confirmed** (REPORT §2): 80 attack sends were refused, both 2 MiB payloads and an unregistered action type, and the victim's heap stayed at 4–5 MiB. Reliable actions had zero late inputs locally. The unordered channel stays unbuilt until a real lossy network shows it's needed.

**D-14 — Forwarding for pairs that can't connect.**
- **Choice:**
  - Each peer sends PEERS, its list of open connections, whenever that changes and every 5 s.
  - For a pair A and B without a link, the peer with the smallest player ID connected to both forwards A's input messages to B, and B's to A, inside FWD.
  - Receivers drop duplicates by (origin, tick).
- **Rejected:**
  - No forwarding: the pair diverges at every tick.
  - Routing everything through one hub: a single point of failure, and extra latency for everyone.
- **Cost if wrong:** extra load on the forwarder. Under the Q-3 cap that's at most a few hundred small messages per second.

**D-15 — Hand-written binary messages.**
- **Choice:**
  - Little-endian `DataView` codecs.
  - Every message is ≤ 16,000 bytes, below Trystero's 16 KiB frame, so nothing is ever split.
  - The decoder never throws; it rejects anything malformed.
- **Rejected:**
  - JSON: size, plus garbage collection at 60 Hz × peers.
  - MessagePack or protobuf: a dependency and a schema step, for a dozen messages.
- **Cost if wrong:** low.

**D-16 — A handshake with a build hash.**
- **Choice:**
  - HELLO runs inside Trystero's `onPeerHandshake`, with a 10 s timeout.
  - It carries the protocol version and a build hash over every simulation constant and the state codec version.
  - Any difference gets a REFUSE that says "reload to get the latest version". Peers on different builds never share a timeline.
- **Rejected:** a version string alone, because a re-tuned constant would then desync silently.
- **Cost if wrong:** none.

### Client

**D-17 — A startup determinism canary.**
- **Choice:**
  - The build embeds the hash of a scripted 10-second, 8-planet run with bounces and wall contacts.
  - Every page load runs it, in a few milliseconds, before allowing Play or Watch.
  - On a mismatch, the page says the browser computes differently and offers no round. Spectators simulate too, so watching wouldn't work either.
- **Rejected:** nothing; it's cheap insurance (C-7).
- **Cost if wrong:** none.
- **M2, amended:** the canary runs 400 ticks with a 1-second countdown (the arithmetic is the same; the 10-second wait taught nothing). It takes about 5 ms on a desktop, and its hash lives in `src/core/sim/goldens.json`.

**D-18 — localStorage, and one game tab.**
- **Choice:**
  - The profile (player ID, name, balance, and a ledger of rounds with "ante paid" and "settled") is one key. A credit and its "settled" mark are written in a single `setItem`, so a closed tab can't leave a half-applied result.
  - Saved round states and witness records get their own keys.
  - Round states are saved every second and on `pagehide`.
  - A Web Lock picks one game tab (Q-16).
- **Rejected:**
  - IndexedDB: asynchronous transactions for a few kilobytes, and more code.
  - Cookies: sent to the server.
- **Cost if wrong:** move to IndexedDB if the data grows. The schema is versioned.

**D-19 — Witnesses track acknowledgements.**
- **Choice:** a witness marks a player settled when that player sends SETTLED, not because the player was connected at the freeze.
  - Players present at the end acknowledge at once, so the common case behaves as the requirements describe.
  - A player who closed the tab between the freeze and its own confirmation is still covered.
- **Cost if wrong:** one extra small message per player per round.

**D-20 — Player ID.**
- **Choice:** `crypto.randomUUID()`, once per browser, stored in the profile and sent in HELLO. Trystero's per-load `selfId` is mapped to it for each connection.
- **Rejected:**
  - `selfId`: it changes on every load.
  - A key pair: Q-17.
- **Cost if wrong:** none; a key pair can wrap it later.

**D-21 — Canvas 2D.**
- **Choice:**
  - One canvas, sized to the device pixel ratio (capped at 2).
  - Planets, numbers, orientation marks and hunter and quarry highlights, drawn every animation frame and interpolated between the two newest ticks.
  - Screens, lists and buttons are DOM.
- **Rejected:**
  - WebGL2: a dozen circles don't need it.
  - PixiJS: a dependency for the same result.
  - SVG: workable, but it updates the DOM every frame on phones.
  - WebGPU: excluded by the requirements.
- **Cost if wrong:** the renderer is a leaf module. Switch to WebGL2 if M4 misses 60 fps.

**D-22 — No UI framework.**
- **Choice:** one TypeScript module per screen, and a small state machine between them.
- **Rejected:**
  - React: size.
  - Preact, Svelte, Lit: each would work, but none is needed for seven simple screens.
- **Cost if wrong:** a UI rewrite. The core doesn't depend on the UI.

**D-23 — Hidden tabs.**
- **Choice:**
  - The timeline runs on timers, not animation frames.
  - While the page is hidden, the browser stops sending inputs and votes, so the planet drifts, as for a disconnect.
  - When the page is visible again, it resyncs from a peer.
- **Cost if wrong:** none.

### Build

**D-24 — The toolchain.**
- **Choice:**
  - Vite 8.3.
  - TypeScript ~6.0, because typescript-eslint 8.72 still requires TypeScript < 6.1 even though 7 is out.
  - ESLint 10.
  - vitest 4.1 with fast-check, as in amorfus.
  - Playwright 1.64.1 with all three engines.
  - wrangler 4.
- **Rejected:**
  - TypeScript 7: lint wouldn't work.
  - Plain esbuild: Vite's dev server and build cost nothing extra.
- **Cost if wrong:** trivial.

**D-25 — Hosting.**
- **Choice:**
  - Workers static assets: assets only, no Worker script.
  - `observability` off, because request logs would keep IP addresses.
  - Hashed asset names, cached forever. `index.html` is revalidated, so a new build reaches players quickly; D-16 keeps old and new builds apart.
  - A local `npm run deploy` with a narrowly scoped API token. The first deploy waits for your go-ahead.
- **Cost if wrong:** none.

**D-26 — The spike stays separate.**
- **Choice:**
  - The spike lives in `research/lockstep/`, with its own `package.json`. Nothing in `src/` imports it.
  - The product code is written fresh at M1–M3.
  - Findings go in `research/lockstep/REPORT.md`.
- **Cost if wrong:** some code is written twice, which is the point of a throwaway.

---

## 5. Evidence: what this plan rests on

**Read:**
- REQUIREMENTS.md on `mvp` at 859b87b.
- `research/physics/ring_check.py`, re-run on 2026-10-24. Its output matches the appendix. It also shows that an 8-planet ring without correction is 10% out of round after 2.0 orbits.
- amorfus at c27fa8b (2026-10-19):
  - PLAN.md;
  - `src/net/` (`secret.ts`, `room-config.ts`, `transport.ts`, `trystero-transport.ts`);
  - `third-party.json`;
  - the Trystero patch;
  - the Vite, Playwright and wrangler configs;
  - the local Nostr relay in `e2e/lib/`;
  - `docs/build-decisions.md`.
- Trystero 0.26.0, `@trystero-p2p/core` and `@trystero-p2p/nostr`, read from the npm tarballs. Limits: 16 KiB action frames; a 256 MiB default receive budget per room; a 10 s timeout for pending data and 120 s for transfers; shared connections kept about 123 s after use. Features: `passive` rooms, request actions and `onReceive` approval.
- GitHub, on 2026-10-24: issue #161 is open; #195 and #196 were closed on 2026-10-04.
- The npm registry, on 2026-10-24: the versions in A.6.

**Measured since approval:** M0, in [research/lockstep/REPORT.md](research/lockstep/REPORT.md).

**Not measured** when the plan was written: everything else.
- No JavaScript was run for this plan; the environment it was written in has no Node.js.
- Every message rate, CPU cost and latency here is an estimate, labelled as one.
- M0 measures the networking and determinism unknowns, and M3 and M4 the rest.

---

## 6. Architecture overview

```
keyboard / touch ──► input sampler ──┐
                                     ▼
peers ── TICK / FWD ───────────► timeline ──► sim (pure) ──► final states ──► my vote ──► peers
          STATE ─────────────────► ▲  ▲                          │
                                   │  └── resync ◄── tally ◄─────┴──── votes from peers
renderer ◄── predicted states ─────┘
ledger and witness ◄── confirmed freeze
```

- **`src/core` is pure TypeScript:** no DOM, no timers, no network. It runs in Node for tests and in the browser unchanged.
- **The simulation has no notion of time or network:** `step(state, finalInputs) → state`. The timeline owns time, prediction and rollback.

**Module map:**

```
src/config.ts          every setting in one place (requirement: "easy to change"); the build hash covers it
src/core/sim/          math (binary angles, dsin/dcos), physics, ring, rules, state codec, hash   [exact-ops lint]
src/core/timeline/     input buffers, prediction, finalisation, rollback, votes, resync, merge rule
src/core/protocol/     message codecs (§9)
src/core/round-id.ts   generate, format, normalise, derive (from amorfus src/net/secret.ts)
src/core/ledger/       ante, credit, settlement, witness records, retention
src/net/               Transport interface; loopback with latency, jitter, loss and partitions;
                       trystero.ts (the only Trystero import); forwarding; peer gossip
src/storage/           profile, saved rounds, witness records, tab lock
src/render/            canvas renderer, interpolation, palette
src/ui/                screens, buttons, keyboard and touch input
src/main.ts            wiring
dev/tuning.html        dev-only tuning page, served by `npm run dev`, never in dist/
third-party.json       relays and STUN: drives the runtime, the dist audit and §18
e2e/                   Playwright specs; local Nostr relay (from amorfus)
scripts/               audit-dist, emit-goldens (guarded)
docs/acceptance.md     devices, networks, scenarios (from M4)
```

Lint and the golden files depend on these paths, so the paths are part of the contract.

---

## 7. Deterministic simulation

### 7.1 State

Everything below is in the canonical state (A.1) and so in the hash. Spectators and the proposer, unless they join as players, are not.

- **Round:** phase (pre-start, countdown, running, frozen), tick, ante, minimum and maximum players, countdown start tick, freeze tick, ring phase.
- **Per planet, in planet-number order:** player ID, name, join tick, Ready-until tick, last tick with an input, points, angle, rotation rate, position and velocity (four float64).

### 7.2 One tick, in order

1. **Events:** apply the final events for this tick: LEAVE, then JOIN sorted by player ID, then READY and UNREADY.
   - Before the countdown, any change to the roster renumbers the planets 1…N in join order, re-forms the ring and resets rotations (D-5).
   - A JOIN is ignored if the round is full, the countdown has started, or the player is already in the roster.
2. **Presence:** record which players have a final input for this tick. Before the countdown, remove players with no input for k ticks (Q-15).
3. **Ready expiry:** before the countdown only.
4. **Countdown start:** before the countdown, if at least the minimum have joined and all of them are ready, the countdown starts at this tick.
5. **Countdown end:** 600 ticks (10 s) later, the phase becomes running and every player's points are set to the ante.
6. **Rotation:** in any phase but frozen, each held rotate button changes the rate by ±2,386,093, clamped to ±71,582,788. Holding both changes nothing. Then angle += rate.
7. **Physics:** 4 substeps (D-4). Thrust acts only while running. The correction acts only before running.
8. **Scoring:** while running, apply the collected contacts. A planet that touched its quarry gains 1, and the quarry loses 1, all together (Q-13). If any player has 0 points, the phase becomes frozen and the freeze tick is set.
9. **Frozen:** no further changes.

### 7.3 Physics details

- **Gravity** (softened at M2): a_i += Gm · (x_j − x_i) / s³, with s² = max(d², (2r)²) + ε². Both planets of a pair are updated in the same pass.
- **Thrust:** a += thrust · (dcos(angle), dsin(angle)).
- **Planet contact:** when |x_j − x_i| < 2r and (v_j − v_i) · n < 0, with n the unit vector from i to j:
  - exchange the normal components of the two velocities;
  - push each planet back by half the overlap along n;
  - record (i, j).
- **Wall contact:** for a wall with outward normal n, when n · x > c − r and n · v > 0:
  - reflect the normal component;
  - scale the velocity by √(1 − loss) (Q-14);
  - move the planet back inside.
- **Order:** pairs i < j by planet index, walls in list order. Arrays only; no `Map` or `Set` iteration in `src/core/sim`.

### 7.4 The ring

- **Radius and speed:** R = inradius − r − margin. The inward pull on one planet is summed directly over the softened pulls of the others, computed with `dir()`: a = Gm·Σ R(1 − cos θ_k)/s_k³. Then v_N = √(a·R). At ε = 0 this is the appendix's √(Gm · S_N / R), and a test checks it. Angular rate ω_N = v_N / R, held as an integer number of binary-angle units per tick.
- **Slots:** planet i (from 0) sits at ring phase + i/N of a turn, counter-clockwise, so each planet trails its quarry.
- **Correction:** D-5, strength c.
- **Default rotation:** facing the quarry, at angle slot + ¼ + 1/(2N) of a turn, turning at ω_N. With N = 2 this points each planet at the other. A lone planet has rate 0.
- **Capacity:** N_max = ⌊π / asin((2r + clearance) / (2R))⌋. It's computed in `src/config.ts`, outside the simulation, and only checks the maximum on the Propose screen. The state carries just the maximum players, so `asin` never reaches the hash.

### 7.5 Configuration checks (unit tests on `src/config.ts`)

- The maximum rotation rate exceeds ω_N at the largest allowed N.
- The ring capacity is at least the cap on maximum players.
- No tunnelling up to the speed bound of D-4.
- Every setting from the Configuration table lives in `src/config.ts`, and nowhere else.

---

## 8. Timeline, networking and consensus

### 8.1 Roles in a room

| Role | Who | Sends inputs | Votes |
|---|---|---|---|
| Keeper | the proposer, before choosing Play or Watch | no | no |
| Player | in the roster | every tick | yes |
| Candidate | sent JOIN, not yet in the roster | every tick | no |
| Spectator | watching | no | no |
| Settler | asking for a missed result (§8.7) | no | no |
| Witness | holds a result, in a `passive` room (§8.7) | no | no |

### 8.2 A round's life

1. **Propose.** The proposer's browser creates the round ID and the genesis state (settings, no planets, tick 0). It starts the timeline and joins the room as keeper. The URL becomes `#join=<round ID>`.
2. **First arrival.** HELLO, then STATE_REQ. The keeper sends the genesis state and its current tick, so now two peers hold the round. The proposer can play (send JOIN), watch, or leave.
3. **Join.** A peer that chose Play syncs, then sends JOIN in its inputs. The final join order sets its planet number.
4. **Ready and countdown:** computed in the state (§7.2).
5. **Running.** Each player's browser pays the ante once the round's start is confirmed.
6. **Freeze.** Once confirmed (D-10), every peer shows the results. Players credit their balances and send SETTLED. Every peer stores a witness record.
7. **Play again:** Q-8.

### 8.3 The per-tick loop (D-7, D-9, D-10)

At each new local tick n:
1. **Sample:** buttons held, or pressed since the last sample, become this player's input for tick n + d, along with any pending event. It is sent as TICK to every peer at once.
2. **Receive** (continuously): store each player's input under its tick. If that tick has already been simulated and the input differs from the prediction, mark it for re-simulation. Inputs for ticks that are already final are dropped.
3. **Finalise** tick f = n − w: missing inputs become "absent". Simulate up to f with final inputs, re-simulating from the oldest changed tick. Keep the state and its hash in a 64-tick history. The next TICK votes (f, hash).
4. **Predict:** simulate f + 1 … n with known and predicted inputs. The renderer draws these.
5. **Tally** tick g = n − w − v (D-9). If the winner differs from my hash, resync:
   - STATE_REQ (g, winning hash) to the lowest-numbered player who voted for it, then to the next after 500 ms.
   - On STATE: check that the state hashes to the winner; replace my state at g; adopt the sender's inputs after g; re-simulate.

Spectators run steps 2–5 without sending. A keeper with no players runs steps 3 and 4.

### 8.4 Spectators and late arrivals

A spectator joining at any time sends STATE_REQ for the newest final tick and replays the inputs that come with it. From then on it receives every player's TICK and follows the vote. "A spectator who joins mid-round sees the same game" is then the same property as P2 in §8.9.

### 8.5 Disconnects, returns, pause and resume

- **During the round:** an absent player's inputs are final as "no buttons", so their planet drifts with its rotation unchanged. Points move as usual.
- **Return mid-round:** the same browser opens the round, from the URL fragment or the Home list (Q-6). HELLO carries its player ID; it takes STATE and sends inputs again. It controls its planet from the first tick at which its inputs are final.
- **Return before the countdown:** after k ticks away the player has been removed, so they join again at the end.
- **Everyone leaves:** each browser saved the newest final state every second and on `pagehide`.
  - The first *player* to come back finds nobody, restores their save, and starts a new timeline from it (D-12), alone if need be.
  - Spectators can't resume a round.
- **Two histories meet:** Q-7.

### 8.6 The mesh

- A full mesh of players and spectators, capped as in Q-3. The cap is enforced in the handshake: REFUSE "spectators full". Players are capped in the state.
- Forwarding for missing pairs (D-14).
- If a peer gets no connection within 20 s, the connection-failure message shows (§11).

### 8.7 Missed results

- **Witness:**
  - After the freeze is confirmed, every peer, spectators included, stores the result record (A.2) and the list of players who haven't acknowledged it.
  - While that list isn't empty, it stays in the round's room with `passive: true`.
  - It answers RESULT_REQ, removes a player on SETTLED, and drops the record when the list is empty or the retention period ends (Q-10).
- **Settler:**
  - While the game is open, for each unsettled round in the ledger (the 10 most recent, Q-10), the browser joins the room as an active peer and sends RESULT_REQ to each peer that connects.
  - The first RESULT that lists this player settles the round. That's one atomic ledger write (D-18), then SETTLED to every connected peer, then leave.
- **Still running:** if HELLO shows a live timeline, the settler doesn't take part. Home offers **Rejoin** (Q-6).
- **Paused:** if nobody answers, Home offers **Resume**.

### 8.8 Room configuration

```ts
joinRoom(
  {
    appId: 'roslambo',
    relayConfig: { urls: [...CURATED_RELAYS, ...settings.relays] },
    rtcConfig: { iceServers: [...STUN_SERVERS, ...settings.turn] },
    maxReceiveBytes: 1024 * 1024,
    passive: role === 'witness',
  },
  roundId,
  { onPeerHandshake: hello, handshakeTimeoutMs: 10_000 },
)
```

- The relays and STUN servers come from `third-party.json`.
- An empty relay list is an error, because Trystero would otherwise fall back to its own relays.

### 8.9 Properties, each tested (§14)

| | Property |
|---|---|
| P1 | The same settings and final inputs give bit-identical states, in Node and in all three engines. |
| P2 | Honest peers that received every input within the late window agree on every final tick. |
| P3 | A peer that disagrees with the majority holds the majority's state again within v ticks plus one round trip. |
| P4 | Peers agree on join order and planet numbers, whatever order their messages arrived in. |
| P5 | A missing pair that has a common neighbour behaves like a full mesh. |
| P6 | Each player's ante is paid once and their result credited at most once, across reloads and repeated RESULTs. |
| P7 | Two timelines in one room end as one, by the Q-7 rule. |

---

## 9. Message protocol

### 9.1 Framing

- **Transport:** every message is one payload of a single Trystero action named `rl`, as a binary `Uint8Array`. The layout is `[u8 type][payload]`.
- **Encoding:** all integers are little-endian.
  - A player ID is its 16 raw UUID bytes.
  - A hash is 8 bytes.
  - A tick is a u32.
  - A string is a u8 byte length followed by UTF-8, at most 32 bytes, decoded strictly. An invalid string invalidates the message.
- **Size:** at most 16,000 bytes per message (D-15).
- **Protocol version:** 1. Peers must match exactly (D-16).

### 9.2 Messages

| Type | Name | Sent by → to | When | Typical size |
|---|---|---|---|---|
| 0x01 | HELLO | everyone ↔ everyone | inside the Trystero handshake | ~60 B |
| 0x02 | REFUSE | refusing peer → joiner | instead of completing the handshake | 2 B |
| 0x10 | TICK | players and candidates → all peers | every tick | 29 B |
| 0x11 | FWD | forwarder → peer lacking the origin | for each TICK of a missing pair | ~46 B |
| 0x12 | PEERS | everyone → all peers | on change and every 5 s | 1 + 16n B |
| 0x13 | AGAIN | presser → old room | Play again pressed (UI hint only) | 1 B |
| 0x20 | STATE_REQ | any → one peer | on arrival, or after losing a vote | 13 B |
| 0x21 | STATE | one peer → requester | reply | 1–3 KB |
| 0x30 | RESULT_REQ | settler → each peer | on connecting | 17 B |
| 0x31 | RESULT | witness or round peer → settler | reply | ≤ 400 B |
| 0x32 | SETTLED | player → all peers | after crediting a result | 17 B |

### 9.3 Layouts

**HELLO (0x01)**

| Offset | Size | Field |
|---|---|---|
| 0 | 1 | type |
| 1 | 2 | protocol version |
| 3 | 8 | build hash (D-16) |
| 11 | 16 | player ID |
| 27 | 1 | role: 1 keeper, 2 player or candidate, 3 spectator, 4 settler, 5 witness |
| 28 | 8 | timeline ID (zero if none) |
| 36 | 1 | timeline kind: 0 none, 1 live, 2 saved |
| 37 | 1 | phase |
| 38 | 4 | newest final tick |
| 42 | 8 | hash at that tick |
| 50 | 1 | holds a result: 0 or 1 |
| 51 | 1 + n | display name |

- Both sides send HELLO and read the other's.
- **Refusal:** if the protocol version, build hash or role allowance fails, send REFUSE and throw, which makes Trystero drop the peer.
- **Two sessions with one player ID:** the second is refused.
- **Two timelines:** apply D-12.

**REFUSE (0x02):** `u8 reason`.

| Reason | Meaning | Shown as |
|---|---|---|
| 1 | protocol version differs | "Reload to get the latest version" |
| 2 | build hash differs | the same |
| 3 | this player ID is already connected | "This round is open in another tab or device" |
| 4 | spectators full | "This round has the most spectators it can take" |

**TICK (0x10)**

| Offset | Size | Field |
|---|---|---|
| 0 | 1 | type |
| 1 | 4 | t: the tick this input is for |
| 5 | 1 | buttons: bit 0 thrust, bit 1 rotate left, bit 2 rotate right; other bits 0 |
| 6 | 4 | vote tick (0xFFFFFFFF: none yet) |
| 10 | 8 | vote hash |
| 18 | 2 | clock phase: the sender's fraction of its current tick × 65,536, at send time |
| 20 | 2 | history mask: bit k set if the sender's input for tick t − 1 − k is included (M0) |
| 22 | 6 | history: 16 × 3 bits, tick t − 1 first (M0) |
| 28 | 1 | event count |
| 29 | … | events |

Events:

| Kind | Name | Payload |
|---|---|---|
| 1 | JOIN | display name |
| 2 | LEAVE | — |
| 3 | READY | — |
| 4 | UNREADY | — (if Q-21 is accepted) |

Rules:
- One TICK per tick per player. A duplicate t is ignored.
- The history fills any of the sender's inputs the receiver doesn't have yet (M0). It carries buttons only. An event is repeated in each of the sender's TICKs until its tick is final, so a joiner can't miss one; M3 fixes that encoding.
- A t that is already final at the receiver is dropped.
- A t more than 2w ahead of the receiver is dropped.
- More than 3 TICKs per tick from one sender for 2 s closes the connection.

**FWD (0x11):** `u8[16] origin player ID`, then a complete TICK message, type byte included. The receiver treats it as the origin's TICK and drops duplicates by (origin, t). FWD is never forwarded again.

**PEERS (0x12):** `u8 n`, then n × `u8[16]` player IDs of peers with an open connection to the sender.

**AGAIN (0x13):** no payload. It tells peers still on the results screen that the next round exists, so their button reads "Join the next round". It isn't needed for correctness under Q-8.

**STATE_REQ (0x20):** `u32 tick` (0xFFFFFFFF for the newest final tick), `u8[8] wanted hash` (all zero for any).

**STATE (0x21)**

| Field | Size |
|---|---|
| type | 1 |
| timeline ID | 8 |
| sender's current tick | 4 |
| clock phase | 2 |
| g: tick of the state | 4 |
| sender's newest final tick f | 4 |
| state length, then state (A.1) | 2 + n |
| tick count m, then m input records for g + 1 … g + m | 2 + … |

- An input record is `u8 count`, then for each input: `u8 roster index` (0xFF means a non-member, followed by `u8[16]` player ID), `u8 buttons`, `u8 event count` and events.
- Records up to f are final; later ones are provisional.
- If the wanted hash doesn't match the sender's state at g, it sends its newest final state instead.

**RESULT_REQ (0x30):** `u8[16] player ID`.

**RESULT (0x31):** the result record (A.2). The settler checks that its own player ID is in it.

**SETTLED (0x32):** `u8[16] player ID`.

### 9.4 Limits and validation

- Every decoder is total: malformed bytes return "invalid", never an exception.
- An invalid message is dropped and counted. 20 invalid messages from one peer closes the connection.
- `maxReceiveBytes` is 1 MiB per room, so Trystero refuses anything larger before buffering it.
- Messages from a peer that hasn't completed HELLO are dropped. Trystero 0.26.0 already drops non-handshake data while a peer is pending.

---

## 10. Persistence

- **Engine:** localStorage (D-18). Keys and shapes are in A.3.
- **Profile:** player ID, display name, balance, and the round ledger.
  - **Ledger entry:** round ID, ante, ante paid, settled, last seen.
  - **Transitions:**
    - none → **joined** when the player's JOIN becomes final;
    - → **ante paid** (balance −= ante) when the start is confirmed;
    - → **settled** (balance += final points) when the freeze is confirmed, or a RESULT arrives.
  - A player who first learns of the start from a RESULT pays and settles in the same write.
- **Saved rounds:** the newest final state and timeline ID of every round the browser is in, every second and on `pagehide`. Deleted once the round is settled and no longer witnessed.
- **Witness records:** A.2 plus the unacknowledged players and an expiry time. At most 20 (Q-10); the oldest goes first.
- **Settings:** extra relays and TURN.
- **One tab:** a Web Lock named `roslambo-game`. A second tab shows "roslambo is open in another tab" with **Use here**, which takes the lock through a `BroadcastChannel` message.
- **Bad data:** an unreadable profile is copied to a backup key before a fresh one is made, so a parsing bug can't silently zero a balance.
- **Not stored:** anything about other players beyond witness records. No analytics.
- **Safari:** C-5.

---

## 11. Screens and input

**Navigation.**
- One in-memory state machine. While you're in a round, the URL fragment is `#join=<round ID>`, so a reload returns you to it. Home clears it.
- No server routes; the History API isn't needed.
- A returning player of a running round skips Join.

| Screen | Contents |
|---|---|
| Home | Balance; display name, editable (Q-22); **Propose a round**; **Join** with a code field; unsettled rounds with **Rejoin** or **Resume** (Q-6); a link to Settings. |
| Propose | Ante (whole number ≥ 1), minimum (≥ 3), maximum (≥ minimum, ≤ the cap). **Create** shows the link (copy, plus `navigator.share` where available) and the code in groups of four, with "Keep this page open until someone joins". After the first arrival: **Play**, **Watch**, **Leave**. |
| Join | **Play** or **Watch**. Shown for a `#join=` link or a typed code. |
| Pre-start | The arena with the orbiting ring. The players' numbers, colours, names and Ready status. The **Ready** button and the two rotate buttons for players. The countdown over the arena. |
| Round | The arena, every player's points, and the three buttons below the arena for players. Spectators see no buttons. |
| Results | Final points and balance changes (final − ante) for every player, your new balance, **Play again**, **Home**. |
| Settings | Extra relays (`wss://` URLs, validated); a TURN URL, username and credential; "n of m relays reachable". |
| Messages | Not a secure context; canary failure (D-17); a build mismatch; a failed connection: "Couldn't connect to the other players. One of your networks may be blocking direct connections; try another network, or add a TURN server in Settings"; a full round. |

**Input.**
- **Keyboard:** `keydown` and `keyup` on `KeyW`, `KeyA`, `KeyD` (Q-18). Repeats are ignored, and every key is released when the window loses focus.
- **On-screen buttons:**
  - each button tracks its own set of `pointerId`s through `pointerdown`, `pointerup` and `pointercancel`, so multi-touch holds work;
  - `touch-action: none`, no text selection and no long-press menu.
- **Short taps:** a press shorter than one tick still counts, because it's latched until the next sample.

**Layout.**
- Phone upright: the square arena fills the width, with left, thrust and right below it.
- Desktop: the arena is centered, with the buttons below.
- Phone sideways: Q-20.

---

## 12. Rendering

- **Canvas 2D** (D-21), with the canvas backing size = CSS size × min(devicePixelRatio, 2).
- **Each frame:**
  - the walls;
  - each planet: a filled circle in its colour, its number, and a notch showing its orientation;
  - your planet outlined;
  - your hunter and quarry highlighted, in colours chosen at M4.
- **Interpolation:** the frame draws the predicted state one tick behind the newest, interpolated by the fraction of the current tick. Angles interpolate along the shorter way round.
- **Corrections:** after a rollback or resync, planets are drawn where the new state puts them, with no smoothing in the MVP. M4 checks whether jumps are visible at the M0 values of d and w.
- **Points and lists** are DOM, updated from final ticks.
- **Colours:** a fixed palette of 12, distinct in light and dark surroundings and checked for common colour blindness. Numbers are always drawn.
- **Budget (estimate):** under 2 ms per frame on the reference phone. M4 measures it.
- **Render-only maths** may use `Math.sin` and the rest; lint applies the exact-ops rule only to `src/core/sim`.

---

## 13. Build tooling and hosting

**npm scripts:**

| Script | Does |
|---|---|
| `dev` | Vite dev server, including `dev/tuning.html` |
| `lint` | ESLint, including the determinism and boundary rules |
| `typecheck` | `tsc --noEmit` |
| `test` | vitest |
| `build` | `typecheck && vite build && node scripts/licenses.mjs && node scripts/audit-dist.mjs` |
| `e2e` | Playwright: Chromium, Firefox and WebKit, against the local relay |
| `public-scan` | tracked files contain no home paths or key material (the repo is public) |
| `check` | `lint && public-scan && typecheck && test && build && e2e`: the gate |
| `deploy` | `check && wrangler deploy` (first run: your go-ahead) |
| `emit-goldens` | rewrites the golden hashes; refuses unless `ROSLAMBO_EMIT_GOLDENS=1` |

**Lint rules:**
- The exact-ops allowlist in `src/core/sim/**` (D-1), with a fixture file that must fail.
- No DOM, timers or globals in `src/core/**`.
- Only `src/net/trystero.ts` imports Trystero.
- Only `src/storage/**` touches localStorage.

**Vite:** `base: './'`; `build.target: 'es2022'`; `sourcemap: false`; `dev/` excluded from the build.

**Dist audit:**
- Every external host in the built JavaScript and HTML is listed in `third-party.json`.
- No source maps, no `.md` files, nothing matching a secret pattern.
- A self-test with planted failures.

**wrangler.jsonc:** assets only, `./dist`, `observability.enabled: false`, the domain once Q-9 is answered (A.7).

**CI:** GitHub Actions on push and pull request: `npm ci`, `npx playwright install --with-deps`, `npm run check`. No secrets in CI. This needs Actions enabled on `reindoer/roslambo`.

**README:** how to run, build and deploy; secure context (https or localhost); supported browsers; the privacy notes of §18; known limits (C-1, C-5).

---

## 14. Tests and the gate

**The gate:** `npm run check`. It must pass at the end of every milestone from M1, and before any deploy. It is never weakened to make a build pass.

**Simulation (vitest, fast-check)**
- Ring speed matches the appendix table for N = 1…12.
- With correction, the ring stays within 1% of round for 10 minutes for every N up to the cap. Without correction, it breaks up as the appendix says.
- Each planet bounce conserves the pair's kinetic energy, to rounding, over 10⁵ bounces.
- A wall bounce removes the configured fraction of energy.
- One contact, one point: a bound pair scores once per bounce, not once per tick.
- No tunnelling up to 5 arena widths per second.
- Rotation: 0.5 s from rest to the maximum; clamped; conserved without input; unchanged by bounces.
- Thrust acts only while running, in the planet's direction.
- The default rotation faces the quarry; a lone planet doesn't rotate; every rotation resets on a join or leave.
- Renumbering after a leave; a rejoin goes to the end.
- Ready expiry; countdown start and end; joins refused when full or after the countdown starts.
- Scoring: around the cycle, including N's quarry being 1; no points between non-neighbours (1 and 3 of 4); zero-sum as a property; the freeze; simultaneous changes (Q-13).
- The same events in any arrival order give the same state (P4).

**Determinism**
- Golden hashes at checkpoints for about 12 scripted runs: N = 1…12, collisions, walls, joins, leaves, long rounds.
- Checked in Node (vitest), and in Chromium, Firefox and WebKit through `e2e/determinism.spec.ts`, which loads the production bundle's `#test=determinism` page.
- The canary (D-17) is one of these runs.
- A run that changes a golden fails until `emit-goldens` is run deliberately.

**Timeline and consensus (vitest, simulated network)**
- 2–12 peers over the loopback transport, with:
  - latency of 10–300 ms;
  - jitter;
  - loss, which the reliable channel turns into delay;
  - reordering between pairs;
  - partitions;
  - clock offset and drift.
- **Assertions:**
  - honest peers end with identical final hashes (P2);
  - an injected corruption is outvoted and repaired in time (P3);
  - an input later than the late window causes a minority resync, not a split;
  - a disconnected player drifts identically everywhere;
  - join order agrees (P4);
  - a blocked pair with forwarding behaves like a full mesh (P5);
  - two timelines merge (P7);
  - a Play again race gives one round.

**Protocol:** every message round-trips; fuzzing never makes a decoder throw; size limits hold.

**Round ID:** amorfus's tests, ported, plus derivation (Q-8).

**Ledger and witnesses:**
- The ante is paid once and a result credited once, across repeated RESULTs and simulated tab closes between writes (P6).
- Retention and caps.
- A witness drops a record once everyone has acknowledged.

**Storage:** the schema, migration, recovery from bad data, the tab lock.

**Rendering (vitest):** interpolation maths, palette distinctness, layout maths.

**End to end (Playwright, local Nostr relay on 127.0.0.1, no public hosts)**
- Three peers, one per engine (if C-18 allows), join by link and by typed code, mark Ready, play scripted inputs to the freeze, and all show the same results and updated balances.
- A spectator joining mid-round sees the same state.
- A reload mid-round takes the planet back.
- A reload after the end collects the result from a witness.
- Everyone leaves; one player resumes alone.
- A build mismatch is refused with its message.
- **Everywhere:** no request to a host outside `third-party.json`, and no console errors.

**Outside the gate** (logged in `docs/acceptance.md`):
- the 12-peer load run;
- the Q-1 frame-time runs;
- the Q-2 network matrix;
- the determinism page on real Safari (macOS and iOS).

---

## 15. Milestones

- **Order:** each milestone retires the riskiest remaining unknown. No calendar estimates; they would be guesses.
- **Gate:** from M1, every milestone ends with `npm run check` green.
- **External actions** (deploy, DNS) wait for your go-ahead.

**M0 — Lockstep spike (throwaway)**
- *Prerequisites:*
  - Node 22 or later on the dev machine.
  - Playwright's three browsers, with their system libraries.
- *Build,* in `research/lockstep/` (D-26):
  - the candidate numerics (D-1, D-2);
  - a minimal simulation: gravity, planet and wall bounces, thrust, conserved rotation. No ring, no scoring, no UI beyond a canvas and a log;
  - scripted inputs: each player's buttons come from a PRNG seeded by its player ID (`Math.imul`-based). Dev-only, not a bot feature;
  - rollback lockstep (D-7), votes and resync (D-9, D-10), clock balancing (D-11). d, w, v, the tick rate and the substeps are URL parameters;
  - Trystero 0.26.0 over actions, plus the optional unordered channel (D-13);
  - faults: corrupt one peer's state at a chosen tick; add send latency; stop sending; rejoin;
  - telemetry as JSON.
- *Runs:*
  1. **Engine goldens:** Node, Chromium, Firefox and WebKit run the same scripted 100,000-tick simulation offline and compare hashes every 1,000 ticks.
  2. **Automated mesh:** Playwright, one page per engine, the local Nostr relay on 127.0.0.1, 10 minutes, with faults.
  3. **Manual mesh:** over the public relays, on three machines including a phone, in Chrome, Firefox and Safari, 10 minutes per configuration. *Deferred by the owner on 2026-10-24.* Until it runs, the report marks real-network lateness, NAT traversal and phone CPU as unmeasured. Run 2 is repeated against the public relays from one machine, which exercises signaling but not NAT traversal.
  4. **Load:** 12 pages (8 players, 4 spectators) on one machine with the local relay.
  5. **Flood:** oversized and unregistered messages against unpatched 0.26.0, with memory watched.
- *Questions answered,* each with a number in `research/lockstep/REPORT.md`:
  - determinism, pass or fail per engine;
  - the share of final ticks on which honest peers agree;
  - the time to outvote and repair a corrupted peer;
  - late inputs against d and w on real networks;
  - clock drift with balancing;
  - reliable actions against the unordered channel;
  - CPU per tick on the phone with 3 and 12 peers;
  - join and mesh-formation times;
  - whether Playwright's WebKit on Linux has working WebRTC (C-18);
  - whether 0.26.0's limits hold without amorfus's patch.
- *Stop rule:* if any engine mismatches in run 1, stop and revisit D-1 before M1.
- *Exit:* the report is committed. D-1, D-3, D-7, D-9, D-11 and D-13 are confirmed or amended in this plan, and each amendment says which measurement caused it.

**M1 — Skeleton and gate**
- *Build:*
  - Vite, TypeScript, ESLint, vitest and Playwright (three engines), with the lint rules of §13;
  - `src/config.ts` with every setting and the §7.5 checks;
  - the round-ID module, ported from amorfus;
  - `third-party.json`; the dist audit; `wrangler.jsonc` without a domain;
  - the local Nostr relay, ported from amorfus;
  - CI; README skeleton; `.nvmrc`. No LICENSE (Q-19).
  - Added at build time, because the repo is public: amorfus's `public-scan` in the gate, a repo `CLAUDE.md`, and a CI job that runs the unit suite on arm64, so the M2 goldens are checked on a second architecture (D-1).
  - `.npmrc` sets `legacy-peer-deps`: npm 10's resolver crashes on this dependency graph, as it did for amorfus. `npm ci` is unaffected.
- *Exit:* `npm install && npm run build` emits `dist/`; `npm run check` is green locally and in CI.

**M2 — Simulation core and tuning**
- *Build:*
  - `src/core/sim` in full (§7), the state codec and hash;
  - the goldens and the cross-engine determinism test;
  - the canary;
  - `dev/tuning.html`: the real simulation with a simple canvas, sliders for every Q-12 setting, scripted planets and one keyboard planet.
- *Exit:*
  - every simulation test and golden is green in Node and all three engines;
  - the Q-12 values are chosen on the tuning page, including how C-16 plays, and recorded in REQUIREMENTS.md's Configuration table.

**M3 — Timeline, networking and consensus**
- *Build:*
  - `src/core/timeline` and `src/core/protocol` (§8, §9);
  - `src/net`: the loopback transport with faults, the Trystero transport, forwarding and PEERS;
  - the HELLO handshake and build hash;
  - spectators; the keeper hand-off; timeline merging (Q-7);
  - the network simulator tests;
  - an end-to-end test of a scripted round to the freeze over the local relay.
- *Exit:*
  - P1–P5 and P7 are green;
  - the end-to-end test is green;
  - the 12-peer load run is within budget and logged, which decides whether Q-3's cap can rise.

**M4 — Rendering, input and screens**
- *Prerequisite:* Q-1's devices named.
- *Build:*
  - the renderer (§12); keyboard and multi-touch input;
  - every screen and message (§11), with the phone and desktop layouts;
  - Play again (Q-8);
  - `docs/acceptance.md`.
- *Exit:*
  - a full round is playable by link and by code over the local relay;
  - the Q-1 frame-time criteria pass on the reference devices;
  - multi-touch holds work on the phone.

**M5 — Persistence, disconnects and missed results**
- *Build:*
  - start with a probe of `passive` rooms: wake-up time, and one active room plus several passive ones in one tab;
  - the profile and ledger; the tab lock; saved rounds; pause and resume;
  - returning players; witnesses and settlers (§8.7) with the Q-10 caps;
  - the Home list (Q-6); Settings (relays, TURN, relay health).
- *Exit:*
  - P6 is green;
  - the end-to-end tests are green: reload mid-round, reload after the end, everyone leaves and one resumes, two histories (Q-7).

**M6 — Acceptance and release**
- *Prerequisites:* Q-2's machines and people booked; Q-9's domain.
- *Build:* the README in full; the acceptance runs, including the manual runs deferred from M0.
- *Release:*
  - `npm run check`;
  - deploy, with your go-ahead;
  - the Q-2 network matrix on the deployed site;
  - the determinism page on real Safari (macOS and iOS).
- *Exit:* every line of REQUIREMENTS.md, as amended (§2), passes on its named conditions.

---

## 16. Notes for the plan: where each is handled

| Note | Handled by |
|---|---|
| Determinism | D-1, D-2, D-3; the exact-ops lint; goldens in Node and three engines; the canary (D-17); M0 run 1 |
| Shared timeline | Roster events on the timeline (D-8); tick clock (D-11); merging (D-12, Q-7); Play again (Q-8) |
| Inputs in time | Input delay plus the late window (D-7). A silent player's input is final as "no buttons", so they drift |
| One contact, one point | D-4: only planets moving toward each other score |
| Traffic | Hash votes (D-9); full state only on request (D-10); Q-4 |
| Full mesh | Forwarding (D-14); the cap (Q-3); C-1 |
| Trystero version | 0.26.0 unpatched (D-13), confirmed by M0's flood run |
| Player ID | A separate persistent ID in HELLO (D-20) |

---

## 17. Traceability

| Requirement | Where | Verified by |
|---|---|---|
| Planets: same mass and size, orientation, number, colour, names | §7, §11, §12 | M2 tests; M4 |
| Own hunter and quarry highlighted | §12 | M4 |
| Arena not tied to the square | D-6 | ring radius test with a non-square polygon |
| W, A, D; conserved rotation; maximum rate; thrust direction | D-2, §7.2, §11 | rotation and thrust tests |
| On-screen buttons; held together; multi-touch | §11 | M4 on the phone |
| Gravity at all times; elastic bounces; rotation unchanged by bounces; wall loss | D-4, §7.3 | physics tests |
| Scoring and zero-sum | §7.2 | scoring tests and property |
| Proposing, settings, keeper hand-off | §8.2 | end-to-end tests |
| Joining, numbering, renumbering, refusal | D-8 | rules tests; P4 |
| Spectators any time | §8.4 | end-to-end mid-round spectator |
| Ready, expiry, countdown, rotation-only before 0 | §7.2 | rules tests |
| Pre-start ring, correction, default rotation, capacity | D-5, §7.4 | ring tests; tuning sign-off |
| Freeze, no time limit, results, Play again | §7.2, §8.2, Q-8 | end-to-end tests |
| Screens | §11 | M4 |
| Trystero, relays, STUN, user TURN | D-13, §8.8 | room-config test; dist audit |
| Round ID format, link, code | §6 (`round-id.ts`) | ported tests |
| Same simulation everywhere; majority voting; tie-break; spectators follow | D-7, D-9, D-10 | P1–P3 |
| Disconnects, returns, pause and resume | §8.5 | end-to-end tests; P7 |
| Missed results, witnesses, passive rooms | §8.7, D-19 | ledger tests; end-to-end tests; M5 probe |
| Persistence of ID, name, balance; negative balances | §10 | storage tests |
| JavaScript or TypeScript, static, Workers hosting, no WebGPU | D-24, D-25 | build; wrangler config test |
| Chrome, Edge, Firefox, Safari; mobile | §13, C-7 | three-engine gate; M6 manual |
| 60 fps; 8 players and 4 spectators | Q-1, Q-3 | M3 load run; M4 frame-time runs |
| Readable code; README | §6, §13 | review; README |
| Automated tests of the non-rendering core | §14 | gate |
| Cross-browser determinism test | §14 | `determinism.spec.ts` in three engines |
| No secrets, keys or tracking | D-25, §13 | dist audit; logs off |
| Acceptance lines | §15 M6 | `docs/acceptance.md` |

---

## 18. Third parties

**Runtime.** Contacted only after Propose or Join, except hosting.

| Party | Role | Sees |
|---|---|---|
| relay.damus.io, relay.primal.net, nos.lol, offchain.pub, nostr.bitcoiner.social, yabu.me/v2 | Nostr signaling | IP, Origin, User-Agent, timing, a hashed room topic, a per-load Nostr key and Trystero peer ID, encrypted session-description sizes |
| Relays added in Settings | Nostr signaling | as above |
| stun.cloudflare.com, stun.l.google.com | STUN | IP and port |
| The user's TURN server, if any | relay for blocked pairs | IP, traffic volume |
| Other peers in the round | the game | your IP address, player ID, name and inputs |
| Cloudflare | hosting | HTTP requests, never the `#join=` fragment; logs off |

**Build and test:** the npm registry, Playwright's browser downloads, GitHub Actions.

**Bundled** (MIT): `@trystero-p2p/core` and `@trystero-p2p/nostr`, with `@noble/secp256k1`. The license notices ship in `dist/`.

---

## 19. Deferred past the MVP, and non-goals

**Deferred:**
- simple sound effects;
- signed player IDs (Q-17);
- export and import of identity (unless Q-11 brings it in);
- smoothing of corrected planets;
- the unordered input channel (unless M0 needs it);
- a WebGL renderer;
- raising the mesh cap;
- switching from spectator to player.

**Non-goals,** each of which would reopen a decision above:
- any server-side code or storage;
- a TURN credential service;
- publishing results to Nostr (ruled out in the requirements);
- an authoritative host peer (D-7).

---

## Appendix A — Formats, constants, versions

### A.1 Canonical state (the hash input and the STATE payload)

```
u16  codec version = 1
u8   phase: 0 pre-start, 1 countdown, 2 running, 3 frozen
u32  tick
u32  ante
u8   minimum players
u8   maximum players
u32  countdown start tick   (0xFFFFFFFF: none)
u32  freeze tick            (0xFFFFFFFF: none)
u32  ring phase             (binary angle)
u8   n
n × planet, in planet-number order:
     u8[16]  player ID
     u8+n    display name (UTF-8, ≤ 32 bytes)
     u32     join tick
     u32     ready until    (0: not ready)
     u32     last tick with an input
     i32     points
     u32     angle          (binary angle)
     i32     rotation rate  (binary-angle units per tick)
     f64     x, y, vx, vy
```

- About 100 bytes per planet; about 1.2 KB for 12 planets.
- **Hash:** MurmurHash3 x86-32 with seed 0, then with seed 0x9747B28C, each written big-endian: 8 bytes. Compared as an unsigned big-endian 64-bit number.

### A.2 Result record

```
u8[21]  round ID (ASCII)
u32     ante
u32     freeze tick
u8[8]   final state hash
u8      n
n × { u8[16] player ID, u8+n display name, u32 final points }
```

### A.3 Storage (localStorage)

| Key | Value (JSON) |
|---|---|
| `roslambo.v1.profile` | `{ v: 1, playerId, name, balance, rounds: { [roundId]: { ante, joined, antePaid, settled, seenAt } } }` |
| `roslambo.v1.profile.backup` | the last unreadable profile, verbatim |
| `roslambo.v1.round.<roundId>` | `{ v: 1, timelineId, tick, state: base64(A.1), savedAt }` |
| `roslambo.v1.witness.<roundId>` | `{ v: 1, record: base64(A.2), unacknowledged: [playerId], expiresAt }` |
| `roslambo.v1.settings` | `{ v: 1, relays: [url], turn: [{ urls, username, credential }] }` |

### A.4 Implementation constants (*provisional*; M0 confirms)

| Constant | Value |
|---|---|
| Tick rate | 60 per second |
| Physics substeps | 4 per tick |
| Input delay d | 2 ticks |
| Late window w | 12 ticks |
| Vote window v | 12 ticks |
| Absence before removal k | 180 ticks (Q-15) |
| State history | 64 ticks |
| Clock correction | 0.5% per tick of offset, at most 2%, 1-tick deadband (M0) |
| Clock settle time | 2 s before a player's offset counts (M0) |
| Joiner warm-up | at most 500 ms (M0) |
| Input history per TICK | 16 ticks (M0) |
| PEERS interval | 5 s |
| Handshake timeout | 10 s |
| Connection-failure message | after 20 s |
| Largest message | 16,000 bytes |
| `maxReceiveBytes` | 1 MiB |
| Mesh cap | 8 players, 4 spectators (Q-3) |
| Display name | 20 characters, 32 bytes (Q-22) |
| Witnessed rounds kept, unsettled rounds watched | 20, 10 (Q-10) |

### A.5 Gameplay values (chosen at M2; the starting values in brackets)

| Setting | Value | Derived |
|---|---|---|
| Arena side L | 1 (the unit) | |
| Planet radius r | 0.03 L | |
| Ring margin | 0.03 L | R = 0.44 L |
| 3-planet ring period | 10 s (8 s) | Gm ≈ 0.068 L³/s²; the 8-planet ring turns at 0.20 turn/s |
| Gravity softening ε | 0.25 L (added at M2) | peak pull ≈ 0.42 L/s² |
| Ring clearance | 0.03 L | ring capacity 30 |
| Thrust | 1.4 L/s² (0.6) | escape margin 1.67 |
| Wall energy loss | 0.2 | |
| Correction factor | 1 | |
| Re-arm gap | 1 planet diameter (the owner, 2026-10-24; M2 chose 0.015 L) | |
| Ready expiry | 60 s | |
| Countdown | 10 s | (set in the requirements) |
| Maximum rotation rate | 1 turn/s | (set) |
| Rotation acceleration | 2 turns/s² | (set) |
| Result retention | 30 days | (Q-10) |

### A.6 Toolchain pins (checked on npm, 2026-10-24)

| Tool | Version | Note |
|---|---|---|
| Node | ≥ 22.12 (`.nvmrc` 22) | Vite 8's engine range |
| vite | ^8.3 | |
| typescript | ~6.0 | typescript-eslint 8.72 requires < 6.1 |
| eslint / typescript-eslint | ^10 / ^8.72 | |
| vitest | ^4.1 | as amorfus; 5.0.5 is current |
| fast-check | ^4.10 | |
| @playwright/test | 1.64.1 (exact) | Chromium, Firefox, WebKit |
| wrangler | ^4.152 | |
| @trystero-p2p/nostr | 0.26.0 (exact) | no patch (D-13) |
| ws | ^8 | dev only: the local Nostr relay |

### A.7 `wrangler.jsonc`

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "roslambo",
  "compatibility_date": "2026-10-24",
  // Assets only: no "main", so no Worker script ever runs.
  "assets": { "directory": "./dist", "not_found_handling": "none" },
  // Request logs would keep visitor IP addresses (C-21).
  "observability": { "enabled": false }
  // "routes": the domain, once Q-9 is answered
}
```
