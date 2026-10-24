# roslambo: Requirements

Bumper planet rock, paper, scissors: a browser-based, peer-to-peer multiplayer game.

Status: draft from the requirements discussion of 2026-10-24. **TBD** marks a value not yet chosen. *Proposed* marks a suggestion that still needs a decision. After the requirements come the open questions, notes for the implementation plan, and the physics checks behind the formulas.

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
- **Witness** (*proposed*): a peer that was present when a round ended and keeps its result

## Gameplay (MVP)

### Planets and arena

- All planets have the same fixed mass and the same fixed size
- Each planet shows its orientation
- The arena is a fixed-size square. The design should not depend on the square shape, so the shape can change later

### Controls

- Three controls: **thrust forward** (`W`), **rotate left** (`A`), **rotate right** (`D`)
- The same three controls are available as on-screen buttons below the arena

### Physics

- Mutual gravity between all planets acts at all times: before, during and after the countdown
- Planets bounce off each other, and these bounces may lose energy (amount **TBD**)
- Planets bounce off the walls and lose a fraction of their energy (**TBD**), so speeds can't grow without limit

### Scoring

- At the start of a round, each player pays the ante from their balance. The ante is their starting points
- When a planet collides with its quarry, the planet gains 1 point and the quarry loses 1 point
- Any other collision changes no points, including collisions between planets that aren't neighbors in the cycle (such as 1 and 3 of 4)
- Every collision is a bounce, whether or not points change hands
- Points are zero-sum within a round
- What counts as one collision is still open (see *Open questions*)

## Rounds

### Proposing

- A proposer creates a round and sets:
  - the **ante**: a whole number, at least 1; it can differ from round to round
  - the **minimum players**: at least 3
  - the **maximum players**: at least the minimum, and no more than the ring can hold (see *Pre-start ring*)
- Creating a round produces a round ID
- The proposer shares the round ID by any means outside the game. There is no in-game lobby or discovery

### Joining

- Anyone with the round ID can join as a **player** or as a **spectator**
- Players are numbered in the order they join
- A player's join is refused once the round has its maximum number of players, or once the countdown has started
- Spectators can join at any time, including after the round has started

### Ready and countdown

- Each player signals they are ready with a **Ready** button
- A Ready expires after about a minute (**TBD**), but not during the countdown
- A **10-second countdown** begins when every joined player is ready and at least the minimum number of players have joined
- Players can't control their planets until the countdown reaches 0, which starts the round

### Pre-start ring

- Until the round starts, the planets orbit their common center in a ring, held by their mutual gravity
- The ring re-forms each time a player joins
- The ring radius is the same for every round and almost fills the arena (margin **TBD**)
- Planets are evenly spaced and numbered in the direction of rotation, so each planet trails its quarry
- The orbital speed is recalculated for the number of planets so the ring stays circular. It rises as players join (see *Appendix: physics checks*)
- The ring is unstable on its own, so a **correction factor** holds it in shape until the countdown reaches 0
- The largest number of players is the most planets that fit on the ring with a clearance between neighbors (**TBD**)

### End of round

- The round **freezes** the moment any player reaches 0 points
- Each player's final points are credited to their balance. Their net change is final points minus ante
- Everyone, players and spectators alike, sees a **results screen** with final points and balance changes
- The flow between rounds is **TBD**

## Multiplayer

### Stack

The same approach as amorfus:

- Peer-to-peer over WebRTC with Trystero (`@trystero-p2p/nostr`). No game server
- Signaling through public Nostr relays, using amorfus's curated list: relay.damus.io, relay.primal.net, nos.lol, offchain.pub, nostr.bitcoiner.social, yabu.me/v2. Users can add relays
- STUN: `stun.cloudflare.com:3478` and `stun.l.google.com:19302`
- TURN: none built in. Users can configure their own

### Round ID

The same format as amorfus's join secret:

- 100 random bits, written as 20 Crockford base32 characters plus a check character: 21 characters in all
- It is the Trystero room ID
- Shared as a link carrying the ID in the URL fragment (`#join=<round ID>`), which never reaches a server, or typed as the 21-character code
- Displayed in groups of four (`K7QM-2XDP-4TR8-WHZN-3VBC-7`). Typing accepts lowercase, dashes, spaces and Crockford look-alikes (O for 0, I and L for 1)

### Simulation and consensus

- Every peer, players and spectators alike, runs the same simulation
- Each peer broadcasts its state for the previous tick and its own control inputs to every other peer
- When states conflict, the state held by the **majority** of peers wins
- Spectators vote (*provisional*)
- Cheating is left to the honor system in the MVP

### Disconnects

- A disconnected player's planet keeps drifting under physics, and it can still win and lose points
- Round results live only on the peers that took part. There is no central record
- A player who misses the end of a round has paid the ante but hasn't received their final points. Their balance is short by those points until they get the result from a peer that has it

### Missed results (*proposed*)

A simple way for a returning player to collect a result, using only peers:

- Each peer present at the end of a round becomes a **witness**. It keeps the result (round ID, each player's ID, the ante and final points) and notes which players were disconnected
- A player's browser marks a round **unsettled** when it pays the ante, and settled when it has the result
- While the game is open, the browser rejoins the room of each unsettled round and asks for the result. The first answer settles it (honor system)
- While the game is open, a witness stays in the room of each round that still has unsettled players, using Trystero's `passive` room mode (0.25.0 and later). A passive room stays dormant until an active peer arrives, and passive peers don't connect to each other, so waiting costs little
- When a returning player settles, it tells the witnesses present, and they stop waiting for that player. A witness drops a result once every player has settled, or after a retention period (**TBD**)
- The common case needs nothing extra: a player who reloads while others are still on the results screen gets the result immediately
- Limitation: the returning player and at least one witness must have the game open at the same time
- Not proposed: publishing results to Nostr relays would remove that limitation, but it would store results outside the peers. Trystero's own signaling uses ephemeral Nostr events (kinds 20000–29999), which relays don't store

## Persistence

- A player's ID is randomly generated, for example a GUID. No accounts, no login
- The ID and balance are stored in the player's browser and persist across visits
- Clearing browser data, or playing from another browser or device, means a new identity with a balance of 0
- New players start with a balance of 0
- A balance may go negative, so anyone can join any round
- Editing your own balance is left to the honor system in the MVP

## Configuration (TBD)

| Setting | Notes |
|---|---|
| Ready expiry | About 1 minute |
| Ring margin | Gap between the ring and the walls; the ring should almost fill the arena |
| Ring clearance | Minimum gap between neighbors on the ring; sets the largest number of players |
| Wall energy loss | Fraction of energy lost per wall bounce |
| Planet energy loss | Energy lost per planet–planet bounce |
| Arena size, planet size and mass, gravitational constant | Together these set the ring's speed and period |
| Correction factor | Strength of the pre-start correction |
| Result retention (*proposed*) | How long witnesses keep a result for absent players |

## Open questions

1. **What counts as one collision for scoring?** Gravity keeps pulling two planets back together after they bounce. In the physics check, two planets released near each other bounce at a steady rate forever when bounces are elastic. When bounces lose energy, the pair bounces faster and faster until it rests in contact, and a simple contact check then scores a point every tick. Possible rules: score only above a minimum impact speed; score a pair at most once until they separate by some distance or a cooldown passes; or both
2. **Where do a round's settings live?** Joiners need the ante, minimum and maximum. A typed code carries only the round ID, so either the proposer stays connected until someone else holds the settings, or the settings travel in the link
3. **Returning mid-round:** can a disconnected player who comes back while the round is still running take control of their planet again?
4. **Leaving before the countdown:** is the player removed from the ring, and do later players' numbers shift down to close the gap?
5. **No majority:** what happens when no state has a majority, such as 2 against 2 or three different states? Is the majority counted among all peers in the round, or only those heard from for that tick?
6. **Labels:** how are players identified in the arena and on the results screen: planet number, color, a chosen name?
7. **Missed results:** accept, change or replace the proposal above
8. **Flow between rounds** after the results screen
9. **Spectator voting** is provisional
10. **Sections that amorfus's requirements have and roslambo's don't yet:** platform (language, static hosting, IPFS, supported browsers, touch devices), performance targets, quality (tests, README), how many players and spectators a round must support, what's out of scope, acceptance criteria, and whether the first deliverable is a plan

## Notes for the plan

These aren't requirements. They're findings the implementation plan should account for.

- **Determinism.** Majority voting only works if honest peers compute bit-identical states. The ECMAScript spec lets `Math.sin`, `Math.cos`, `Math.hypot` and `Math.atan2` differ between engines, while `+ − × ÷` and `Math.sqrt` are exact. The simulation, including the pre-start correction, should use only exact operations, a fixed timestep and a fixed iteration order. Orientation can be a whole number of fixed steps, with a direction table stored as constants
- **Shared timeline.** Peers can see joins and Readys in different orders, and see the countdown start at different moments. Join order sets planet numbers, so the pre-start phase needs the same agreement as the round itself, and peers need a common tick 0
- **Inputs in time.** Every peer needs every player's input for a tick before computing that tick. A small input delay (**TBD**) gives inputs time to arrive. A player whose inputs stop arriving drifts, which matches the disconnect rule
- **Traffic.** Sending the full state from every peer to every peer each tick grows with the square of the number of peers. Voting needs only a hash of the state. Only peers on the losing side of a vote need the full state
- **Full mesh.** Trystero connects every peer to every other peer. A pair that can't connect directly (strict NAT, no TURN) leaves a gap in the mesh, and Trystero has no fix yet (issue #161, peer-assisted signaling, still open). Peers could forward inputs for such a pair. Spectators add load to every player, so a spectator cap may be needed
- **Trystero version.** amorfus pins 0.25.4 and patches it to cap message reassembly memory. 0.26.0 (2026-10-04) adds built-in receive limits, and the rejoin and slow-join issues amorfus was waiting on (#195, #196) were closed with that release. roslambo can probably start on 0.26.0 without the patch
- **Player ID.** Trystero's `selfId` changes on every page load, so the persistent player ID is a separate value, announced in the room

## Appendix: physics checks

Checked numerically with direct force sums and an N-body simulation in double precision.

### Ring speed

For N planets of mass m, evenly spaced on a circle of radius R, with gravitational constant G:

- Ring radius from the arena: R = L/2 − r − margin, where L is the arena side and r is the planet radius
- Orbital speed: v = √(G·m·S_N / R), where S_N = ¼ · Σ_{k=1}^{N−1} 1 / sin(πk/N)
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

- Elastic bounces: the planets fall together and bounce apart at a steady rate, indefinitely (30 contacts in 3 time units)
- Bounces that lose energy (restitution 0.5 to 0.9): each bounce is smaller and quicker until the pair rests in contact. A simple contact check then registers a collision every tick (about 25,000 to 29,000 in the same 3 time units at 10,000 ticks per unit)
