// The frame-time bench's room (Q-1, M4): virtual players on the same page,
// so the reference phone can be measured without a network or other
// devices. Each sends real TICK bytes, with its own latency and jitter, so
// the page decodes, predicts and rolls back as in a real round. Its
// buttons are the golden scripts' (scriptButtons), not a bot.

import { config } from '../config';
import * as M from '../core/protocol/messages';
import type { Session } from '../core/session/session';
import { JOIN, READY } from '../core/sim/rules';
import { scriptButtons } from '../core/sim/scripts';
import { mulberry32 } from '../net/loopback';
import type { Transport } from '../ui/game';

export interface VirtualRoomOptions {
  players: number; // virtual players
  seed: number;
  latencyMs: [number, number]; // one-way, the range peers are spread over
  jitterMs: number;
  build: string;
}

interface Peer {
  k: number;
  id: string;
  peerId: string;
  latency: number;
  joinAt: number; // the local tick it starts sending at
  next: number; // the next local tick to send for
  joinTick: number; // the tick of its JOIN, −1 before
  readyTick: number; // the tick of its READY, −1 before
  buttons: Map<number, number>;
  queue: { at: number; bytes: Uint8Array }[];
  lastAt: number;
}

const EVENT_REPEAT_TICKS = 60; // past the late window, so every event lands
const READY_AFTER_TICKS = 120;

export class VirtualRoom implements Transport {
  readonly refusedBy = null;
  sentBytes = 0;
  private readonly session: Session;
  private readonly peers: Peer[] = [];
  private readonly seed: number;
  private readonly rand: () => number;
  private readonly jitter: number;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(session: Session, o: VirtualRoomOptions) {
    this.session = session;
    this.seed = o.seed;
    this.rand = mulberry32(o.seed);
    this.jitter = o.jitterMs;
    for (let k = 1; k <= o.players; k++) {
      const id = (k + 1).toString(16).padStart(32, '0');
      const latency = o.latencyMs[0] + this.rand() * (o.latencyMs[1] - o.latencyMs[0]);
      const peer: Peer = { k, id, peerId: `virtual-${k}`, latency, joinAt: 20 + 10 * k, next: 0, joinTick: -1, readyTick: -1, buttons: new Map(), queue: [], lastAt: 0 };
      this.peers.push(peer);
      const hello: M.Hello = {
        type: M.T.HELLO, protocol: M.PROTOCOL_VERSION, build: o.build, player: id, role: M.ROLE.PLAYER,
        timeline: M.ZERO_HASH, timelineKind: M.TIMELINE.NONE, phase: 0, finalTick: 0, hash: M.ZERO_HASH, holdsResult: false, name: `Peer ${k + 1}`,
      };
      session.onPeerJoin(peer.peerId, hello, session.hello());
      session.onRtt(peer.peerId, 2 * latency + o.jitterMs);
    }
    this.timer = setInterval(() => this.step(performance.now()), 4);
  }

  private step(now: number): void {
    const t = this.session.timeline;
    if (!t.started) return;
    for (const p of this.peers) {
      if (t.localTick < p.joinAt) continue;
      if (p.next === 0) p.next = t.localTick;
      while (p.next <= t.localTick) this.emit(p, p.next++, now);
      while (p.queue.length > 0 && p.queue[0]!.at <= now) this.session.onMessage(p.peerId, p.queue.shift()!.bytes, now);
    }
  }

  private emit(p: Peer, n: number, now: number): void {
    const t = n + config.inputDelayTicks;
    const buttons = scriptButtons(this.seed, p.k, n);
    p.buttons.set(t, buttons);
    p.buttons.delete(t - 2 * M.HISTORY);
    if (p.joinTick < 0) p.joinTick = t;
    if (p.readyTick < 0 && t - p.joinTick >= READY_AFTER_TICKS) p.readyTick = t;
    const hist: number[] = [];
    let histMask = 0;
    for (let k = 0; k < M.HISTORY; k++) {
      const b = p.buttons.get(t - 1 - k);
      hist.push(b ?? 0);
      if (b !== undefined) histMask |= 1 << k;
    }
    const events: M.TickEvent[] = [];
    if (t - p.joinTick <= EVENT_REPEAT_TICKS) events.push({ back: t - p.joinTick, events: JOIN, name: `Peer ${p.k + 1}` });
    if (p.readyTick >= 0 && t - p.readyTick <= EVENT_REPEAT_TICKS) events.push({ back: t - p.readyTick, events: READY, name: '' });
    const bytes = M.encodeTick({ t, buttons, voteTick: M.NO_TICK, voteHash: M.ZERO_HASH, phase: 0, histMask, hist, events });
    // A reliable, ordered channel: never overtakes the previous message.
    p.lastAt = Math.max(p.lastAt, now + p.latency + this.rand() * this.jitter);
    p.queue.push({ at: p.lastAt, bytes });
  }

  send(_peer: string, bytes: Uint8Array): void {
    this.sentBytes += bytes.length;
  }

  broadcast(bytes: Uint8Array): void {
    this.sentBytes += bytes.length * this.peers.length;
  }

  peerCount(): number {
    return this.peers.length;
  }

  leave(): Promise<void> {
    clearInterval(this.timer);
    return Promise.resolve();
  }
}
