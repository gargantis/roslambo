# roslambo: agent instructions

This repo is **public**, and **unlicensed**: the owner keeps all rights. Never add a LICENSE or license headers. Never commit home paths, account names or other identity details; `npm run public-scan` enforces the built-in patterns.

## The gate is the definition of done

```sh
npm run check
```

That is lint, public-scan, typecheck, unit tests, build with the dist audit, and end-to-end tests in Chromium, Firefox and WebKit. It must pass before a commit lands. Never weaken it to make a build pass: fix the code.

## Contracts that are easy to break

- PLAN.md is the implementation contract. A Q, C or D number is never reused; a settled item records what settled it. Check it before reopening a decision.
- REQUIREMENTS.md belongs to the owner. Change it only as the plan records, citing the Q-number.
- `src/core/sim/**` may use only exact operations (D-1), enforced by the `exact-ops` lint rule. `src/core/sim/goldens.json` pins the simulation's bits in Node and every engine. Any change to the simulation or its settings changes them: re-emit them on purpose (`ROSLAMBO_EMIT_GOLDENS=1 npx vitest run src/core/sim/golden.test.ts`) and say so in the commit. That's allowed until the first release, never after.
- `src/core/**` is pure: no DOM, timers, clocks or storage. The caller passes time in.
- Only `src/net/trystero.ts` imports Trystero (D-13). Build its room config as a literal typed against `JoinRoomConfig`: an untyped spread made amorfus silently fall back to the library's own relays.
- Only `src/storage/**` touches browser storage (D-18).
- Every external host is listed in `third-party.json`; the dist audit fails on any other.
- `vendor/hermet` is the gate tooling shared with amorfus (D-28): public-scan, the dist audit, the licence notices, the exact-ops rule, the local Nostr relay and the ESLint and tsconfig bases. It is a pinned submodule of gargantis/hermet; roslambo's own policy stays in `scripts/` and the configs. Change shared code in gargantis/hermet, then move the pin. Never edit `vendor/hermet` in place.
- `research/lockstep/` is the throwaway M0 spike (D-26), with its own toolchain. Product code never imports it.
- The test pages (`#test=determinism`, `net`, `frames`) and `window.roslamboTest` (set by end-to-end tests before load) must never change what a normal page does.

## Owner-only steps

Deploying, and anything else outward-facing, waits for the owner's explicit go-ahead.
