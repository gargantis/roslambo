# M5 probe: Trystero's passive rooms

**Date:** 2026-10-24.
**Answers:** PLAN M5's first step. Before witnesses wait in passive rooms (§8.7), does Trystero 0.26.0's `passive` mode do what the plan assumes, and at what cost to the relays (C-6)?
**Setup:** `npx playwright test -c research/passive/playwright.config.ts` drives the dev-only page `dev/passive-probe.html` on the Vite dev server.
- Headless Chromium 156, one page per peer, on one machine.
- The local Nostr relay (then `e2e/lib/nostr-relay.mjs`, now `vendor/hermet/nostr-relay.mjs`), which counts what each connection sends it.
- Raw numbers are in `results.json`.

The pages:

| Page | Rooms |
|---|---|
| W | one active room `g`, with a 60-message-per-second stream from P, plus ten passive rooms `r1`…`r10` |
| W2 | one passive room, `r3`, the same as one of W's |
| A10 | ten active rooms `s1`…`s10`, idle |
| P | the active room `g`, streaming |
| S-r3, S-r5, S-r7, S-r9 | settlers: one active room each, opened one after another |

## Results

**1. An idle passive room costs the relays nothing.** Over one idle minute, after a 20-second warm-up:

| Page | REQ | CLOSE | EVENT |
|---|---|---|---|
| W (1 busy active + 10 passive) | 0 | 0 | 1 |
| W2 (1 passive) | 0 | 0 | 0 |
| A10 (10 idle active) | 0 | 0 | 10 |
| P (1 busy active) | 0 | 0 | 1 |

- An active room announces once a minute (Trystero's steady interval, 60 s, after a fast start). A passive room doesn't announce until an active peer arrives.
- Trystero puts every topic of every room in one tab into a single subscription per relay, up to 250 topics. So 20 witnessed rooms plus 10 settler rooms are one subscription per relay connection, re-sent when the set changes, not 30. Relay limits on subscriptions per connection don't bite.

**2. Wake-up is fast.** From opening a settler's page to each side seeing the other:

| Room | Witness saw the settler | Settler saw the witness | First message |
|---|---|---|---|
| r3 | 363 ms | 264 ms | 3 ms |
| r5 | 292 ms | 293 ms | 3 ms |
| r7 | 301 ms | 301 ms | 2 ms |
| r9 | 278 ms | 279 ms | 2 ms |

These include the page load and a local relay. With public signalling, M0 found the first peer after 1.4–3.2 s (research/lockstep/REPORT.md), so a settler should hear from a witness within seconds, not tens of seconds. Passive wake-up over public relays is itself unmeasured.

**3. Passive peers don't connect to each other.** W and W2 sat in `r3` for over a minute without connecting. When the settler arrived, each connected to it and not to the other: one join each.

**4. One tab can play and watch at once.** W's active room `g` received 62.5 messages a second through the whole run, while four of its passive rooms woke one after another. The longest gap was 147 ms. After the settlers left, W's relay traffic went back to one event a minute, its active room's announcement: the woken rooms went dormant again, after Trystero's 7.5 s grace period.

## Decision

- The §8.7 design stands: witnesses wait in `passive` rooms, and settlers join actively.
- The Q-10 caps stay: 20 witnessed rounds, 10 unsettled. The relay cost would allow more, but each woken room still costs a WebRTC connection.
- A settler waits 20 s for an answer, as the connection-failure rule does (§8.6), before it shows the round as paused. Wake-up is far quicker than that.
- **Not measured:** public relays, phones, and NAT traversal. They wait with the deferred manual runs (Q-2).
