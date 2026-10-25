// A settler or a witness in a round's room (PLAN §8.7, D-19), without a
// timeline. A settler asks each peer for the result, settles on the first
// RESULT that names it, and tells everyone with SETTLED. It notes a peer
// that is still playing the round, so Home can offer Rejoin (Q-6). A
// witness answers RESULT_REQ and passes SETTLED on to its record. Pure.

import * as M from '../protocol/messages';
import { FROZEN } from '../sim/state';
import { commonRefusal, INVALID_LIMIT, type Accepted, type Link, type Refusal, type RoomPeer } from './room-peer';

export interface ResultsPeerConfig {
  me: string;
  name: string;
  build: string;
  roundId: string;
  role: typeof M.ROLE.SETTLER | typeof M.ROLE.WITNESS;
}

export interface ResultsEvents {
  /** Settler: a RESULT naming this player arrived; SETTLED goes out next. */
  onResult?(record: M.ResultRecord): void;
  /** Settler: a result for this round that doesn't name this player: it
   *  ended without it (it left before the countdown). */
  onWithout?(record: M.ResultRecord): void;
  /** Settler: a peer is playing the round (live, not frozen). */
  onRunning?(): void;
  /** Witness: a player acknowledged the result. */
  onSettled?(player: string): void;
}

export class ResultsPeer implements RoomPeer {
  readonly cfg: ResultsPeerConfig;
  /** Witness: the record it holds. */
  record: M.ResultRecord | null = null;
  /** Settler: it has settled. */
  settled = false;
  /** Peers connected now, by transport ID. */
  readonly peers = new Map<string, M.Hello>();
  private readonly link: Link;
  private readonly events: ResultsEvents;
  private readonly invalid = new Map<string, number>();

  constructor(cfg: ResultsPeerConfig, link: Link, events: ResultsEvents = {}) {
    this.cfg = cfg;
    this.link = link;
    this.events = events;
  }

  hello(): M.Hello {
    return {
      type: M.T.HELLO, protocol: M.PROTOCOL_VERSION, build: this.cfg.build, player: this.cfg.me, role: this.cfg.role,
      timeline: M.ZERO_HASH, timelineKind: M.TIMELINE.NONE, phase: 0, finalTick: 0, hash: M.ZERO_HASH,
      holdsResult: this.record !== null, name: this.cfg.name,
    };
  }

  checkHello(hello: M.Hello): Accepted | Refusal {
    const players = new Set([...this.peers.values()].map((h) => h.player));
    return commonRefusal(hello, this.cfg.build, this.cfg.me, (p) => players.has(p)) ?? { ok: true, hello };
  }

  onPeerJoin(peer: string, hello: M.Hello): void {
    this.peers.set(peer, hello);
    if (this.cfg.role !== M.ROLE.SETTLER || this.settled) return;
    if (hello.timelineKind === M.TIMELINE.LIVE && hello.phase !== FROZEN) this.events.onRunning?.();
    else this.link.send(peer, M.encodeResultReq(this.cfg.me));
  }

  onPeerLeave(peer: string): void {
    this.peers.delete(peer);
  }

  onRtt(): void {}

  advance(): void {}

  onMessage(peer: string, bytes: Uint8Array): void {
    if (!this.peers.has(peer)) return;
    const m = M.decode(bytes);
    if (!m) {
      const n = (this.invalid.get(peer) ?? 0) + 1;
      this.invalid.set(peer, n);
      if (n >= INVALID_LIMIT) this.link.drop?.(peer);
      return;
    }
    switch (m.type) {
      case M.T.RESULT_REQ:
        if (this.record) this.link.send(peer, M.encodeResult(this.record));
        break;
      case M.T.RESULT: {
        const r = m.record;
        if (this.cfg.role !== M.ROLE.SETTLER || this.settled || r.round !== this.cfg.roundId) break;
        if (!r.players.some((p) => p.player === this.cfg.me)) {
          this.events.onWithout?.(r);
          break;
        }
        this.settled = true;
        this.events.onResult?.(r);
        this.link.broadcast(M.encodeSettled(this.cfg.me));
        break;
      }
      case M.T.SETTLED:
        this.events.onSettled?.(m.player);
        break;
      default:
        break; // a round's traffic: not for this role
    }
  }
}
