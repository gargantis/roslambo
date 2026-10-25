// One room's controller (PLAN §8): HELLO checks and refusals (D-16), the
// map from connections to players, PEERS gossip and forwarding for pairs
// that can't connect (D-14), joining a timeline, merging two (D-12, Q-7),
// and the local player's Play, Ready and Leave. Pure: the caller passes
// `now` and wires a transport to the on… methods.

import type { SimParams } from '../sim/params';
import { JOIN, LEAVE, READY, UNREADY } from '../sim/rules';
import { PRESTART, type RoundSettings } from '../sim/state';
import * as M from '../protocol/messages';
import { Timeline, type TimelineConfig } from '../timeline/timeline';

export interface SessionConfig {
  params: SimParams;
  me: string; // this browser's player ID
  name: string;
  build: string; // D-16
  timeline: Omit<TimelineConfig, 'params' | 'me'>;
  maxSpectators: number;
  forwarding: boolean;
}

/** What the session needs from a transport. */
export interface Link {
  send(peer: string, bytes: Uint8Array): void;
  broadcast(bytes: Uint8Array): void;
}

interface PeerInfo {
  player: string;
  hello: M.Hello;
  sent: M.Hello; // the HELLO this side sent: merges compare the same pair on both sides
  oneWayMs: number;
}

export type Refusal = { ok: false; reason: number };
export type Accepted = { ok: true; hello: M.Hello };

const PEERS_EVERY_MS = 5000;
const JOIN_RETRY_MS = 1000;

/** D-12, Q-7: which of two timelines a room keeps. A live round beats a
 *  saved state; then the later final tick (the older timeline); then the
 *  smaller hash, then the smaller ID. A missing timeline loses to any. */
export function beats(a: M.Hello, b: M.Hello): boolean {
  if (a.timelineKind === M.TIMELINE.NONE) return false;
  if (b.timelineKind === M.TIMELINE.NONE) return true;
  if (a.timelineKind !== b.timelineKind) return a.timelineKind === M.TIMELINE.LIVE;
  if (a.finalTick !== b.finalTick) return a.finalTick > b.finalTick;
  if (a.hash !== b.hash) return a.hash < b.hash;
  return a.timeline < b.timeline;
}

export class Session {
  readonly cfg: SessionConfig;
  timeline: Timeline;
  /** The local player wants a planet (pressed Play). */
  wantsToPlay = false;
  /** A JOIN became final without a planet: the round was full or had started. */
  refused = false;
  /** Per-message counts of malformed input, by peer (§9.4). */
  readonly invalid = new Map<string, number>();

  private readonly link: Link;
  private readonly peers = new Map<string, PeerInfo>(); // by transport peer ID
  private readonly byPlayer = new Map<string, string>(); // player → peer
  private readonly peersOf = new Map<string, Set<string>>(); // player → the players it is connected to
  private peersDirty = true;
  private lastPeersSent = -Infinity;
  private joinAsk = { next: 0, at: -Infinity };
  private joinSentAt = -1; // local tick of the last JOIN, -1 if none pending

  constructor(cfg: SessionConfig, link: Link) {
    this.cfg = cfg;
    this.link = link;
    this.timeline = this.newTimeline();
  }

  private newTimeline(): Timeline {
    const t = new Timeline({ ...this.cfg.timeline, params: this.cfg.params, me: this.cfg.me }, {
      broadcast: (b) => this.link.broadcast(b),
      sendToPlayer: (player, b) => {
        const peer = this.byPlayer.get(player);
        if (peer === undefined) return false;
        this.link.send(peer, b);
        return true;
      },
      sendToPeer: (peer, b) => this.link.send(peer, b),
    });
    if (this.timeline) {
      t.sending = this.timeline.sending;
      t.controls = this.timeline.controls;
    }
    return t;
  }

  // ---- the local player ----

  /** The proposer's browser: tick 0 of a new round, now (§8.2). */
  propose(now: number, settings: RoundSettings, timelineId: string): void {
    this.timeline.start(now, settings, timelineId);
  }

  play(): void {
    this.wantsToPlay = true;
    this.refused = false;
    this.timeline.sending = true;
    this.joinSentAt = -1; // advance() sends the JOIN once a timeline is held
  }

  ready(on = true): void {
    this.timeline.queueEvent(on ? READY : UNREADY);
  }

  leave(): void {
    this.wantsToPlay = false;
    if (this.inRoster()) this.timeline.queueEvent(LEAVE);
  }

  inRoster(): boolean {
    return this.timeline.final.planets.some((p) => p.id === this.cfg.me);
  }

  role(): number {
    if (this.wantsToPlay) return M.ROLE.PLAYER;
    return this.timeline.started && this.peers.size === 0 ? M.ROLE.KEEPER : M.ROLE.SPECTATOR;
  }

  // ---- handshake (D-16) ----

  hello(): M.Hello {
    const t = this.timeline;
    return {
      type: M.T.HELLO, protocol: M.PROTOCOL_VERSION, build: this.cfg.build, player: this.cfg.me, role: this.role(),
      timeline: t.started ? t.id : M.ZERO_HASH, timelineKind: t.started ? M.TIMELINE.LIVE : M.TIMELINE.NONE,
      phase: t.final.phase, finalTick: t.finalTick, hash: t.started ? t.hashAt(t.finalTick) : M.ZERO_HASH,
      holdsResult: false, name: this.cfg.name,
    };
  }

  /** Checks a peer's HELLO; a refusal says why (REFUSE reasons, §9.3). */
  checkHello(hello: M.Hello): Accepted | Refusal {
    if (hello.protocol !== M.PROTOCOL_VERSION) return { ok: false, reason: M.REFUSAL.PROTOCOL };
    if (hello.build !== this.cfg.build) return { ok: false, reason: M.REFUSAL.BUILD };
    if (hello.player === this.cfg.me || this.byPlayer.has(hello.player)) return { ok: false, reason: M.REFUSAL.DUPLICATE };
    if (hello.role === M.ROLE.SPECTATOR) {
      let spectators = 0;
      for (const p of this.peers.values()) if (p.hello.role === M.ROLE.SPECTATOR) spectators++;
      if (spectators >= this.cfg.maxSpectators) return { ok: false, reason: M.REFUSAL.SPECTATORS_FULL };
    }
    return { ok: true, hello };
  }

  /** A connection completed the handshake: `sent` is what this side said. */
  onPeerJoin(peer: string, hello: M.Hello, sent: M.Hello): void {
    this.peers.set(peer, { player: hello.player, hello, sent, oneWayMs: 0 });
    this.byPlayer.set(hello.player, peer);
    this.peersDirty = true;
    // D-12: if the peer's timeline wins over the one this side announced,
    // drop ours and take theirs.
    if (sent.timelineKind !== M.TIMELINE.NONE && hello.timeline !== sent.timeline && beats(hello, sent)) {
      this.timeline = this.newTimeline();
      this.joinSentAt = -1;
      this.timeline.requestState(peer);
      this.joinAsk = { next: 0, at: -Infinity };
    }
  }

  onPeerLeave(peer: string): void {
    const info = this.peers.get(peer);
    if (!info) return;
    this.peers.delete(peer);
    if (this.byPlayer.get(info.player) === peer) this.byPlayer.delete(info.player);
    this.peersOf.delete(info.player);
    this.peersDirty = true;
  }

  onRtt(peer: string, ms: number): void {
    const info = this.peers.get(peer);
    if (!info) return;
    info.oneWayMs = ms / 2;
    this.timeline.setOneWay(info.player, ms / 2);
  }

  connectedPlayers(): string[] {
    return [...this.peers.values()].map((p) => p.player);
  }

  // ---- messages ----

  onMessage(peer: string, bytes: Uint8Array, now: number): void {
    const info = this.peers.get(peer);
    if (!info) return; // not through the handshake: dropped (§9.4)
    const m = M.decode(bytes);
    if (!m) {
      this.invalid.set(peer, (this.invalid.get(peer) ?? 0) + 1);
      return;
    }
    switch (m.type) {
      case M.T.TICK:
        this.timeline.onTick(info.player, m, now);
        if (this.cfg.forwarding) this.forward(info.player, peer, bytes);
        break;
      case M.T.FWD:
        this.timeline.onTick(m.origin, m.tick, now);
        break;
      case M.T.PEERS:
        this.peersOf.set(info.player, new Set(m.players));
        break;
      case M.T.STATE_REQ:
        this.timeline.onStateReq(peer, m, now);
        break;
      case M.T.STATE:
        if (this.timeline.started && m.timeline !== this.timeline.id) break; // another timeline's: merging goes through HELLO
        this.timeline.onState(m, info.oneWayMs, now);
        break;
      default:
        break; // AGAIN, RESULT_REQ, RESULT, SETTLED: later milestones
    }
  }

  /** D-14: for each neighbour B that can't reach the TICK's origin A, the
   *  peer with the smallest player ID connected to both forwards it. */
  private forward(origin: string, fromPeer: string, tickBytes: Uint8Array): void {
    const originPeers = this.peersOf.get(origin);
    let fwd: Uint8Array | null = null;
    for (const [peer, info] of this.peers) {
      if (peer === fromPeer) continue;
      const b = info.player;
      const bPeers = this.peersOf.get(b);
      if (!bPeers || !originPeers) continue; // not known yet: assume a full mesh
      if (bPeers.has(origin) || originPeers.has(b)) continue;
      let forwarder = this.cfg.me;
      for (const [x, xPeers] of this.peersOf) {
        if (x < forwarder && this.byPlayer.has(x) && xPeers.has(origin) && xPeers.has(b)) forwarder = x;
      }
      if (forwarder !== this.cfg.me) continue;
      fwd ??= M.encodeFwd(origin, tickBytes);
      this.link.send(peer, fwd);
    }
  }

  // ---- time ----

  advance(now: number): void {
    const t = this.timeline;
    if (!t.started) this.askToJoin(now);
    t.advance(now);
    if (t.started && this.wantsToPlay) this.joinOrGiveUp();
    if (this.peersDirty || now - this.lastPeersSent >= PEERS_EVERY_MS) {
      this.peersDirty = false;
      this.lastPeersSent = now;
      if (this.peers.size > 0) this.link.broadcast(M.encodePeers(this.connectedPlayers()));
    }
  }

  /** Without a timeline: ask the peer whose timeline wins, then the next. */
  private askToJoin(now: number): void {
    if (now - this.joinAsk.at < JOIN_RETRY_MS) return;
    const holders = [...this.peers].filter(([, p]) => p.hello.timelineKind !== M.TIMELINE.NONE)
      .sort(([, a], [, b]) => (beats(a.hello, b.hello) ? -1 : beats(b.hello, a.hello) ? 1 : 0));
    if (holders.length === 0) return;
    const [peer] = holders[this.joinAsk.next++ % holders.length]!;
    this.joinAsk.at = now;
    this.timeline.requestState(peer);
  }

  /** Send JOIN once, and again if it was lost; give up if the round won't
   *  take another planet. */
  private joinOrGiveUp(): void {
    const t = this.timeline;
    if (this.inRoster()) {
      this.joinSentAt = -1;
      this.refused = false;
      return;
    }
    const full = t.final.planets.length >= t.final.maxPlayers;
    if (t.final.phase !== PRESTART || full) {
      // No JOIN can succeed now; one already sent gets until it is final.
      if (this.joinSentAt < 0 || t.finalTick > this.joinSentAt + t.cfg.delay) {
        this.refused = true;
        this.wantsToPlay = false;
        t.sending = false;
      }
      return;
    }
    if (this.joinSentAt < 0 || t.finalTick > this.joinSentAt + t.cfg.delay + 30) {
      t.queueEvent(JOIN, this.cfg.name);
      this.joinSentAt = t.localTick;
    }
  }
}
