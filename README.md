# roslambo

Bumper planet rock, paper, scissors: a browser-based, peer-to-peer multiplayer game. Each player flies a planet; each planet beats the next one in a cycle. No game server: browsers connect directly over WebRTC.

**Status:** in development. [REQUIREMENTS.md](REQUIREMENTS.md) says what it must do; [PLAN.md](PLAN.md) says how, and lists the milestones. Done so far:
- M0, the lockstep spike ([research/lockstep/REPORT.md](research/lockstep/REPORT.md));
- M1, the skeleton and its test gate;
- M2, the deterministic simulation, with its tuning ([research/tuning/REPORT.md](research/tuning/REPORT.md));
- M3, networking and consensus: the wire protocol, the rollback timeline, sessions over Trystero ([research/load/REPORT.md](research/load/REPORT.md));
- M4, rendering, input and screens: a round is playable from Home to Results. The runs on the reference phone are still to do ([docs/acceptance.md](docs/acceptance.md));
- M5, persistence: saved rounds, pause and resume, missed results collected from other players' browsers, Settings, and one game tab per browser ([research/passive/REPORT.md](research/passive/REPORT.md)).

Next is M6, acceptance and release. It needs the networks and people for the manual runs, and a domain.

## Run

Needs Node 22.12 or later (`.nvmrc`). The gate's tooling, shared with amorfus, is the submodule `vendor/hermet`: clone with `--recurse-submodules`, or fetch it once after cloning.

```sh
git submodule update --init   # vendor/hermet, once
npm install
npm run dev        # http://localhost:5173
```

To play alone, propose a round, press **Play**, add two bots, and press **Ready**. A round with bots is practice, so it doesn't change your balance. To play against yourself, open the page in two different browsers, or in a normal and a private window: each browser profile is one player, and one tab per browser plays at a time. Proposing or joining contacts the public Nostr relays.

The simulation's tuning page, with a slider for every gameplay setting, is at http://localhost:5173/dev/tuning.html. It's dev-only and never built.

The frame-time bench, `#test=frames`, plays a round of eight planets on one page, seven of them virtual, and prints whether frames kept up. [docs/acceptance.md](docs/acceptance.md) says how to run it on a phone.

## Test

```sh
npx playwright install --with-deps chromium firefox webkit   # once
npm run check
```

`npm run check` is the gate: lint, public-scan, typecheck, unit tests, build with the dist audit, and end-to-end tests in Chromium, Firefox and WebKit. It contacts nothing public.

Three runs stay outside the gate (after `npm run build`):
- the 12-peer load run: `npx playwright test -c playwright.load.config.ts`;
- the frame-time bench at phone size, with the CPU slowed 1×, 4× and 6×: `npx playwright test -c playwright.bench.config.ts`;
- the passive-room probe, on the dev server: `npx playwright test -c research/passive/playwright.config.ts`.

## Build

```sh
npm run build      # emits dist/, a fully static folder
```

## Deploy

`npm run deploy` runs the gate, then `wrangler deploy` to Cloudflare Workers static assets (assets only, request logs off). It needs a scoped Cloudflare API token in the environment. The domain isn't chosen yet, and the first deploy waits for the owner's go-ahead.

## Privacy

No accounts, analytics or tracking. Playing contacts the public Nostr relays and STUN servers listed in [third-party.json](third-party.json), and the other players' browsers, which see your IP address.

## License

None. All rights reserved: this repository is public so it can be read, but no license is granted to use, copy, modify or distribute it. Bundled third-party packages keep their own licenses; their notices ship in `dist/THIRD-PARTY-LICENSES.txt`.
