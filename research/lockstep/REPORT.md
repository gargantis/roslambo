# M0 lockstep spike: report

**Date:** 2026-10-24.
**Answers:** PLAN.md §15 M0, the throwaway spike for deterministic lockstep with majority voting across Chromium, Firefox and WebKit over Trystero.
**Verdict:** the approach works. Every automated run passed. Building it found four design flaws, each now fixed and each amending the plan (§3 below). The real-network and real-device questions remain unmeasured, because the manual run was deferred (§4).

## 1. Setup

| | |
|---|---|
| Machine | x86-64, 12 logical cores, Linux under WSL2 |
| Node | 22.23.4 |
| Browsers | Playwright 1.64.1: Chromium 156.0.8078.4, Firefox 157.0, WebKit 27.2, all headless |
| Networking | `@trystero-p2p/nostr` 0.26.0, unpatched. Signaling through a local NIP-01 relay on 127.0.0.1 (copied from amorfus), and once through the six public relays. WebRTC between local pages. |
| Simulation | `src/sim.ts`: gravity, elastic planet bounces, lossy walls, thrust, conserved rotation. A unit-square arena with the starting values of PLAN A.5. No ring, no scoring. |
| Inputs | Scripted per player (`src/bots.ts`): 75% thrust, random rotation, changing every 23 ticks |
| Timeline | `src/timeline.ts` with d = 2, w = 12, v = 12 at 60 ticks/s and 4 substeps (PLAN A.4) |

The raw results are in [results/](results/); §5 has the commands.

## 2. The questions M0 had to answer

| Question | Answer | Evidence |
|---|---|---|
| Do Node, Chromium, Firefox and WebKit compute bit-identical states? | **Yes.** 220 checkpoints over 220,000 ticks (3, 8 and 12 planets, about 2.2 million planet contacts) match in all four. | Run 1: `results/golden-*.json` |
| Do honest peers agree on final ticks? | **Yes.** One player per engine plus a spectator, 120 s: about 7,300 final ticks each, with zero disagreements other than the injected fault. | Run 2: `results/mesh-local.json` |
| How long does outvoting and repairing a corrupted peer take? | It's detected at the first tally of the corrupted tick, 24 ticks (0.4 s) later, and repaired one round trip after that (2–3 ms here). One resync. | Runs 2 and 2-public |
| Late inputs at d = 2, w = 12 | **None** in steady state, locally and with public signaling. Real-network figures are unmeasured (§4). | Runs 2, 2-public, 4 |
| Clock drift | No jumps and no late inputs after the fixes in §3.3. Simulated drift of ±0.3% is held within a tick. | Run 2; `test/timeline.test.ts` |
| Reliable actions or an unordered channel? | Reliable actions are enough locally, with zero late inputs. A lossy network isn't available to compare against, so the unordered channel stays unbuilt (D-13). The input redundancy of §3.1 would make it viable if it's ever needed. | — |
| CPU per tick with 12 peers (8 players, 4 spectators) | Player: mean 0.8 ms, p95 2.1–2.6 ms, max 62 ms. Spectator: mean 0.2 ms, p95 0.5 ms. Desktop CPU only; the phone is unmeasured. | Run 4: `results/load.json` |
| Traffic with 12 peers | Each player receives about 433 messages and 12.6 KB per second, and broadcasts 60 TICKs per second (about 660 messages and 20 KB per second to 11 peers). Each spectator receives about 485 messages and 14 KB per second. | Run 4 |
| Join and mesh-formation time | Local relay: first peer 0.1–1.6 s; the round is held about 1.0 s after load. Public relays: first peer 1.4–3.2 s; the round is held about 2.0 s after load; 6 of 6 relays reachable. 12 local peers: every page held the round within about 1.0 s. | Runs 2, 2-public, 4 |
| Does Playwright's WebKit on Linux have working WebRTC (C-18)? | **Yes.** WebKit joined every run, with mDNS candidates rewritten to loopback by Trystero's `_test_only_mdnsHostFallbackToLoopback`. | Run 2 |
| Do 0.26.0's limits hold without amorfus's patch? | **Yes.** All 80 attack sends were refused: 2 MiB payloads over the 1 MiB `maxReceiveBytes`, and 512 KiB payloads of an unregistered action type. That was about 100 MiB attempted against two peers. The victim's heap went 4.8 → 3.9 MiB, and its round kept agreeing. | Run 5: `results/flood.json` |

The PLAN §8.9 properties were also checked in Node on a simulated network (`test/timeline.test.ts`, 7 tests). The cases: 3 players with drifting clocks; a corrupted peer; 8 players plus 4 late spectators; a silent player; a peer 300 ms from everyone; a two-player tie; a player who reloads and takes back its planet.

## 3. What building it changed

Each of these was found by a failing test or a run, fixed in the spike, and needs the matching change in the product (PLAN amendments of 2026-10-24).

### 3.1 Inputs in flight were lost to joiners (amends D-7 and the TICK layout in §9)

- **Found:** in the simulated network, every joiner diverged once. An input sent just before the joiner connected was still on its way to the peer that built the joiner's STATE, so nobody ever delivered it.
- Over real Trystero this is worse, because a joiner's mesh forms over seconds.
- **Fix:**
  - Every TICK repeats the sender's own inputs for the previous 16 ticks (a presence mask plus 3 bits each: 8 more bytes, 29 in all).
  - A joiner holds finalisation until it has heard one TICK from every player active in the STATE, capped at 500 ms. It votes only once a tally agrees with it, or after a resync.
- **Result:** joiner divergences went from one per joiner to zero, in the simulation and in every browser run. The warm-up took 6–37 ms locally.

### 3.2 Votes that arrive after the tally must still count (amends D-9)

- **Found:** a peer more than about 200 ms from the others only ever had its own vote by tally time, so it "agreed" with itself and stayed diverged forever.
- **Fix:** a vote counts whenever it arrives, while its tick is still in the 256-tick history. If it changes the outcome against the peer, the peer resyncs. That matches the requirement's "among the votes received".
- **Result:** the 300 ms test peer is caught and repaired; the others never split.

### 3.3 The clock correction chased jitter and let one joiner move everyone (amends D-11)

- **Found:**
  - Jitter makes every one-way estimate too short, so all peers read a negative offset and slowed down together. Peers with fast clocks then drifted about 9 ticks ahead and finalised others' inputs too early.
  - Separately, with two other players, the "median" was the larger offset, so one badly aligned joiner made the genesis peer's clock jump twice in the first browser run.
- **Fix:**
  - Proportional correction (0.5% per tick of offset, at most 2%) with a 1-tick deadband.
  - Above w/2 off, the clock jumps forward or pauses.
  - The true median, the mean of the middle two for an even count.
  - A player's offset counts only after it has been heard for 2 s.
- **Result:** the 120 s three-engine run had no jumps and no late inputs, where the first run had 2–3 jumps and up to 74 late inputs per peer.

### 3.4 Planets come to rest touching, and "approaching" contacts then fire every substep (escalates C-16)

- **Found:** the golden runs logged 2.6 planet contacts per tick for 3 planets. Measured over 10 minutes with 3 planets at the A.5 starting values:

  | Inputs | Approach-gated contacts | Separate contact episodes | Ticks with a contact |
  |---|---|---|---|
  | bots (75% thrust) | 137 /s | 5.6 /s | 59% |
  | rotation only | 174 /s | 5.5 /s | 69% |
  | none: gravity alone | 174 /s | 5.5 /s | 69% |

- **Cause:** thrust isn't the cause. The walls take energy out, gravity pulls the planets together, and a pair resting in contact "approaches" again every substep: an elastic bounce of ever smaller height. This is the appendix's lossy-bounce case, reached through the wall losses instead.
- **Consequence:** under the scoring rule as written, a hunter resting against its quarry would score about 150 points a second.
- **Proposed for M2:** score once per contact episode. A pair scores again only after it has separated by some gap, chosen on the tuning page. Episodes ran at 5.5 per second here, against 174 contacts per second. Determinism is unaffected: the engines agreed through all of this.

## 4. Not measured

The owner deferred the manual run (run 3) on 2026-10-24. Until it runs, these are unknown:
- **NAT traversal between real networks**, and so C-1's failure rate. Every run here connected pages on one machine.
- **Real-network latency, jitter and loss**, and so the late-input rate at d = 2 and w = 12, and whether the unordered channel is needed.
- **Phone CPU.** Run 4's desktop costs (0.8 ms mean per player tick) are about 5% of one core; a phone may be several times slower.
- **Real Safari** on macOS and iOS. Playwright's WebKit agrees bit for bit, but it isn't Safari (C-7).

## 5. Reproducing

From `research/lockstep/`:

```sh
npm install
npx playwright install chromium firefox webkit   # plus the system libraries, once
node src/golden-cli.ts                           # run 1 in Node only
node --test test/*.test.ts                       # the timeline properties
npx playwright test --project=golden-chromium --project=golden-firefox --project=golden-webkit   # run 1
SPIKE_SECONDS=120 npx playwright test e2e/mesh.spec.ts                       # run 2
SPIKE_RELAY=public SPIKE_SECONDS=90 npx playwright test e2e/mesh.spec.ts     # run 2, public relays
LOAD_SECONDS=90 npx playwright test e2e/load.spec.ts                         # run 4
npx playwright test e2e/flood.spec.ts                                        # run 5
```

The spike page also runs by hand: `npm run dev`, then open `/?room=<name>&me=0&genesis=1` in one browser and `/?room=<name>&me=1` in another. `relay=public` is the default.
