# roslambo: Plan

**Status:** approved by the owner on 2026-10-24.
- The owner left the open questions to Claude's judgement for the MVP, so every question is settled at its proposal except four. Q-1, Q-2, Q-9 and Q-19 need facts or choices only the owner has.
- Q-19 was settled on 2026-10-24: no license. The owner keeps all rights.
- Q-1 was settled on 2026-10-24: the owner's Pixel 8a is the reference phone, and there is no laptop.
- Q-23 was settled on 2026-10-28 at its proposal: bots, which the owner asked for, so that one person can play alone. They're built as D-27.
- Manual runs are deferred for now (§15). On 2026-10-24 the owner deferred the phone and network tests again ("too much hassle") and asked to deploy and see what happens. So the first deploy comes before Q-2 and Q-9, to the account's `workers.dev` address (M6 amended). **Deployed 2026-10-24.** The address isn't written here because it carries the account's name, and this repo is public.
- M5 finished on 2026-10-24. The passive-room probe is in [research/passive/REPORT.md](research/passive/REPORT.md). Its amendments are marked "M5".
- M4 finished on 2026-10-24, except its runs on the phone, which wait with the other manual runs. The devices and criteria are in [docs/acceptance.md](docs/acceptance.md). Its amendments are marked "M4".
- M3 finished on 2026-10-24: the load run is in [research/load/REPORT.md](research/load/REPORT.md). Its amendments are marked "M3".
- M2 finished on 2026-10-24, and was revised the same day at the owner's request: Newtonian gravity with a smaller ring, and energy-conserving bounces. The tuning is in [research/tuning/REPORT.md](research/tuning/REPORT.md), §4. Its amendments are marked "M2".
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

**Approval changed these requirements** (exact wording in §2; applied to REQUIREMENTS.md on 2026-10-24, the Q-1 lines at M4; the Q-2 acceptance line waits):
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
| Q-2 (machines, people and networks for the deferred manual runs) | M6 |
| Q-9 (domain) | M6 |

### Group A — needs your answer

| # | Question | Proposal | Needed by |
|---|---|---|---|
| Q-1 | Which reference devices for "60 fps on mid-range hardware"? | You name one phone (model and browser) and one laptop with integrated graphics. A run passes if the frame interval stays at p95 ≤ 18 ms and max ≤ 50 ms through a scripted 2-minute round with 8 planets, at 60 Hz. **Settled 2026-10-24 by the owner:** a Pixel 8a; there is no laptop. **M4:** the Pixel 8a, in Chrome, is the only reference device. The phone is the weaker of the two the requirement named, and a dozen circles on Canvas 2D cost an integrated GPU little, so desktops are checked in development only: the gate's three engines, and the frame-time bench in desktop Chromium. The criteria stand, judged with the display at 60 Hz (docs/acceptance.md). | M4 |
| Q-2 | Which networks and people for the acceptance test, and for M0's manual run? | **Must pass:** three machines on at least two home broadband networks, the phone on Wi-Fi. **Best effort:** the phone on mobile data. Who provides the machines? Is one of them a Mac or an iPhone, so that real Safari is tested? | M6 (was M0, before the manual runs were deferred) |
| Q-3 | Should the number of players be capped by what a full mesh can carry, as well as by the ring (C-2)? | Yes: maximum players ≤ the lesser of the ring limit and 8, and at most 4 spectators, which is exactly the performance requirement. Raised later if M3's load test allows. **M3:** kept at 8 and 4; the load run was desktop-only (research/load/REPORT.md). | M1 |
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
| Q-23 | Bots. The owner, 2026-10-28: "allow players and watchers [to] host several bot players, which will enable easily setup solo play". Bots were out of scope. | **Settled 2026-10-28 at this proposal**, under the MVP delegation; any part can be overridden. Built as D-27, and the requirements say so (§2).<br>• A bot is a player of the round, hosted by a player's or a spectator's browser. Its host adds bots before the countdown, one at a time, up to the round's maximum. A bot joins at the end like anyone, and is always ready, so the people's Ready starts the round. Its host can remove it before the countdown, and leaving takes it out too. While its host is away it drifts, like a disconnected player's planet, and a host that returns takes its bots back.<br>• **A round with a bot in it is practice:** nobody pays the ante or is credited. Otherwise a player could farm points from bots it controls, and the balance would stop measuring play against people. Alternatives: credit the people as usual and let the bots' points vanish; or credit each bot's change to its host, which keeps balances zero-sum but makes a spectator's balance move.<br>• **One vote per browser that controls a planet:** a player's, or a spectator's that hosts bots. Never one per bot, so a host with bots can't outvote the players. A spectator who hosts bots does vote: its bots' inputs are its own, and without its vote a round of bots that others watch would have no voter to repair them.<br>• **The proposer can watch at once,** to host a round of bots. Until now Watch waited for someone to arrive. |

---

## 2. Requirement changes your answers would make

REQUIREMENTS.md is yours. These edits went in on 2026-10-24, in one commit that cites the Q-numbers, except three rows that waited: Q-12 (the values, applied at M2), Q-1 (applied at M4) and Q-2 (the networks, still waiting). The Q-23 rows went in on 2026-10-28, with the bots.

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
| Acceptance: "60 fps on the reference devices (**TBD**)" | "… on the devices and by the frame-time criteria in `docs/acceptance.md`". **Applied at M4** as "60 fps on the reference phone, a Pixel 8a in Chrome, by the frame-time criteria in `docs/acceptance.md`". Performance, "a mid-range phone, and a recent laptop with integrated graphics", now names the Pixel 8a and says there is no laptop to test on | Q-1 |
| Configuration table | The values you sign off at M2 | Q-12 |
| *Terms* | Add "**Bot**: a computer-controlled player, hosted by a player's or a spectator's browser" | Q-23 |
| Proposing: "The proposer can play at once, or watch once someone has joined, or leave" | "The proposer can play or watch at once, or leave" | Q-23 |
| *Joining* | Add: players and spectators can add bots before the countdown, up to the maximum; a bot joins at the end, is always ready, and leaves when its host removes it or leaves before the countdown | Q-23 |
| End of round: "Each player's final points are credited to their balance" | Add: "A round with a bot in it is practice: nobody pays the ante, and nobody's final points are credited" | Q-23 |
| Consensus: "the state held by the **majority** of players wins"; "Only players vote. Spectators follow the majority state" | "… the **majority** wins"; "Only browsers that control a planet vote, one vote each however many planets they control: a player's, or a spectator's that hosts bots. Other spectators follow the majority state" | Q-23 |
| *Disconnects* | Add: "A bot's planet drifts while its host is away, like a disconnected player's. A host that comes back takes its bots back" | Q-23 |
| Screens: Pre-start and Results | Add **Add a bot** and **Remove a bot**, for players and spectators; a note on Results when bots made the round practice | Q-23 |
| Out of scope: "Bots or computer-controlled planets" | Removed | Q-23 |

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
- **Settled at M4:** the Pixel 8a, the frame-time bench, and the Q-1 criteria (docs/acceptance.md). The laptop half of the requirement has no device, so it is checked in development only.

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
  - Gravity stays Newtonian, made weak by a smaller ring (radius 0.18 at a 10 s period, so Gm ≈ 0.004). Thrust stays at 0.6, and a quarry stopped dead against its hunter works free by thrusting prograde, in a median 8 s. Softening was tried first and dropped at the owner's request (research/tuning/REPORT.md §4).
  - Bounces now conserve energy (D-4). Stopping overlapping planets at touching had leaked energy at every bounce, which drove much of the clustering.
  - a pair scores once per contact episode, re-arming once the surfaces are a full planet diameter apart (the owner's change on 2026-10-24; M2 had used a quarter diameter).

  The rules are in REQUIREMENTS.md. |
| C-17 | `W`, `A`, `D` are awkward on AZERTY and other layouts. | Q-18 |
| C-18 | It's unknown whether Playwright's WebKit on Linux has working WebRTC. | **Settled by M0:** it does, with Trystero's mDNS-to-loopback test option (REPORT §2). |
| C-19 | With two voters, any disagreement is a tie, and the smallest hash wins whether right or wrong. This happens before the countdown, and when only 2 of a round's players are connected. | Accepted. Honest peers rarely disagree (D-7). |
| C-20 | Browsers throttle timers in background tabs, and iOS suspends them. | A hidden player stops sending, so their planet drifts, as for a disconnect. On return the browser resyncs (D-23). Before the countdown, 3 s away removes them (Q-15). *Amended 2026-10-25:* a hidden page keeps sending as its throttled timers allow, so only a frozen page counts as disconnected (D-23). |
| C-21 | "No tracking" vs what P2P exposes: peers see each other's IP addresses; relays and STUN servers see IP addresses and timing; Cloudflare can keep request logs. | Logs off (D-25). §18 lists what each party sees. No analytics. |
| C-22 | **Found at the first deploy (2026-10-24): three of the six curated relays refuse roslambo.** nostr.bitcoiner.social and offchain.pub accept only keys in their "web of trust". Trystero signs with a new random key on every page load, so they always refuse. relay.damus.io answered "banned: too many rate-limit violations", probably for this machine's test traffic, and probably for a while only. Signalling works through the other three: relay.primal.net, nos.lol and yabu.me/v2. | **Settled 2026-10-24 by the owner ("make the swap"):** relay.snort.social replaces offchain.pub, and nostr-pub.wellorder.net replaces nostr.bitcoiner.social, in `third-party.json` and REQUIREMENTS.md. Each played a three-engine round to the freeze with no other relay; nostr.bitcoiner.social, tried the same way, never connected anyone (research/relays/REPORT.md). damus stays, to check again later. yabu.me/v2 answered 2 of 3 probes, so it is watched too. |

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
  - Continuous collision detection: more code, and substeps suffice. A test asserts no tunnelling up to 5 arena widths per second. *Reversed at M2*: exact contact times turned out to be needed to conserve energy.
  - An iterative impulse solver: equal-mass circles don't need one.
  - Velocity Verlet: fine too, but Euler is simpler when contacts change velocities mid-step.
- **Cost if wrong:** feel and energy drift. The tuning page shows it, and the integrator is one module.
- **M2, amended** (C-16; research/tuning/REPORT.md §4):
  - **The integrator is velocity Verlet, and each substep is split at the predicted moment of the next contact.** The contact time comes from the second-order expansion of each distance, a stable quadratic using only exact operations, and the bounce happens exactly then.
    - Measured: semi-implicit Euler that stops overlapping planets at touching leaks energy at every bounce, until an isolated pair rests in contact. Mirroring the overlap gains energy instead.
    - The split integrator keeps an isolated pair bouncing a full diameter high for 10 minutes, with energy within 0.1%, and a gate test checks it.
    - Planets resting together would bounce infinitely often, so a per-substep event cap ends the substep, and overlaps are settled the old way.
  - Gravity stays Newtonian. A softening setting ε exists for the tuning page and is 0.
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
- **M2, amended:** the ring's speed comes from a direct sum of the pulls on one planet, using exact operations. A test checks it against the appendix formula at ε = 0. Gm is set from the 3-planet ring period.

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
- **M3:** a tally counts only the votes of players in this peer's own roster at tick g, so a candidate or a spectator can't vote.
- **Q-23:** it also counts the vote of a browser whose bot is in that roster, once however many bots it has (D-27).
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
- **M4, implemented:** the timeline records the newest tick whose tally agreed with it, or had no other votes (`agreedTo`). A tick counts as confirmed once that has reached it and no repair is under way. The ante is paid when the start tick is confirmed, and the freeze is credited when the freeze tick is (`src/net/network.test.ts`: never at the moment of the freeze, on every peer soon after).

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
- **Amended 2026-10-25** (the owner's three overlapping windows; `e2e/windows.spec.ts`): a page whose timers sleep, hidden behind another window, has a stale tick count. Three things went wrong because of it:
  - **A STATE carried the stale tick.** A joiner who took the round from such a page started up to a second behind. Everyone's inputs then looked too early or too late, and a window dropped a player as disconnected. In that window the planets were renumbered, so "your quarry" marked a different planet from the other windows. STATE now carries the sender's clock.
  - **Its bursts dragged the clock.** Waking, it sends several TICKs at once, and all but the newest carry a phase at its cap. Others read those as a clock a few ticks behind, and slowed everyone by about 0.7%. A TICK whose phase is at the cap no longer counts as a clock sample.
  - **It dropped inputs and split peers.** While asleep, it dropped others' inputs as "more than 2w ahead" of its stale tick. On waking, it sent inputs for ticks near the end of the others' late window, in time for some and not for others. Now "ahead" is measured against the clock, and after a stall only the newest 3 ticks' inputs are sent.
  - Tests: `src/net/network.test.ts` (a throttled page, and a throttled proposer whose round others join, with no jumps, late inputs or resyncs) and `e2e/windows.spec.ts` (three engines, two windows always behind, five runs in a row clean). Without the STATE fix the browser run failed one time in three.
  - Counting votes from players this peer had removed itself was tried and dropped: in 30 seeded runs the M3 rule repaired such a peer every time.

**D-12 — Timeline identity and merging.**
- **Choice:**
  - Each timeline has an ID: a hash of the round ID, the proposer's player ID and its start time. A resumed round gets a new ID, derived from its saved state.
  - HELLO says which timeline a peer holds. When two meet in one room, both sides apply the same rule: Q-7, and for two empty timelines from a Play again race, the older one.
  - The losing peer drops its timeline and takes the winner's STATE. Its player re-sends JOIN if the winner hasn't reached the countdown yet.
- **Rejected:** asking the user to choose, because peers could choose differently.
- **Cost if wrong:** a history is lost in a rare case. Q-7 decides which one.
- **M3:** both sides compare the same pair of HELLOs, the one each sent and the one it received, so they always agree on the winner (`beats` in `src/core/session/session.ts`; test P7).
- **M5:**
  - A resumed timeline's ID is a hash of the save's hash *and the player who resumes it*. Two players who resume the same save apart, unable to reach each other, get two IDs, so the merge rule applies when they meet. With one ID, they would look like one timeline that disagrees.
  - A browser returning with a save says so in HELLO (timeline kind "saved", its tick and hash). So a returning player meets other savers, and live rounds, under the same rule: a live round wins; between saves the later tick wins.

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
- **M5:** **Use here** takes the lock with the Web Locks API's `steal` option, and the other tab learns from its own lock request, which fails. No `BroadcastChannel` is needed. `steal` is in every engine the gate runs.

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
  - Planets, numbers, orientation marks and hunter and quarry highlights, drawn every animation frame and interpolated between the two newest ticks. Since 2026-10-26 also thrust flames and, if the player chooses, names (§12).
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
- **M4, implemented:** back after more than 2 s, the session drops its timeline and takes a peer's, as a reload would (`Session.rejoin`). With no peer it keeps its own, so a lone proposer's round survives. Before the countdown, a player hidden for 3 s or more has been removed (Q-15) and joins again at the end.
- **Amended 2026-10-25, after the owner's report:** with three browsers on one machine, the planets were sometimes numbered and tagged differently from what each player expected.
  - The cause was this decision. A covered or minimised window is "hidden" too, so it stopped sending. Before the countdown it was removed after 3 s and rejoined at the end, which renumbered everyone. Moving a player to the end can even reverse the cycle, turning hunters into quarries.
  - **Now a hidden page keeps sending**, as often as its throttled timers allow, with its keys released, so its planet drifts. Since M5 a page that stalls sends inputs only for ticks still inside the late window, so these land in time. It keeps its planet, its number and its Ready, as a connected player should (REQUIREMENTS removes only players who leave or disconnect).
  - **Only a page whose timers stopped** for more than 2 s rejoins from a peer when shown: frozen, or an app in the background. Such a page was disconnected: before the countdown it has been removed, and joins again at the end.
  - Tests: `src/net/network.test.ts` (a page throttled to one timer a second keeps its place and Ready; a frozen one is removed and rejoins) and `e2e/persist.spec.ts` (two join orders, with every page numbering and tagging the planets alike, and a covered window keeping its place).

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

### Bots

**D-27 — Bots ride in their host's TICK (Q-23, 2026-10-28).**
- **Choice:**
  - A bot is an ordinary member of the roster, so the simulation, the state codec and the goldens don't change.
  - Its player ID is derived from its host's and its slot, as a UUID of version 8, RFC 9562's custom version. A browser's own ID is version 4 (D-20), so every peer tells a bot by its ID alone, and a host finds its bots again after a reload without storing anything.
  - Its inputs ride in its host's TICK, after the host's own (§9.3). That is one message per tick however many bots, so the flood rule and forwarding (D-14) are unchanged. A spectator who hosts bots sends TICKs without an input of its own.
  - A receiver takes a bot's inputs only from the host its ID derives from.
  - A host votes once while it controls a planet in the roster, its player's or a bot's; a tally counts it once (D-9).
  - Bots fly the steering bot that M2's tuning measured: chase the quarry, veer from a close hunter. Each has its own temper, read from its ID. It runs only on the host, so it may use any maths.
- **Rejected:**
  - Bots inside the simulation, flown by every peer from the state. A bot would then never drift when its host left. But its steering would need exact operations (no `atan2`), every rollback would run it again on every peer, and the state, the codec and the goldens would change.
  - A separate message for bots' inputs: a second message per host per tick, with its own flood counter and its own kind of FWD, for the same bytes.
  - A vote per bot: a host with bots would outvote the players.
  - A bot flag in the state: a codec change, and new goldens, for what the ID already says.
- **Cost if wrong:** if bots drifting while their host is away proves a nuisance, another peer can take over the host's bots, whose IDs it can derive. Or the bots move into the simulation.

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
src/core/names.ts      display-name limits (Q-22)
src/core/bot/          bots (Q-23, D-27): IDs derived from the host's, and the steering bot
src/net/               Transport interface; loopback with latency, jitter, loss and partitions;
                       trystero.ts (the only Trystero import); forwarding; peer gossip
src/storage/           profile, saved rounds, witness records, tab lock
src/render/            canvas renderer, interpolation, palette
src/ui/                screens, buttons, keyboard and touch input; game.ts, one round's controller
src/bench/             the frame-time bench's virtual players (M4, Q-1)
src/main.ts            wiring; the #test= pages (determinism, net, frames)
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

- **Gravity:** Newtonian. a_i += Gm · (x_j − x_i) / d³, with d = max(|x_j − x_i|, 2r). Both planets of a pair are updated in the same pass. A softening term ε² can be added to d², but it is 0 (M2).
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
- The maximum rotation rate is at least the orbital rate of two planets almost touching, √(2Gm/(2r)³), so a planet circling another can keep thrusting sideways (the owner's rule, 2026-10-24; 0.97 turn/s at the M2 values).
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

*Q-23:* a player or a spectator may also host bots. It sends their inputs in its own TICKs every tick, and votes once while it controls a planet in the roster, its own or a bot's (D-27).

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

Spectators run steps 2–5 without sending, unless they host bots (Q-23): then step 1 sends their bots' inputs. A keeper with no players runs steps 3 and 4.

**Fixed at the first deploy: a lost Ready, so the round never started.**
- An end-to-end run failed once this way, and so did the first three-engine round on the live site, over the public relays. That round's trace (2026-10-24) found the cause:
  - The Ready button was enabled while the page was still connecting, before the player had a planet. A press then had nothing to apply to.
  - Now it reads "Joining…" and stays disabled until the planet is in the round, and `Session.ready` ignores a press without one. `play.spec.ts` checks it.
  - With that fixed, the same live round played to the freeze in 26 s, in all three engines, with no late inputs and no resyncs.
- A second way was found and fixed in simulation:
  - An event (JOIN, READY, UNREADY, LEAVE) rides in its sender's TICKs until its tick is final *at the sender*. If those TICKs reach the others after the tick is final for them, the event is lost there, and the vote then undoes it at the sender too.
  - JOIN was already sent again until the player is in the roster. READY and its cancel now are too, until the state shows them (`Session.keepReady`).
  - The wish ends only for the round's own reasons: the Ready's expiry, or a new join after the player was removed (Q-15). Votes can't say an event landed: with the others' votes late, a peer's own vote agrees with itself.
  - LEAVE needs nothing: an absent player is removed after 3 s anyway.
  - `src/net/resume-results.test.ts` reproduces it with one player's links slow for 0.6 s around its Ready, and checks that a Ready that expires stays expired.

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
- **M5, as built:**
  - A returning player waits 6 s for a live round, then resumes from its save, unless a better save is connected: that save's player resumes instead.
  - A player who loses to a live round or a better save drops its own, and joins the winner once that is live: its HELLO said so, or it sends TICKs.
  - Leaving before the countdown takes the planet away, so the browser forgets the round: no save, no ledger entry.

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
- **M5, as built** (the probe: research/passive/REPORT.md):
  - An idle passive room costs the relays nothing. Trystero puts every room's topics into one subscription per relay. A passive peer woke in about 300 ms on a local relay.
  - A settler shows a round as paused after 20 s without an answer. It leaves a running round at once and looks again a minute later.
  - A settler skips a round this browser witnessed, because it settled at the confirmed freeze.
  - A RESULT that doesn't name this player means the round ended without it, so a round it never paid for is forgotten.
  - Home's list shows **Open** while a round is still being checked, so a player who knows it's running needn't wait.

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
- **Protocol version:** 2, since TICKs carry bots' inputs (Q-23). Peers must match exactly (D-16).

### 9.2 Messages

| Type | Name | Sent by → to | When | Typical size |
|---|---|---|---|---|
| 0x01 | HELLO | everyone ↔ everyone | inside the Trystero handshake | ~60 B |
| 0x02 | REFUSE | refusing peer → joiner | instead of completing the handshake | 2 B |
| 0x10 | TICK | players, candidates and bots' hosts → all peers | every tick | 30 B, plus 26 B per bot (Q-23) |
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
- **Refusal (M3):** the handshake has two rounds. Both sides send HELLO, then both send a verdict: REFUSE with reason 0 for "accepted", or the reason. A side whose check fails sends its reason and throws, which makes Trystero drop the peer. The other side learns why from the verdict.
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
| 5 | 1 | buttons: bit 0 thrust, bit 1 rotate left, bit 2 rotate right; bit 7 set when the TICK carries no input of the sender's own (a spectator who hosts bots, Q-23), and its buttons, history and events are then 0; other bits 0 |
| 6 | 4 | vote tick (0xFFFFFFFF: none yet) |
| 10 | 8 | vote hash |
| 18 | 2 | clock phase: the sender's fraction of its current tick × 65,536, at send time |
| 20 | 2 | history mask: bit k set if the sender's input for tick t − 1 − k is included (M0) |
| 22 | 6 | history: 16 × 3 bits, tick t − 1 first (M0) |
| 28 | 1 | event count |
| 29 | … | events |
| … | 1 | bot count (Q-23) |
| … | … | per bot: `u8[16]` bot ID, `u8` buttons, `u16` history mask, `u8[6]` history, `u8` event count, events: the fields above, for the same tick t |

Events (M3): each is `u8 back`, `u8 kind`, then its payload. It belongs to the sender's input for tick t − back, so one TICK can carry the sender's events still waiting to be final.

| Kind | Name | Payload |
|---|---|---|
| 1 | JOIN | display name |
| 2 | LEAVE | — |
| 3 | READY | — |
| 4 | UNREADY | — (if Q-21 is accepted) |

Rules:
- One TICK per tick per player. A duplicate t is ignored.
- The history fills any of the sender's inputs the receiver doesn't have yet (M0). It carries buttons only. An event is repeated in each of the sender's TICKs until its tick is final, so a joiner can't miss one.
- A t that is already final at the receiver is dropped.
- A t more than 2w ahead of the receiver is dropped.
- *Q-23:* a bot's entry counts only if the bot's ID derives from the sender's player ID (D-27). The vote and the clock phase are the sender's alone.
- More than 3 TICKs per tick from one sender for 2 s closes the connection. *M5: enforced.* The transport closes that peer's RTCPeerConnection and refuses its Trystero peer ID from then on, so it can't come back without reloading. A timeline that stalled (a throttled timer) sends inputs only for the ticks still inside the late window, so catching up never looks like a flood.

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

**RESULT (0x31):** the result record (A.2). The settler checks that its own player ID is in it. *M5:* final points are an i32. A u32 would wrap if a planet ever ended below 0.

**SETTLED (0x32):** `u8[16] player ID`.

### 9.4 Limits and validation

- Every decoder is total: malformed bytes return "invalid", never an exception.
- An invalid message is dropped and counted. 20 invalid messages from one peer closes the connection (*M5: enforced*, as for the TICK flood).
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
  - *Q-23:* a practice round, one with a bot in the roster when it starts, pays nothing. Its entry is marked `practice` at the confirmed start, and forgotten at the confirmed freeze or when its RESULT arrives. Witnesses don't wait for bots.
- **Saved rounds:** the newest final state and timeline ID of every round the browser is in, every second and on `pagehide`. Deleted once the round is settled and no longer witnessed.
- **Witness records:** A.2 plus the unacknowledged players and an expiry time. At most 20 (Q-10); the oldest goes first.
- **Settings:** extra relays and TURN.
- **One tab:** a Web Lock named `roslambo-game`. A second tab shows "roslambo is open in another tab" with **Use here**, which takes the lock through a `BroadcastChannel` message. *M5:* through the lock's `steal` option instead (D-18).
- *M5, as built:*
  - Only a player in the round's roster saves it; spectators can't resume (§8.5).
  - The save is removed at the confirmed freeze, when the witness record takes over.
  - A failed write (quota, blocked storage) loses that write only: the profile store says so on Home, and the others carry on.
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
| Settings | Extra relays (`wss://` URLs, validated); a TURN URL, username and credential; "n of m relays reachable". *The owner, 2026-10-26:* **Show names under the planets**, off by default (§12). |
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

**M4, as built:**
- Settings and Home's list of unsettled rounds ship with M5, which builds what they show. Home has no Settings link until then, and the connection-failure message mentions Settings ahead of it.
- Before the countdown the middle button is **Ready**. From the countdown it is **Thrust**, dimmed until 0, so a player can already be holding it when the round starts.
- The pre-start screen also offers the link and code ("Invite more players"), so anyone in the round can invite.
- The forms check their own values and say what's wrong, instead of the browser's validation bubbles.
- A player who presses Play after the round filled or started sees "This round is full or has already started, so you're watching it" over the arena.
- The proposer sees **Play** and **Watch** only once someone has arrived, as the requirements say. **Leave** is always there. *Changed 2026-10-25 at the owner's request:* **Play** is there at once; **Watch** still waits for someone, as there is nothing to watch before. The pre-start screen opens its invite panel while the round has fewer than the minimum, so a proposer who played at once can still share the link.
- **Play again** (Q-8) goes to the derived room. If an AGAIN arrived, the next round already exists, so the browser joins it. Otherwise it proposes the round with the same settings. Two proposals at once merge (D-12).
- A returning player of an unsettled round (from the ledger) goes straight back to its planet. Everyone else gets Join.
- *2026-10-25:* a player without a display name is labelled by their player ID ("Player 3F2A"), not by planet number ("Player 2"). Planet numbers follow the join order, so a number-based label belonged to a different browser in each round. Home's name field says what you appear as.

**Q-23, as built (2026-10-28):**
- The proposer's **Watch** is there at once, like **Play**: a spectator can fill the round with bots, so there is something to watch before anyone arrives.
- Before the countdown, players and spectators see **Add a bot** and **Remove a bot**, which takes out their newest bot. A note says how many bots this browser hosts, and that a round with bots is practice.
- A bot is named from its ID, "Bot 3F2A", as a nameless player is. The arena's list shows nothing more; the results tag a bot's row "bot", and say when no balance changed.
- In the narrow column beside the arena, a list row puts its tags and status on a second line, under the name, so they never push the row out of the column.
- **Play again** brings this browser's bots into the next round, so playing alone goes on in one click.
- Home labels a practice round in the unsettled list "practice, with bots".

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

**M4, as built:**
- **One dark theme.** The arena is space, and the planet colours appear only on it and on the lists' dark chips. So "distinct in light and dark surroundings" reduces to the dark arena.
- **The palette** came from a search: 12 colours, each carrying a dark number at 7:1 contrast or more. Every pair is at least 0.12 apart in OKLab. Every pair that is hunter and quarry for some N ≤ 12 is at least 0.1 apart under simulated protanopia, deuteranopia and tritanopia (Machado 2009). `src/render/palette.test.ts` checks all of it.
- **Orientation** is a nose on the planet's outline, so it doesn't cross the number. *Changed 2026-10-26 at the owner's request*, chosen from the samples in [research/appearance/](research/appearance/REPORT.md): a dark pip just inside the rim, centred 0.7 r from the planet's centre, of radius 0.16 r. Unlike the nose, which reached 1.6 r, it never leaves the collision circle.
- **The marks are shapes, not colours:** your planet a solid ring, your quarry a ring with target ticks, your hunter a dashed ring. The lists also name them ("your quarry", "your hunter"). *Changed 2026-10-26 at the owner's request:* colour and shape, all at 1.34 r, where the old marks reached 2.7 r. You get a white ring, your quarry an amber ring in four arcs, your hunter a red dashed ring. The shapes still differ, so colour is never the only cue; `palette.test.ts` checks the three colours against the arena, and the amber against the red under the same colour blindness simulations as the palette.
- **Planets are shaded spheres** (*the owner, 2026-10-26*): each colour lit from the top left and darker at the limb. The shading is clear over the middle of the disc, so the numbers keep their contrast.
- **Thrust flames** (*the owner, 2026-10-26*): a flame behind every planet whose player holds thrust while the round runs. For other players that is the predicted input (`Timeline.headButtons`: their input for the head tick if it has arrived, else their last), so a flame can start or stop a few ticks late, as the planet's motion can.
- **Names under the planets** (*the owner, 2026-10-26*): each player's choice in Settings, off by default. A name is shortened to 12 characters, and drawn above a planet near the bottom wall. A player without a name shows as "Player 3F2A", as in the lists.
- **The walls** are the canvas border, drawn by CSS.
- **Corrections:** not yet judged by eye. Nobody has played over a real network, and in the gate's rounds resyncs are rare. That waits for the Q-2 runs.
- **Budget:** frame work in desktop Chromium averages 0.3 ms with 8 planets (as of M4; see docs/acceptance.md for the runs since the 2026-10-26 look). The phone's figure waits for the Pixel 8a run; the throttled proxy is in docs/acceptance.md.

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
  - One documented exception (M3): Trystero's built-in STUN list is a template literal, `stun:stun${i}.l.google.com:19302`, which the scan reads as a host named "stun". roslambo always passes its own `iceServers`, so those defaults are never used (`src/net/room-config.test.ts`).
- No source maps, no `.md` files, nothing matching a secret pattern.
- *M4:* a URL's scheme must start a word. Minified CSS such as `grid-template-rows:auto` contains `ws:auto`, which the scan had read as a WebSocket URL to a host named "auto". The self-test now includes that case.
- *M5:* the JavaScript scan finds string literals with a small tokenizer instead of a regular expression. A regular expression can't follow template literals nested inside `${…}`, and it read code between two of them as a string. A host must also start with a letter or digit, so the sentence "must start with wss://." names none. Both cases are in the self-test.
- A self-test with planted failures.

**wrangler.jsonc:** assets only, `./dist`, `observability.enabled: false`, the domain once Q-9 is answered (A.7).

**CI:** GitHub Actions on push and pull request: `npm ci`, `npx playwright install --with-deps`, `npm run check`. No secrets in CI. This needs Actions enabled on `gargantis/roslambo`.

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

**M4, as built:**
- `smoke.spec.ts`: Home in every engine, the Propose checks, and a typed code reaching Join, all without a network.
- `frames.spec.ts`: the frame-time bench runs in every engine. Timing isn't judged in the gate.
- `touch.spec.ts`, Chromium only (its DevTools protocol presses several fingers): two fingers hold two buttons; a finger that slides off still lets go; keys by position.
- `play.spec.ts`: the round through the screens, one player per engine.
  - Chromium proposes, Firefox joins by link and WebKit by typed code.
  - All three press Ready, play to the freeze, and show the same results.
  - Each balance equals that player's change.
  - The buttons are scripted through `window.roslamboTest`, which a test sets before the page loads. It also points the page at the local relay. Production pages never set it.

**M5, as built:**
- `src/net/resume-results.test.ts`, in simulated time:
  - resuming alone, and a live round beating a later save;
  - two saves meeting (Q-7);
  - a missed result settled once while three witnesses answer (P6);
  - a settler finding the round running;
  - a witness without a game;
  - a TICK flood and garbage, each closing its connection.
- `e2e/persist.spec.ts`, Chromium, one context per player, through the screens:
  - a reload mid-round takes the planet back;
  - a missed result comes from passive witnesses, and they drop their records once it settles;
  - everyone leaves, one player resumes from Home, and another rejoins it;
  - two saved histories meet by link, and the later one wins.
  - `window.roslamboTest.inspect()` lets the tests read the open round's timeline, ticks and hashes.
- `smoke.spec.ts`, in every engine: the tab lock's **Use here** both ways, and Settings' checks.

**Q-23, as built (2026-10-28):**
- `src/core/bot/bot.test.ts`: bot IDs (version 8, distinct per host, the same after a reload), names, when the steering bot turns and thrusts, and that every round of three bots, or of a player pressing nothing against two, reaches the freeze. Twelve hosts' rounds took 13–221 s of play.
- `src/net/bots.test.ts`, in simulated time:
  - a player alone plays two bots to the confirmed freeze;
  - a spectator's bot fills a seat, and the spectator's vote counts once, over four seeds;
  - two players outvote a host with two bots;
  - a host that reloads takes its bots back;
  - Remove takes out the newest bot, and leaving takes out the rest at once, not after 3 s;
  - a host's bots are forwarded to a player who can't reach it (D-14);
  - a bot's inputs count only from its host.
  - Each of the vote, leave and host-only tests failed with its rule removed.
- `ledger.test.ts` and `profile.test.ts`: a practice round pays and credits nothing.
- `e2e/bots.spec.ts`, over the local relay: a player alone in Chromium against two bots, its balance unchanged; then spectators in WebKit and Firefox fill a round with bots and see the same results.

**Outside the gate** (logged in `docs/acceptance.md`):
- the 12-peer load run;
- the M5 passive-room probe (research/passive/REPORT.md);
- the Q-1 frame-time runs: the bench on the Pixel 8a, and a proxy in Chromium slowed by DevTools throttling (`playwright.bench.config.ts`);
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
- *Done 2026-10-24:*
  - 10 network properties pass in simulated time (`src/net/network.test.ts`): P1–P5 and P7, plus reload, a proposer leaving, a slow peer, refusals and late joiners.
  - The three-engine round (`e2e/round.spec.ts`) passes in the gate.
  - The load run is logged in research/load/REPORT.md; the cap stays.

**M4 — Rendering, input and screens**
- *Prerequisite:* Q-1's devices named (2026-10-24: a Pixel 8a, no laptop).
- *Build:*
  - the renderer (§12); keyboard and multi-touch input;
  - *M4:* the profile and ledger, moved here from M5, because Home and Results show the balance. They cover the player ID, name and balance, the ante at the confirmed start and the credit at the confirmed freeze. The P6 tests come with them;
  - *M4:* the frame-time bench, `#test=frames`, with virtual players, so the phone is measured without a network or other devices;
  - every screen and message (§11), with the phone and desktop layouts;
  - Play again (Q-8);
  - `docs/acceptance.md`.
- *Exit:*
  - a full round is playable by link and by code over the local relay;
  - the Q-1 frame-time criteria pass on the reference devices;
  - multi-touch holds work on the phone.
- *Done 2026-10-24, except the two phone runs:*
  - A full round by link and by code over the local relay: `e2e/play.spec.ts`, one player per engine, in the gate.
  - The Q-1 criteria on the Pixel 8a: **not yet run**, deferred with the other manual runs. The bench and how to run it on the phone are in docs/acceptance.md. The proxy at the Pixel 8a's size in throttled Chromium: every 2-minute run passed at 1×, 4× and 6× CPU slowdown. p95 was 16.7–16.8 ms; the worst frame, at 4× and 6×, was one dropped frame (33 ms); a tick averaged 1.2 ms at 6×.
  - Multi-touch: two fingers on two buttons, and a finger sliding off, pass in Chromium's touch emulation (`e2e/touch.spec.ts`). **Not yet tried on the phone.**
  - Found on the way: the dist audit read minified CSS as a URL (§13).

**M5 — Persistence, disconnects and missed results**
- *Build:*
  - start with a probe of `passive` rooms: wake-up time, and one active room plus several passive ones in one tab;
  - the tab lock; saved rounds; pause and resume (the profile and ledger came with M4);
  - returning players; witnesses and settlers (§8.7) with the Q-10 caps;
  - the Home list (Q-6); Settings (relays, TURN, relay health).
- *Exit:*
  - P6 is green;
  - the end-to-end tests are green: reload mid-round, reload after the end, everyone leaves and one resumes, two histories (Q-7).
- *Done 2026-10-24:*
  - The probe came first: research/passive/REPORT.md. Passive rooms work as §8.7 assumed, and the Q-10 caps stay.
  - P6: the ledger and store tests, and a settler settling once while three witnesses answer.
  - The four end-to-end tests above are green in the gate, with the reload after the end done the hard way: the player is away when the round ends, and both other players have gone Home, so only passive witnesses hold the result.
  - The two connection-closing rules of §9.3 and §9.4, deferred from M3, are enforced.
  - Found on the way: the dist audit's JavaScript scan, rewritten (§13).

**M6 — Acceptance and release**
- *Prerequisites:* Q-2's machines and people booked; Q-9's domain.
- *Amended 2026-10-24 by the owner:* deploy first, without either, to the Cloudflare account's `workers.dev` address. The acceptance runs, the phone runs and the domain stay open. The exit below still needs them.
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
| Own hunter and quarry highlighted | §12 | marks by colour and shape (§12, 2026-10-26); palette tests |
| Arena not tied to the square | D-6 | ring radius test with a non-square polygon |
| W, A, D; conserved rotation; maximum rate; thrust direction | D-2, §7.2, §11 | rotation and thrust tests |
| On-screen buttons; held together; multi-touch | §11 | `touch.spec.ts` (Chromium touch emulation); by hand on the phone |
| Gravity at all times; elastic bounces; rotation unchanged by bounces; wall loss | D-4, §7.3 | physics tests |
| Scoring and zero-sum | §7.2 | scoring tests and property |
| Proposing, settings, keeper hand-off | §8.2 | end-to-end tests |
| Joining, numbering, renumbering, refusal | D-8 | rules tests; P4 |
| Spectators any time | §8.4 | end-to-end mid-round spectator |
| Ready, expiry, countdown, rotation-only before 0 | §7.2 | rules tests |
| Pre-start ring, correction, default rotation, capacity | D-5, §7.4 | ring tests; tuning sign-off |
| Freeze, no time limit, results, Play again | §7.2, §8.2, Q-8 | end-to-end tests |
| Screens | §11 | `smoke.spec.ts`, `play.spec.ts`; Settings and the Home list at M5 |
| Trystero, relays, STUN, user TURN | D-13, §8.8 | room-config test; dist audit |
| Round ID format, link, code | §6 (`round-id.ts`) | ported tests |
| Same simulation everywhere; majority voting; tie-break; spectators follow | D-7, D-9, D-10 | P1–P3 |
| Disconnects, returns, pause and resume | §8.5 | end-to-end tests; P7 |
| Missed results, witnesses, passive rooms | §8.7, D-19 | ledger tests; end-to-end tests; M5 probe |
| Persistence of ID, name, balance; negative balances | §10 | storage tests |
| JavaScript or TypeScript, static, Workers hosting, no WebGPU | D-24, D-25 | build; wrangler config test |
| Chrome, Edge, Firefox, Safari; mobile | §13, C-7 | three-engine gate; M6 manual |
| 60 fps; 8 players and 4 spectators | Q-1, Q-3 | M3 load run; the frame-time bench on the Pixel 8a (docs/acceptance.md) |
| Readable code; README | §6, §13 | review; README |
| Automated tests of the non-rendering core | §14 | gate |
| Cross-browser determinism test | §14 | `determinism.spec.ts` in three engines |
| No secrets, keys or tracking | D-25, §13 | dist audit; logs off |
| Acceptance lines | §15 M6 | `docs/acceptance.md` |
| Bots: hosted by players and spectators; practice rounds; one vote per host (Q-23) | D-27, §9.3, §10, §11 | `bot.test.ts`, `bots.test.ts`, `bots.spec.ts` |

---

## 18. Third parties

**Runtime.** Contacted only after Propose or Join, except hosting.

| Party | Role | Sees |
|---|---|---|
| relay.damus.io, relay.primal.net, nos.lol, relay.snort.social, nostr-pub.wellorder.net, yabu.me/v2 (C-22: two replaced on 2026-10-24) | Nostr signaling | IP, Origin, User-Agent, timing, a hashed room topic, a per-load Nostr key and Trystero peer ID, encrypted session-description sizes |
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
- switching from spectator to player;
- *Q-23:* a bot that plays on when its host leaves, taken over by another peer; bots kept across a reload before the countdown, when they've already been removed for silence; a choice of how well bots play.

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
n × { u8[16] player ID, u8+n display name, i32 final points }   (M5: was u32)
```

### A.3 Storage (localStorage)

| Key | Value (JSON) |
|---|---|
| `roslambo.v1.profile` | `{ v: 1, playerId, name, balance, rounds: { [roundId]: { ante, joined, antePaid, settled, seenAt, practice? } } }`; `practice` (Q-23) marks a round that started with bots |
| `roslambo.v1.profile.backup` | the last unreadable profile, verbatim |
| `roslambo.v1.round.<roundId>` | `{ v: 1, timelineId, tick, state: base64(A.1), savedAt }` |
| `roslambo.v1.witness.<roundId>` | `{ v: 1, record: base64(A.2), unacknowledged: [playerId], expiresAt }` |
| `roslambo.v1.settings` | `{ v: 1, relays: [url], turn: [{ urls, username, credential }], names }`; `names` (2026-10-26) reads as false when absent |

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
| Ring radius | 0.18 L (R = 0.44 L, "almost fills the arena") | the planets start near the centre (the owner) |
| 3-planet ring period | 10 s (8 s) | Gm ≈ 0.0040 L³/s²; the 8-planet ring turns at 0.22 turn/s |
| Gravity | Newtonian (softening tried, then dropped) | escape speed from contact 0.52 L/s |
| Ring clearance | 0.03 L | ring capacity 12 |
| Thrust | 0.6 L/s² (0.6) | median escape from a dead stop 8 s |
| Wall energy loss | 0.2 | |
| Correction factor | 2 (1.0) | 1 doesn't hold a Newtonian 8-ring |
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
