// One room's controller (PLAN §8): HELLO checks and refusals (D-16), the
// map from connections to players, PEERS gossip and forwarding for pairs
// that can't connect (D-14), joining a timeline, merging two (D-12, Q-7),
// resuming a paused round from a saved state (§8.5), answering settlers
// (§8.7), closing connections that misbehave (§9.4), and the local
// player's Play, Ready and Leave. Pure: the caller passes `now` and wires
// a transport to the on… methods.

import { hash64 } from '../sim/hash';
import type { SimParams } from '../sim/params';
import { JOIN, LEAVE, READY, UNREADY } from '../sim/rules';
import { PRESTART, type RoundSettings, type RoundState } from '../sim/state';
import * as M from '../protocol/messages';
import { Timeline, type TimelineConfig } from '../timeline/timeline';
import { commonRefusal, INVALID_LIMIT, type Accepted, type Link, type Refusal, type RoomPeer } from './room-peer';

export type { Accepted, Link, Refusal } from './room-peer';

export interface SessionConfig {
  params: SimParams;
  me: string; // this browser's player ID
  name: string;
  build: string; // D-16
  timeline: Omit<TimelineConfig, 'params' | 'me'>;
  maxSpectators: number;
  forwarding: boolean;
  /** How long a player with a saved state waits for a live round before
   *  resuming its own (§8.5). */
  resumeWaitMs?: number;
}

/** A paused round's state, as this browser saved it (§10). */
export interface SavedTimeline {
  timelineId: string;
  state: RoundState;
  hash: string;
}

interface PeerInfo {
  player: string;
  hello: M.Hello;
  sent: M.Hello; // the HELLO this side sent: merges compare the same pair on both sides
  oneWayMs: number;
  live: boolean; // holds a running timeline: its HELLO said so, or it sends TICKs
  ticks: number[]; // arrival times of its recent TICKs, for the flood limit
  invalid: number;
}

const PEERS_EVERY_MS = 5000;
const JOIN_RETRY_MS = 1000;
const RESUME_WAIT_MS = 6000;
// §9.3: more than 3 TICKs per tick from one sender for 2 s closes the connection.
const FLOOD_WINDOW_MS = 2000;
const FLOOD_PER_TICK = 3;

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

/** D-12: a resumed round's timeline ID, from the save it resumes and the
 *  player who resumes it, so two players resuming apart get two IDs. */
export function resumedTimelineId(savedHash: string, player: string): string {
  return hash64(new TextEncoder().encode(`roslambo resume ${savedHash} ${player}`));
}

export class Session implements RoomPeer {
  readonly cfg: SessionConfig;
  timeline: Timeline;
  /** The local player wants a planet (pressed Play). */
  wantsToPlay = false;
  /** A JOIN became final without a planet: the round was full or had started. */
  refused = false;
  /** A peer pressed Play again (AGAIN, §9.3): the next round exists. */
  againSeen = false;
  /** A paused round's state, until a live round or a better save beats it,
   *  or this browser resumes from it (§8.5, Q-7). */
  saved: SavedTimeline | null = null;
  /** The confirmed result, once there is one: answers RESULT_REQ (§8.7). */
  resultRecord: M.ResultRecord | null = null;
  /** A player acknowledged the result (SETTLED). */
  onSettled: ((player: string) => void) | null = null;
  /** Connections this side closed for misbehaving (§9.4). */
  readonly dropped: string[] = [];

  private readonly link: Link;
  private readonly peers = new Map<string, PeerInfo>(); // by transport peer ID
  private readonly byPlayer = new Map<string, string>(); // player → peer
  private readonly peersOf = new Map<string, Set<string>>(); // player → the players it is connected to
  private peersDirty = true;
  private lastPeersSent = -Infinity;
  private joinAsk = { next: 0, at: -Infinity };
  private joinSentAt = -1; // local tick of the last JOIN, -1 if none pending
  private openedAt = -1;

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

  /** Results screen: tell the room the next round exists (a UI hint). */
  announceAgain(): void {
    if (this.peers.size > 0) this.link.broadcast(M.encodeAgain());
  }

  /** This player has credited the result (§8.2 step 6). */
  announceSettled(): void {
    if (this.peers.size > 0) this.link.broadcast(M.encodeSettled(this.cfg.me));
  }

  /** Drop the timeline and take a peer's again, as on a reload: after the
   *  page was hidden (D-23). Only with a peer to take it from. */
  rejoin(): boolean {
    if (![...this.peers.values()].some((p) => p.live)) return false;
    this.timeline = this.newTimeline();
    this.joinSentAt = -1;
    this.joinAsk = { next: 0, at: -Infinity };
    return true;
  }

  peerCount(): number {
    return this.peers.size;
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
    const base = {
      type: M.T.HELLO, protocol: M.PROTOCOL_VERSION, build: this.cfg.build, player: this.cfg.me, role: this.role(),
      holdsResult: this.resultRecord !== null, name: this.cfg.name,
    } as const;
    if (t.started) {
      return { ...base, timeline: t.id, timelineKind: M.TIMELINE.LIVE, phase: t.final.phase, finalTick: t.finalTick, hash: t.hashAt(t.finalTick) };
    }
    if (this.saved) {
      const s = this.saved;
      return { ...base, timeline: s.timelineId, timelineKind: M.TIMELINE.SAVED, phase: s.state.phase, finalTick: s.state.tick, hash: s.hash };
    }
    return { ...base, timeline: M.ZERO_HASH, timelineKind: M.TIMELINE.NONE, phase: t.final.phase, finalTick: 0, hash: M.ZERO_HASH };
  }

  /** Checks a peer's HELLO; a refusal says why (REFUSE reasons, §9.3). */
  checkHello(hello: M.Hello): Accepted | Refusal {
    const common = commonRefusal(hello, this.cfg.build, this.cfg.me, (p) => this.byPlayer.has(p));
    if (common) return common;
    if (hello.role === M.ROLE.SPECTATOR) {
      let spectators = 0;
      for (const p of this.peers.values()) if (p.hello.role === M.ROLE.SPECTATOR) spectators++;
      if (spectators >= this.cfg.maxSpectators) return { ok: false, reason: M.REFUSAL.SPECTATORS_FULL };
    }
    return { ok: true, hello };
  }

  /** A connection completed the handshake: `sent` is what this side said. */
  onPeerJoin(peer: string, hello: M.Hello, sent: M.Hello): void {
    this.peers.set(peer, { player: hello.player, hello, sent, oneWayMs: 0, live: hello.timelineKind === M.TIMELINE.LIVE, ticks: [], invalid: 0 });
    this.byPlayer.set(hello.player, peer);
    this.peersDirty = true;
    // D-12, Q-7: if the peer's history wins over the one this side
    // announced, drop ours: take theirs now if it is live, or once it is.
    if (sent.timelineKind !== M.TIMELINE.NONE && hello.timeline !== sent.timeline && beats(hello, sent)) {
      this.saved = null;
      if (this.timeline.started) this.timeline = this.newTimeline();
      this.joinSentAt = -1;
      this.joinAsk = { next: 0, at: -Infinity };
      if (hello.timelineKind === M.TIMELINE.LIVE) this.timeline.requestState(peer);
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

  /** Players connected now, not settlers or witnesses: PEERS lists these. */
  connectedPlayers(): string[] {
    return [...this.peers.values()].filter((p) => !isResultsRole(p.hello.role)).map((p) => p.player);
  }

  // ---- messages ----

  private drop(peer: string): void {
    this.dropped.push(peer);
    this.onPeerLeave(peer);
    this.link.drop?.(peer);
  }

  /** §9.3: more than 3 TICKs per tick, sustained for 2 s. */
  private flooding(info: PeerInfo, now: number): boolean {
    info.ticks.push(now);
    while (info.ticks.length > 0 && info.ticks[0]! < now - FLOOD_WINDOW_MS) info.ticks.shift();
    const limit = FLOOD_PER_TICK * this.cfg.params.settings.tickRate * (FLOOD_WINDOW_MS / 1000);
    return info.ticks.length > limit && now - info.ticks[0]! >= FLOOD_WINDOW_MS * 0.9;
  }

  onMessage(peer: string, bytes: Uint8Array, now: number): void {
    const info = this.peers.get(peer);
    if (!info) return; // not through the handshake: dropped (§9.4)
    const m = M.decode(bytes);
    if (!m) {
      if (++info.invalid >= INVALID_LIMIT) this.drop(peer);
      return;
    }
    switch (m.type) {
      case M.T.TICK:
        if (this.flooding(info, now)) {
          this.drop(peer);
          return;
        }
        info.live = true;
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
        info.live = true;
        if (!this.timeline.started) this.saved = null; // a live round beats a save (Q-7)
        this.timeline.onState(m, info.oneWayMs, now);
        break;
      case M.T.AGAIN:
        this.againSeen = true;
        break;
      case M.T.RESULT_REQ:
        if (this.resultRecord) this.link.send(peer, M.encodeResult(this.resultRecord));
        break;
      case M.T.SETTLED:
        this.onSettled?.(m.player);
        break;
      default:
        break; // RESULT: for settlers (ResultsPeer)
    }
  }

  /** D-14: for each neighbour B that can't reach the TICK's origin A, the
   *  peer with the smallest player ID connected to both forwards it. */
  private forward(origin: string, fromPeer: string, tickBytes: Uint8Array): void {
    const originPeers = this.peersOf.get(origin);
    let fwd: Uint8Array | null = null;
    for (const [peer, info] of this.peers) {
      if (peer === fromPeer || isResultsRole(info.hello.role)) continue;
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
    if (this.openedAt < 0) this.openedAt = now;
    const t = this.timeline;
    if (!t.started) {
      if (this.shouldResume(now)) this.resume(now);
      else this.askToJoin(now);
    }
    this.timeline.advance(now);
    if (this.timeline.started && this.wantsToPlay) this.joinOrGiveUp();
    if (this.peersDirty || now - this.lastPeersSent >= PEERS_EVERY_MS) {
      this.peersDirty = false;
      this.lastPeersSent = now;
      if (this.peers.size > 0) this.link.broadcast(M.encodePeers(this.connectedPlayers()));
    }
  }

  /** §8.5: a player with a save, after the wait, with no live round in
   *  sight and no better save connected, resumes from its own. */
  private shouldResume(now: number): boolean {
    if (!this.saved || !this.wantsToPlay) return false;
    if (now - this.openedAt < (this.cfg.resumeWaitMs ?? RESUME_WAIT_MS)) return false;
    const mine = this.hello();
    for (const p of this.peers.values()) if (p.live || beats(p.hello, mine)) return false;
    return true;
  }

  private resume(now: number): void {
    const s = this.saved!;
    this.saved = null;
    this.timeline.resume(now, s.state, resumedTimelineId(s.hash, this.cfg.me));
  }

  /** Without a timeline: ask the live peer whose timeline wins, then the next. */
  private askToJoin(now: number): void {
    if (now - this.joinAsk.at < JOIN_RETRY_MS) return;
    const holders = [...this.peers].filter(([, p]) => p.live)
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

function isResultsRole(role: number): boolean {
  return role === M.ROLE.SETTLER || role === M.ROLE.WITNESS;
}
