# Acceptance: devices, criteria and runs

The conditions under which REQUIREMENTS.md's *Acceptance* and *Performance* lines are judged (PLAN Q-1, Q-2, §14 "Outside the gate"), and the log of runs that the gate doesn't make.

## Reference device (Q-1, settled 2026-10-24)

- **Phone:** the owner's Google Pixel 8a, in Chrome for Android.
- **No laptop:** the owner has none, so the phone is the only reference device. It is also the weaker of the two devices the requirement named. Desktop browsers are checked in development only: the gate runs Chromium, Firefox and WebKit, and the frame-time bench runs in desktop Chromium.

## Frame-time criteria (Q-1)

- **The run:** the frame-time bench, opened as `#test=frames`, for 120 s with 8 planets:
  - the real round screen, renderer, timeline and message codec;
  - seven virtual players on the same page, each sending real TICK messages with 20–80 ms of latency and 15 ms of jitter, so the page predicts and rolls back as in a round;
  - scripted buttons (the golden scripts' `scriptButtons`), so planets thrust, turn, collide and bounce;
  - measured from the moment all eight planets are in: the pre-start ring, the 10 s countdown, then the round. The ante is large enough that nobody reaches 0.
- **Pass:** the interval between animation frames has p95 ≤ 18 ms and max ≤ 50 ms. The page prints PASS or FAIL with the numbers.
- **The display at 60 Hz:** the Pixel 8a's Smooth Display runs at up to 120 Hz, which would hide dropped frames inside the criteria. Turn it off (Settings → Display → Smooth Display) for the run.
- **Not covered:** the phone's cost of real WebRTC traffic with seven peers. The Q-2 runs at M6 cover that.

### Running it on the phone

The bench opens no connection and stores nothing, so it doesn't need a secure context. Any of these works:

1. **After the first deploy (Q-9):** open `https://<domain>/#test=frames`.
2. **Over USB:** enable USB debugging on the phone, then on the computer `npm run build && npx vite preview`, `adb reverse tcp:4318 tcp:4318`, and open `http://localhost:4318/#test=frames` on the phone.
3. **Over Wi-Fi:** `npm run build && npx vite preview --host 0.0.0.0`, then open `http://<the computer's LAN address>:4318/#test=frames`. On WSL2 the port must also be forwarded from Windows, which needs an administrator command (`netsh interface portproxy add v4tov4 …`).

Keep the phone awake and the page in front until the verdict appears at the bottom. Then add a row to the log below.

### Multi-touch on the phone

On the same page with `&seconds=600`, hold **⟲** and **⟳** with two fingers: both buttons light. Slide one finger off its button onto the arena: that button stays lit until the finger lifts. `e2e/touch.spec.ts` checks the same in Chromium's touch emulation.

## Networks (Q-2)

Still open: which machines, people and networks the acceptance runs use. Needed by M6.

## Log

### The frame-time bench

| Date | Device | Browser | Run | Frame interval p95 / max | Frame work mean | Tick mean | Verdict |
|---|---|---|---|---|---|---|---|
| — | Pixel 8a | Chrome | 120 s, 8 planets | — | — | — | **not yet run**: deferred with the manual runs (2026-10-24) |
| 2026-10-24 | proxy: development machine | headless Chromium 156, CPU 1× | 120 s, 8 planets | 16.8 / 16.8 ms | 0.2 ms | 0.25 ms | pass |
| 2026-10-24 | proxy: development machine | headless Chromium 156, CPU 4× | 120 s, 8 planets | 16.7 / 33.2 ms | 0.6 ms | 0.81 ms | pass |
| 2026-10-24 | proxy: development machine | headless Chromium 156, CPU 6× | 120 s, 8 planets | 16.8 / 33.3 ms | 0.7 ms | 1.21 ms | pass |

The proxy rows are headless Chromium 156 on the development machine (12 cores, WSL2), at the Pixel 8a's CSS size (412 × 915) and pixel ratio, with the CPU slowed by DevTools throttling: `npx playwright test -c playwright.bench.config.ts`. They are a guide to headroom, not the acceptance run. Headless frames aren't tied to a real display, and throttling slows JavaScript evenly, which a phone doesn't.

### Other runs outside the gate

| Run | Where | Status |
|---|---|---|
| 12-peer load run (Q-3) | [research/load/REPORT.md](../research/load/REPORT.md) | done on desktop at M3; the cap stays at 8 and 4 |
| Passive rooms for witnesses (C-6, Q-10) | [research/passive/REPORT.md](../research/passive/REPORT.md) | done on desktop with a local relay at M5; public relays unmeasured |
| Determinism page on real Safari, macOS and iOS | M6 | not yet run |
| The Q-2 network matrix | M6 | waits for Q-2 |
