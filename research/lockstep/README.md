# Lockstep spike (M0)

A throwaway spike for PLAN.md §15 M0. It tests deterministic rollback lockstep with majority voting, across Chromium, Firefox and WebKit, over Trystero. Nothing in the product imports it (D-26); the product code is written fresh from M1.

Findings and numbers: [REPORT.md](REPORT.md).

| Path | What |
|---|---|
| `src/num.ts` | binary angles and exact-ops sine and cosine (D-1, D-2) |
| `src/hash.ts` | the 64-bit state hash (D-9) |
| `src/sim.ts` | the minimal simulation and its canonical bytes |
| `src/timeline.ts` | rollback lockstep, votes, resync, clock (D-7, D-9, D-10, D-11) |
| `src/proto.ts` | TICK, STATE_REQ and STATE |
| `src/net.ts` | the Trystero transport (D-13) |
| `src/main.ts`, `index.html` | the spike page |
| `test/` | the timeline on a simulated network, in Node |
| `e2e/` | Playwright runs 1, 2, 4 and 5, and the local Nostr relay |
| `results/` | raw results behind the report |

Commands are in REPORT.md §5.
