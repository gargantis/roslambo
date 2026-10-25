# roslambo: Requirements

Bumper planet rock, paper, scissors: a browser-based, peer-to-peer multiplayer game.

Status: draft from the requirements discussion of 2026-10-24, amended the same day by the approved [PLAN.md](PLAN.md); Q-numbers cite its questions. **TBD** marks a value not yet chosen. After the requirements come notes for the implementation plan and the physics checks behind the formulas.

## Concept

- Each player flies one planet in a shared square arena
- Planets pull on each other by gravity and bounce off each other and the walls
- Planets are numbered 1…N, and each one beats the next in a cycle: rock, paper, scissors for any number of players
- When a planet collides with the one it beats, a point moves from the loser to the winner
- A round ends when any player runs out of points. Points carry over between rounds as a persistent balance, so skilled players accumulate points

## Terms

- **Round**: one game, from proposal to results screen
- **Proposer**: whoever creates a round; they don't have to play in it
- **Player**: flies a planet in a round
- **Spectator**: watches a round without a planet
- **Planet number**: a player's position 1…N, assigned in join order
- **Quarry**: the planet you beat. Planet *i*'s quarry is planet *i*+1, and planet N's quarry is planet 1
- **Hunter**: the planet that beats you. Planet *i*'s hunter is planet *i*−1, and planet 1's hunter is planet N
- **Ante**: the points each player brings into a round, paid from their balance
- **Balance**: a player's running point total across rounds
- **Round ID**: the secret that identifies a round and lets people join it
- **Witness**: a peer that was present when a round ended and keeps its result

## Gameplay (MVP)

### Planets and arena

- All planets have the same fixed mass and the same fixed size
- Each planet shows its orientation
- Each planet shows its number in a distinct color
- Each player can choose an optional display name, shown on the results screen. Names don't have to be unique
- Each player sees their own hunter and quarry highlighted
- The arena is a fixed-size square. The design should not depend on the square shape, so the shape can change later

### Controls

- Three controls: **thrust forward** (`W`), **rotate left** (`A`), **rotate right** (`D`)
- Each planet's rotation is conserved: it keeps turning at its current rate. Holding rotate left or rotate right changes the rotation rate steadily, not the direction directly
- The rotation rate has a maximum (see *Configuration*)
- Thrust pushes the planet the way it faces at that moment
- The same three controls are available as on-screen buttons below the arena
- Controls can be held together, such as thrust while rotating, on a keyboard and with multi-touch on the on-screen buttons

### Physics

- Mutual gravity between all planets acts at all times: before, during and after the countdown
- Planets bounce off each other elastically (MVP)
- Bounces, off planets or walls, don't change a planet's rotation (MVP; likely to be revisited)
- Planets bounce off the walls and lose a fraction of their kinetic energy (20%), so speeds can't grow without limit (Q-14)

### Scoring

- At the start of a round, each player pays the ante from their balance. The ante is their starting points
- When a planet collides with its quarry, the planet gains 1 point and the quarry loses 1 point. Every collision counts, including repeated collisions between the same pair (MVP)
- A collision is one contact episode: planets that stay touching, or bounce within a small gap of each other, score once. The pair scores again only once their surfaces are a full planet diameter apart (C-16)
- Any other collision changes no points, including collisions between planets that aren't neighbors in the cycle (such as 1 and 3 of 4)
- Every collision is a bounce, whether or not points change hands
- Points are zero-sum within a round
- Point changes within one tick apply together, so several players can reach 0 in the same tick (Q-13)

## Rounds

### Proposing

- A proposer creates a round and sets:
  - the **ante**: a whole number, at least 1; it can differ from round to round
  - the **minimum players**: at least 3
  - the **maximum players**: at least the minimum, no more than the ring can hold (see *Pre-start ring*), and no more than the mesh cap, 8 for now (Q-3)
- Creating a round produces a round ID
- The proposer shares the round ID by any means outside the game. There is no in-game lobby or discovery
- The round ID alone is enough to join. The proposer's browser stays in the round's room and gives the settings to the first peer who arrives. From then on every peer holds them as part of the shared state, and the proposer can leave
- If the proposer leaves before anyone joins, the round is gone

### Joining

- Anyone with the round ID can join as a **player** or as a **spectator**
- Players are numbered in the order they join
- A player who leaves or disconnects before the countdown is removed from the ring. The remaining players keep their join order and are renumbered 1…N. If the player comes back, they join again at the end
- A player who leaves or disconnects during the countdown keeps their planet, which drifts. The countdown goes on (Q-5)
- A new player's join is refused once the round has its maximum number of players, or once the countdown has started. A returning player is not a new join (see *Disconnects*)
- Spectators can join at any time, including after the round has started, up to 4 per round (Q-3)

### Ready and countdown

- Each player signals they are ready with a **Ready** button
- A Ready expires after a minute, but not during the countdown
- A **10-second countdown** begins when every joined player is ready and at least the minimum number of players have joined
- From the moment they join, before and during the countdown, players can change their planet's rotation rate but can't thrust
- Thrust becomes available when the countdown reaches 0, which starts the round

### Pre-start ring

- Until the round starts, the planets orbit their common center in a ring, held by their mutual gravity
- The ring re-forms each time a player joins
- The ring radius is the same for every round: 0.18 of the arena side, so the planets start near the centre and gravity can be weak (the owner, 2026-10-24; it said "almost fills the arena" before)
- Planets are evenly spaced and numbered in the direction of rotation, so each planet trails its quarry
- The orbital speed is recalculated for the number of planets so the ring stays circular. It rises as players join (see *Appendix: physics checks*)
- The ring is unstable on its own, so a **correction factor** holds it in shape until the countdown reaches 0
- Each planet starts with a default rotation that keeps it pointed at its quarry: it faces its quarry and turns at the ring's rate. After the start, the planet keeps that rate unless its player changes it, so it no longer tracks the quarry
- A lone planet has no quarry, so it starts with no rotation
- Each time a player joins or leaves, every planet's rotation resets to the default
- The largest number of players is the most planets that fit on the ring with a clearance between neighbors (0.03 of the arena side, so 12 planets)

### End of round

- The round **freezes** the moment any player reaches 0 points
- There is no time limit. A round runs until a player reaches 0, however long that takes. Any player of the round can rejoin and hunt its drifting quarry down to 0 to end it
- Each player's final points are credited to their balance. Their net change is final points minus ante
- Everyone, players and spectators alike, sees a **results screen** with final points and balance changes
- The results screen has a **Play again** button. The first press proposes a new round with the same settings and a new round ID, and everyone still on the results screen can join it with one click
- Players in the new round are numbered in the order they join, as usual

## Screens

- **Home**: the player's balance and display name (editable), with **Propose a round** and **Join** (enter a code), and the player's unsettled rounds, each with **Rejoin** (still running) or **Resume** (paused) (Q-6). Opening a `#join=` link skips Home
- **Propose**: set the ante, minimum and maximum. Shows the link and code to share, and asks the proposer to keep the page open until someone joins. The proposer can then play, watch or leave
- **Join**: choose **Play** or **Watch**
- **Pre-start**: the arena with the orbiting ring; a list of players with number, color, name and ready status; the **Ready** button and the rotation buttons; the countdown over the arena
- **Round**: the arena, every player's current points, and the three buttons below the arena for players. Spectators see the arena without buttons
- **Results**: final points and balance changes, with **Play again** and **Home**
- **Settings**: extra relays and the player's own TURN server
- On a phone held upright, the square arena fills the width with the buttons below it. On a desktop, the arena is centered

## Multiplayer

### Stack

The same approach as amorfus:

- Peer-to-peer over WebRTC with Trystero (`@trystero-p2p/nostr`). No game server
- Signaling through public Nostr relays: relay.damus.io, relay.primal.net, nos.lol, relay.snort.social, nostr-pub.wellorder.net, yabu.me/v2. That is amorfus's curated list, except that relay.snort.social and nostr-pub.wellorder.net replace offchain.pub and nostr.bitcoiner.social, which refuse Trystero's per-load keys (C-22; the owner, 2026-10-24). Users can add relays
- STUN: `stun.cloudflare.com:3478` and `stun.l.google.com:19302`
- TURN: none built in. Users can configure their own

### Round ID

The same format as amorfus's join secret:

- 100 random bits; for Play again, 100 bits derived from the previous round ID, so presses at the same moment lead to the same round (Q-8). Written as 20 Crockford base32 characters plus a check character: 21 characters in all
- It is the Trystero room ID
- Shared as a link carrying the ID in the URL fragment (`#join=<round ID>`), which never reaches a server, or typed as the 21-character code
- Displayed in groups of four (`K7QM-2XDP-4TR8-WHZN-3VBC-7`). Typing accepts lowercase, dashes, spaces and Crockford look-alikes (O for 0, I and L for 1)

### Simulation and consensus

- Every peer, players and spectators alike, runs the same simulation
- Each player broadcasts its control inputs, and a hash of its state for its newest final tick, to every other peer. A peer sends its full state only to a peer that asks for it (Q-4)
- When states conflict, the state held by the **majority** of players wins
- The majority is counted among the votes received for that tick
- On a tie, the state with the smallest hash wins: an arbitrary choice, but every peer makes the same one
- Only players vote. Spectators follow the majority state
- Cheating is left to the honor system in the MVP

### Disconnects

- A disconnected player's planet keeps drifting under physics, and it can still win and lose points
- A player who comes back while the round is still running, from the same browser with the same round ID, takes control of their planet again. Peers recognize them by their player ID
- Each browser saves the latest state of any round it's in. If every peer leaves, the round pauses at that state. When a player of the round returns, their browser restores it and play resumes, even if they're alone
- If peers hold different histories of a round, a running round wins over a saved state, and between saved states the later tick wins (Q-7)
- Round results live only on the peers that took part. There is no central record
- A player who misses the end of a round has paid the ante but hasn't received their final points. Their balance is short by those points until they get the result from a peer that has it

### Missed results

A returning player collects a result they missed from the peers, without any server:

- Each peer present at the end of a round becomes a **witness**. It keeps the result (round ID, each player's ID, the ante and final points) and notes which players were disconnected
- A player's browser marks a round **unsettled** when it pays the ante, and settled when it has the result
- While the game is open, the browser rejoins the room of each unsettled round and asks for the result. The first answer settles it (honor system). This doesn't take part in a round that is still running or paused; Home offers **Rejoin** or **Resume** instead (Q-6)
- While the game is open, a witness stays in the room of each round that still has unsettled players, using Trystero's `passive` room mode (0.25.0 and later). A passive room stays dormant until an active peer arrives, and passive peers don't connect to each other, so waiting costs little
- When a returning player settles, it tells the witnesses present, and they stop waiting for that player. A witness drops a result once every player has settled, or after a retention period (30 days, Q-10)
- The common case needs nothing extra: a player who reloads while others are still on the results screen gets the result immediately
- Limitation: the returning player and at least one witness must have the game open at the same time
- Ruled out: publishing results to Nostr relays would remove that limitation, but it would store results outside the peers. Trystero's own signaling uses ephemeral Nostr events (kinds 20000–29999), which relays don't store

## Persistence

- A player's ID is randomly generated, for example a GUID. No accounts, no login
- The ID, display name and balance are stored in the player's browser and persist across visits
- The browser also saves the latest state of any round it's in, so a paused round can resume (see *Disconnects*)
- Clearing browser data, or playing from another browser or device, means a new identity with a balance of 0
- New players start with a balance of 0
- A balance may go negative, so anyone can join any round
- Editing your own balance is left to the honor system in the MVP
- One game tab per browser (Q-16)

## Platform

- JavaScript (TypeScript allowed)
- A fully static site: no backend, no server-side code
- Hosted with Cloudflare Workers static assets for the MVP, like amorfus. Domain **TBD**
- IPFS is not required
- No WebGPU until it's more widely supported
- Desktop and mobile browsers: current Chrome, Edge, Firefox and Safari
- Mobile and touch are in scope. The on-screen buttons below the arena serve as touch controls

## Performance

- 60 fps on mid-range hardware: a mid-range phone, whose reference is a Pixel 8a in Chrome. There is no laptop to test on, so the phone is the only reference device, and desktop browsers are checked in development only (Q-1)
- A round supports at least 8 players and 4 spectators

## Quality

- Readable, modular code with a short README covering how to run, build and deploy
- Automated tests for the non-rendering core: physics, scoring, consensus, round IDs and missed results
- A cross-browser determinism test: the same inputs produce bit-identical states in Chromium, Firefox and WebKit
- No secrets, API keys or tracking

## Out of scope for MVP

- Accounts, login, or any central identity
- An in-game lobby or round discovery
- Server-side storage of balances or results
- Cheat prevention beyond the honor system
- A built-in TURN server
- IPFS
- WebGPU
- Audio beyond optional simple effects
- Chat
- Leaderboards
- Bots or computer-controlled planets

## Acceptance

- `npm install && npm run build` produces a static folder that deploys to Cloudflare Workers static assets
- Three browsers on different machines, at least one of them a phone, can join a round by link and by typed code, mark themselves ready, play to the end, and all see the same results screen with balances updated
- A spectator who joins mid-round sees the same game
- A player who reloads mid-round takes back their planet
- A player who reloads after the end collects the result from a witness
- The determinism test passes in Chromium, Firefox and WebKit
- 60 fps on the reference phone, a Pixel 8a in Chrome, by the frame-time criteria in `docs/acceptance.md` (Q-1)

## First deliverable

A written plan, approved before any code is written, covering rendering, the deterministic simulation, networking and consensus, persistence, build tooling and milestones. It should take *Notes for the plan* into account, and flag any requirement that conflicts with another or looks unrealistic.

## Configuration

Every setting should be easy to change.

| Setting | Value | Notes |
|---|---|---|
| Ready expiry | 60 seconds | |
| Countdown | 10 seconds | |
| Thrust | 0.6 arena sides per second² | Acceleration while thrust is held |
| Ring radius | 0.18 arena sides | The planets start near the centre, which keeps gravity weak (the owner, 2026-10-24) |
| Ring clearance | 0.03 arena sides | Minimum gap between neighbors on the ring; sets the largest number of players (12) |
| Wall energy loss | 20% | Fraction of kinetic energy lost per wall bounce |
| Arena size, planet size and mass, gravitational constant | Arena side 1 (the unit of length); planet radius 0.03; G·m set by a 3-planet ring period of 10 seconds (G·m ≈ 0.004) | Together these set the ring's speed and period. All masses are equal, so only G·m matters |
| Correction factor | 2 | Strength of the pre-start correction |
| Re-arm gap | 1 planet diameter | How far apart a scoring pair's surfaces must get before it can score again (C-16) |
| Maximum rotation rate | 1 turn per second | Must stay above the ring's rotation rate with the most players, so the default rotation fits under it. Must also be at least the orbital rate of two planets almost touching (0.97 turn per second now), so a planet circling another can keep thrusting sideways |
| Rotation acceleration | 2 turns per second² | Holding a rotate button reaches the maximum from rest in half a second |
| Result retention | 30 days (Q-10) | How long witnesses keep a result for absent players |

## Notes for the plan

These aren't requirements. They're findings the implementation plan should account for.

- **Determinism.** Majority voting only works if honest peers compute bit-identical states, and peers will run on different JavaScript engines (V8 in Chrome and Edge, SpiderMonkey in Firefox, JavaScriptCore in Safari). The ECMAScript spec lets `Math.sin`, `Math.cos`, `Math.hypot` and `Math.atan2` differ between engines, while `+ − × ÷` and `Math.sqrt` are exact. The simulation, including the pre-start correction, should use only exact operations, a fixed timestep and a fixed iteration order. Orientation and rotation rate can be whole numbers of fixed steps, with a direction table stored as constants
- **Shared timeline.** Peers can see joins and Readys in different orders, and see the countdown start at different moments. Join order sets planet numbers, so the pre-start phase needs the same agreement as the round itself, and peers need a common tick 0. Likewise, two Play again presses at the same moment must resolve to a single new round, and players returning to a paused round may hold saved states from different ticks
- **Inputs in time.** Every peer needs every player's input for a tick before computing that tick. A small input delay (2 ticks, PLAN A.4) gives inputs time to arrive. A player whose inputs stop arriving drifts, which matches the disconnect rule
- **One contact, one point.** With discrete ticks, two planets can overlap for more than one tick. Count a collision when planets touch while moving toward each other, so one bounce scores once
- **Traffic.** Sending the full state from every player to every peer each tick grows with players × peers. Voting needs only a hash of the state. Only peers that disagree with the majority, and spectators joining mid-round, need the full state
- **Full mesh.** Trystero connects every peer to every other peer. A pair that can't connect directly (strict NAT, no TURN) leaves a gap in the mesh, and Trystero has no fix yet (issue #161, peer-assisted signaling, still open). Peers could forward inputs for such a pair. Spectators add load to every player, so a spectator cap may be needed
- **Trystero version.** amorfus pins 0.25.4 and patches it to cap message reassembly memory. 0.26.0 (2026-10-04) adds built-in receive limits, and the rejoin and slow-join issues amorfus was waiting on (#195, #196) were closed with that release. roslambo can probably start on 0.26.0 without the patch
- **Player ID.** Trystero's `selfId` changes on every page load, so the persistent player ID is a separate value, announced in the room

## Appendix: physics checks

Checked numerically with direct force sums and an N-body simulation in double precision. To reproduce, run `python3 research/physics/ring_check.py`.

### Ring speed

For N planets of mass m, evenly spaced on a circle of radius R, with gravitational constant G:

- Ring radius from the arena: R = L/2 − r − margin, where L is the arena side and r is the planet radius
- Orbital speed: v = √(G·m·S_N / R), where S_N = ¼ · Σ_{k=1}^{N−1} 1 / sin(πk/N)
- The game sums the pulls directly with exact operations, and a test checks that sum against this formula
- Orbital period: T = 2πR / v
- The direct force sum matches this to machine precision for N = 1 to 12
- One planet: v = 0, so it rests on the ring. Two planets: an ordinary binary orbit. Both occur while players are joining
- Speed relative to a 3-planet ring with the same R:

| N | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16 | 20 |
|---|---|---|---|---|---|---|---|---|---|
| Speed | 1.00× | 1.29× | 1.54× | 1.78× | 2.20× | 2.59× | 2.94× | 3.58× | 4.15× |

### Stability

- Without correction, the ring breaks up quickly. A disturbance of a billionth of the radius grows to 10% of the radius within 4.6 orbits for 3 planets and 3.3 orbits for 6
- Even a perfect starting ring, disturbed only by rounding error, is 10% out of round after 7.5 orbits for 3 planets and 5.4 orbits for 6
- A 4× finer timestep gives the same numbers, so this is the physics, not the integrator

### Largest ring

- Neighbors are 2R·sin(π/N) apart. With planet radius r and clearance c, the largest N is ⌊π / arcsin((2r + c) / (2R))⌋
- Examples: r = 0.05R and c = 0.05R allow 41 planets; r = 0.1R and c = 0.05R allow 25
- With planets of a sensible size, this limit is probably far above what a full mesh of browsers can handle

### Repeated collisions

Two planets released at rest, with a gap of one planet diameter, in simulation units:

- Elastic bounces (the MVP rule): the planets fall together and bounce apart at a steady rate, indefinitely (30 contacts in 3 time units). A hunter and quarry held together by gravity keep bouncing, and the hunter gains a point at every bounce until one of them breaks away
- Bounces that lose energy (restitution 0.5 to 0.9): each bounce is smaller and quicker until the pair rests in contact. A simple contact check then registers a collision every tick (about 25,000 to 29,000 in the same 3 time units at 10,000 ticks per unit). Elastic bounces avoid this
