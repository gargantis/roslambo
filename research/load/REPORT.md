# M3 load run: report

**Date:** 2026-10-24.
**Answers:** the PLAN M3 exit: run 8 players and 4 spectators (the Q-3 cap), within budget, logged, and decide whether the cap can rise.
**Setup:** `npx playwright test -c playwright.load.config.ts`, which runs `e2e/load.spec.ts`:
- 12 headless Chromium pages on one 12-core machine (WSL2);
- the production bundle's `#test=net` mode, over the real Trystero 0.26.0 transport and a local Nostr relay;
- scripted inputs, and an ante of 500 so the round runs the whole time.

The last run's raw reports are in `results.json`.

## Results

| Run | Length | Peers each connected to | Final ticks agree | Late inputs | Disagreements | Resyncs | Clock jumps |
|---|---|---|---|---|---|---|---|
| 1 | 90 s | 11 | yes | 59–377 per peer | 36–124 per peer | 2–9 per peer | not logged |
| 2 | 60 s | 11 | yes | 0 | 0 | 0 | 0 |
| 3 | 90 s | 11 | yes | 0 | 0 | 0 | 0 |

Run 1 came straight after three back-to-back three-engine rounds, on a machine still under load. Every peer was repaired and ended in agreement. The timeline didn't record *when* things happened yet; that log was added for runs 2 and 3, which were clean, so run 1's cause isn't pinned down. Machine contention is the likely explanation, not a protocol fault, but that is an inference.

**Cost per tick (run 3):**

| | Mean | p95 | Max |
|---|---|---|---|
| Player | 0.58–0.73 ms | 1.1–1.3 ms | 9–20 ms |
| Spectator | 0.36–0.42 ms | 0.7 ms | 8–15 ms |

**Traffic (run 3):** each player receives about 428 messages a second, and each spectator about 482.

## Decision

The mesh cap stays at 8 players and 4 spectators (Q-3). These are desktop figures on one machine. Phone CPU and real-network lateness stay unmeasured until the deferred manual runs, and they would decide whether the cap can rise.
