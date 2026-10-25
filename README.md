# roslambo

Bumper planet rock, paper, scissors: a browser-based, peer-to-peer multiplayer game. Each player flies a planet; each planet beats the next one in a cycle. No game server: browsers connect directly over WebRTC.

**Status:** in development. [REQUIREMENTS.md](REQUIREMENTS.md) says what it must do; [PLAN.md](PLAN.md) says how, and lists the milestones. Done so far:
- M0, the lockstep spike ([research/lockstep/REPORT.md](research/lockstep/REPORT.md));
- M1, the skeleton and its test gate;
- M2, the deterministic simulation, with its tuning ([research/tuning/REPORT.md](research/tuning/REPORT.md));
- M3, networking and consensus: the wire protocol, the rollback timeline, sessions over Trystero ([research/load/REPORT.md](research/load/REPORT.md)).

Next is M4: rendering, input and screens.

## Run

Needs Node 22.12 or later (`.nvmrc`).

```sh
npm install
npm run dev        # http://localhost:5173
```

The simulation's tuning page, with a slider for every gameplay setting, is at http://localhost:5173/dev/tuning.html. It's dev-only and never built.

## Test

```sh
npx playwright install --with-deps chromium firefox webkit   # once
npm run check
```

`npm run check` is the gate: lint, public-scan, typecheck, unit tests, build with the dist audit, and end-to-end tests in Chromium, Firefox and WebKit. It contacts nothing public.

The 12-peer load run stays outside the gate: `npx playwright test -c playwright.load.config.ts` (after `npm run build`).

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
