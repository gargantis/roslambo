# roslambo

Bumper planet rock, paper, scissors: a browser-based, peer-to-peer multiplayer game. Each player flies a planet; each planet beats the next one in a cycle. No game server: browsers connect directly over WebRTC.

**Status:** in development. [REQUIREMENTS.md](REQUIREMENTS.md) says what it must do; [PLAN.md](PLAN.md) says how, and lists the milestones. M0, the lockstep spike, is done ([research/lockstep/REPORT.md](research/lockstep/REPORT.md)). M1, this skeleton and its test gate, is next to finish.

## Run

Needs Node 22.12 or later (`.nvmrc`).

```sh
npm install
npm run dev        # http://localhost:5173
```

## Test

```sh
npx playwright install --with-deps chromium firefox webkit   # once
npm run check
```

`npm run check` is the gate: lint, public-scan, typecheck, unit tests, build with the dist audit, and end-to-end tests in Chromium, Firefox and WebKit. It contacts nothing public.

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
