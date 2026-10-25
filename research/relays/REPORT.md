# C-22: which public relays carry Trystero's signalling

**Date:** 2026-10-24, after the first deploy.
**Answers:** PLAN C-22. At the first deploy, three of the six curated relays refused roslambo. Which open relays should replace the two that refuse Trystero's keys?

## Method

1. **Probe** (`probe.mjs`): for each relay, read its NIP-11 information document. Then subscribe on one connection, and publish an ephemeral event on a second.
   - The event is signed by a brand-new key, with an "x" topic tag and a payload the size of a Trystero offer (about 1.5 KB), as Trystero sends them.
   - Three rounds, 15 s apart. A relay "works" when it accepts the event (OK true) and delivers it to the subscriber. Raw numbers are in `results.json`.
2. **Round** (`rounds.spec.ts`): the deciding check. A three-engine round of the production bundle's `#test=net` page, signalling through that relay and no other, played to the freeze.

The probe is not enough on its own. nostr.bitcoiner.social accepted every probe event, yet refused every event Trystero sent from the browsers, saying "Policy violated and pubkey is not in our web of trust". Only the round shows that.

## Probe results (three rounds)

| Relay | Works | Note |
|---|---|---|
| relay.damus.io | 0/3 | HTTP 503 at the handshake. Earlier it answered "banned: too many rate-limit violations", probably for this machine's test traffic |
| relay.primal.net | 3/3 | |
| nos.lol | 3/3 | |
| offchain.pub | 0/3 | connection refused. At the deploy it answered "not in our web of trust" |
| nostr.bitcoiner.social | 3/3 | but refuses Trystero: see the round below |
| yabu.me/v2 | 2/3 | one round got no OK and no delivery within 15 s |
| relay.snort.social | 3/3 | memlay, an in-memory relay: "ephemeral: will not be stored" |
| nostr.mom | 3/3 | |
| nostr.oxtr.dev | 3/3 | |
| nostr-pub.wellorder.net | 3/3 | nostr-rs-relay; NIP-11 says payment_required false, restricted_writes false |
| relay.nostr.net | 3/3 | |
| relay.nostr.dev.br | 3/3 | |
| relay.layer.systems | 3/3 | |
| cdn.satellite.earth | 3/3 | |

A first single-round pass also tried relay.nostr.bg and relay.0xchat.com (no DNS), relay.nostr.band (timeout) and nostr.robosats.org (HTTP 502). It tried relay.nos.social and relay.coinos.io too ("kind not allowed"), and nostr.einundzwanzig.space ("NIP-05 verification needed").

## Round results (one relay at a time)

| Relay | Mesh formed | Round | Resyncs, late inputs |
|---|---|---|---|
| relay.snort.social | 3.9 s | frozen at 29 s, all three agree | 0, 0 |
| nostr-pub.wellorder.net | 2.1 s | frozen at 26 s, all three agree | 0, 0 |
| nostr.mom | 3.3 s | frozen at 33 s, all three agree | 0, 0 |
| nostr.bitcoiner.social | never | no peer connected in 180 s: "not in our web of trust" | — |

## Decision

- **relay.snort.social replaces offchain.pub.** Its in-memory relay suits ephemeral signalling.
- **nostr-pub.wellorder.net replaces nostr.bitcoiner.social.** It is one of the longest-running public relays, and runs different software (nostr-rs-relay) from the strfry most of the list runs.
- **Kept:** relay.damus.io, which is down or banning this machine for now, and yabu.me/v2, which works most of the time. Both are to be checked again.
- **nostr.mom** is the next choice if another relay fails.
- These are one machine's measurements on one evening. Relay policies change without notice, so `probe.mjs` and `rounds.spec.ts` are kept to check again.
