# roslambo — Requirements (MVP)

Bumper planet rock, paper, scissors: a browser-based, peer-to-peer multiplayer
game. Each player flies one planet in a shared arena. Planets bump into each
other, and a cyclic rock-paper-scissors rule decides who wins points from whom.

Values marked **TBD** are configuration still to be chosen. Open design
questions are collected at the end.

## Glossary

- **Round**: one game, from proposal to results screen.
- **Proposer**: the person who creates a round. They are not necessarily a player in it.
- **Player**: a participant who flies a planet in a round.
- **Spectator**: a participant who watches a round without a planet.
- **Planet number**: a player's position 1…N in the round, assigned in join order.
- **Quarry**: the planet you beat. Planet *i*'s quarry is planet *i+1*, and planet N's quarry is planet 1.
- **Hunter**: the planet that beats you. Planet *i*'s hunter is planet *i−1*, and planet 1's hunter is planet N.
- **Ante**: the points each player brings into a round, paid from their balance.
- **Balance**: a player's running point total across rounds.
- **Round ID**: the secret that identifies a round and is used to join it.

## Identity and balance

- A player's ID is a randomly generated value, such as a GUID. There are no accounts or logins.
- The ID and the balance are stored in the player's browser and persist across visits.
- New players start with a balance of 0.
- A balance may go negative, so anyone can join a round regardless of balance.
- Cheating, such as editing your own balance, is handled on the honor system in the MVP.

## Proposing and joining a round

- A proposer creates a round and specifies:
  - the **ante**, which can differ from round to round;
  - the **minimum players**, which must be at least 3;
  - the **maximum players**, which can't exceed the geometric limit (see *Pre-start ring*).
- Creating a round produces a round ID. Like amorfus, it can be shared as a link or as a 21-character code.
- The proposer shares the round ID by any means outside the game. There is no in-game lobby or discovery.
- Anyone with the round ID can join as a **player** or as a **spectator**.
- Players are numbered in the order they join.
- A player's join is refused when the round has reached its maximum player count, or once the countdown has started.
- Spectators can join at any time, including after the round has started.

## Ready and countdown

- Each player indicates they are ready by pressing a **Ready** button.
- A Ready expires after about a minute (**TBD**), except during the countdown.
- A **10-second countdown** begins when:
  - every joined player is ready, and
  - the number of players is at least the minimum.
- Players have no control of their planets until the countdown reaches 0.
- When the countdown reaches 0, the round starts.

## Pre-start ring

Before the round starts, the planets orbit a common center in a ring, held
together by their mutual gravity.

- All planets have the same fixed mass *m* and the same fixed size (radius *r*).
- The ring radius *R* is fixed, so the ring almost fills the arena. The margin between the ring and the walls is **TBD**.
- Planets sit evenly spaced on the ring and are numbered in the direction of rotation, so each planet trails its quarry.
- The ring re-forms each time a player joins.
- The orbital speed is recalculated for the current N. The speed that keeps N equal masses in a circular orbit of radius *R* is:

  v = √(G·m·S_N / R), where S_N = ¼ · Σ_{k=1}^{N−1} 1 / sin(πk/N)

  S_N grows a little faster than N, so the ring spins faster as players join.
- A ring of equal masses with no heavy central body is unstable, so a **correction factor** holds the ring in place until the countdown reaches 0.
- **Geometric player limit:** neighbors on the ring are 2R·sin(π/N) apart. The largest allowed N is the largest one for which that spacing is at least 2r plus a clearance (**TBD**).

## Gameplay

### Controls

- Each planet shows its orientation.
- There are three controls:
  - **Thrust forward**: `W`
  - **Rotate left**: `A`
  - **Rotate right**: `D`
- The same three controls are also available as on-screen buttons below the arena.

### Physics

- Mutual gravity between all planets acts at all times, both before and after the start.
- Planets bounce off each other. Planet-to-planet bounces may lose energy; the amount is configurable (**TBD**).
- Planets bounce off the arena walls and lose a fraction of their energy (**TBD**), which keeps speeds from growing without limit.

### Arena

- The arena is a square of fixed size.
- The design should not depend heavily on the square shape, so that the arena shape can change later.

### Scoring

- At the start of a round, each player pays the ante from their balance. The ante becomes their starting points.
- When two planets collide:
  - If one is the other's hunter, the hunter gains 1 point and the quarry loses 1 point.
  - Otherwise, no points change hands. This includes planets that aren't adjacent in the cycle, such as planets 1 and 3 out of 4.
- Every collision is a bounce, whether or not points change hands.
- Points are zero-sum within a round.

### End of round

- The round ends and **freezes** the moment any player reaches 0 points.
- Each player's final points are credited back to their balance. A player's net change is their final points minus the ante.
- Everyone, players and spectators alike, sees a **results screen** with final points and balance changes.

## Networking

The networking copies the amorfus project's approach.

- **Peer-to-peer** via WebRTC, using Trystero (`@trystero-p2p/nostr`). There is no game server.
- **Signaling** goes through public Nostr relays, using the same curated list as amorfus. Users can add their own relays.
- **STUN:** `stun.cloudflare.com:3478` and `stun.l.google.com:19302`.
- **TURN:** none built in. Users can configure their own TURN server.
- The **round ID** is the Trystero room ID.

### Simulation and consensus

- Every peer runs the same simulation.
- Each peer broadcasts its state for the previous tick, plus its own control inputs, to every other peer.
- On a conflict, the state held by the **majority** of peers wins.
- Spectators vote in the majority (*provisional*).
- Implementation note: to keep conflicts rare, the simulation should be deterministic across browsers. For example, avoid engine-dependent `Math.sin` and `Math.cos` for thrust direction.

### Disconnects

- A disconnected player's planet keeps drifting under physics. It can still win and lose points.
- Round results are kept only on the peers that took part. There is no central record.
- A disconnected player's balance is updated only if they later reach a peer that has the record of the round's end.

## Configuration (TBD)

| Setting | Notes |
|---|---|
| Ready expiry | About 1 minute |
| Ring margin from walls | The ring should almost fill the arena |
| Planet clearance on ring | Sets the maximum N |
| Wall energy loss fraction | |
| Planet–planet energy loss | |
| Gravitational constant *G*, mass *m*, planet radius *r*, arena size | |
| Correction factor (pre-start ring) | |

## Open questions

- How a returning player looks for a round result they missed. To be investigated; simple solutions preferred.
- The detailed flow between rounds after the results screen.
- Spectator voting in the majority is provisional.
