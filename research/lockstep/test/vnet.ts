// A virtual network in simulated time for testing the timeline in Node:
// per-link latency and jitter, FIFO per link (like a reliable data
// channel), per-peer clock offset and drift. Seeded, so runs repeat.

import { Timeline, type TimelineConfig } from '../src/timeline.ts';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Ev {
  at: number;
  seq: number;
  fn: () => void;
}

class Heap {
  private a: Ev[] = [];
  get size(): number {
    return this.a.length;
  }
  peek(): Ev | undefined {
    return this.a[0];
  }
  push(e: Ev): void {
    const a = this.a;
    a.push(e);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (less(a[p]!, a[i]!)) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  pop(): Ev {
    const a = this.a;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && less(a[l]!, a[m]!)) m = l;
        if (r < a.length && less(a[r]!, a[m]!)) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
}

function less(x: Ev, y: Ev): boolean {
  return x.at < y.at || (x.at === y.at && x.seq < y.seq);
}

export interface PeerSpec {
  cfg: TimelineConfig;
  joinAt: number; // ms of virtual time; the first peer with joinAt 0 starts the timeline
  clockOffset?: number; // ms added to this peer's local clock
  drift?: number; // relative clock rate error, e.g. 0.002
}

export interface VPeer {
  id: string;
  spec: PeerSpec;
  tl: Timeline;
  connected: boolean;
  local(now: number): number;
}

export class VNet {
  now = 0;
  readonly peers: VPeer[] = [];
  private readonly q = new Heap();
  private seq = 0;
  private readonly linkLast = new Map<string, number>();
  private readonly rand: () => number;
  private readonly latency: (a: number, b: number) => { base: number; jitter: number };
  messages = 0;
  bytes = 0;

  constructor(seed: number, latency: (a: number, b: number) => { base: number; jitter: number }) {
    this.rand = mulberry32(seed);
    this.latency = latency;
  }

  add(spec: PeerSpec): VPeer {
    const idx = this.peers.length;
    const id = `p${idx}`;
    const offset = spec.clockOffset ?? 0;
    const drift = spec.drift ?? 0;
    const peer: VPeer = {
      id,
      spec,
      connected: false,
      local: (now) => now * (1 + drift) + offset,
      tl: new Timeline(spec.cfg, {
        broadcast: (b) => {
          for (const q of this.peers) if (q !== peer && q.connected && peer.connected) this.deliver(idx, q, b);
        },
        sendTo: (to, b) => {
          const q = this.peers.find((x) => x.id === to);
          if (q && q.connected && peer.connected) this.deliver(idx, q, b);
        },
      }),
    };
    this.peers.push(peer);
    this.at(spec.joinAt, () => this.join(peer));
    return peer;
  }

  /** Disconnect a peer from everyone at virtual time t. */
  dropAt(peer: VPeer, t: number): void {
    this.at(t, () => {
      peer.connected = false;
    });
  }

  private join(peer: VPeer): void {
    peer.connected = true;
    const others = this.peers.filter((q) => q !== peer && q.connected);
    for (const q of others) {
      // What a ping would measure: half the round trip, mean jitter included.
      const l = this.latency(this.peers.indexOf(peer), this.peers.indexOf(q));
      const oneWay = l.base + l.jitter / 2;
      peer.tl.setPeer(q.id, q.spec.cfg.me >= 0 ? q.spec.cfg.me : null);
      peer.tl.setOneWay(q.id, oneWay);
      q.tl.setPeer(peer.id, peer.spec.cfg.me >= 0 ? peer.spec.cfg.me : null);
      q.tl.setOneWay(peer.id, oneWay);
    }
    if (others.length === 0) peer.tl.start(peer.local(this.now));
    else peer.tl.requestJoin(others[0]!.id);
    const tick = (): void => {
      if (peer.connected) peer.tl.advance(peer.local(this.now));
      this.at(this.now + 4, tick);
    };
    tick();
  }

  private deliver(from: number, to: VPeer, b: Uint8Array): void {
    this.messages++;
    this.bytes += b.length;
    const l = this.latency(from, this.peers.indexOf(to));
    let t = this.now + l.base + this.rand() * l.jitter;
    const key = `${from}>${to.id}`;
    const last = this.linkLast.get(key) ?? 0;
    if (t < last) t = last; // FIFO per link
    this.linkLast.set(key, t);
    const fromId = this.peers[from]!.id;
    const copy = b.slice();
    this.at(t, () => {
      if (to.connected) to.tl.receive(fromId, copy, to.local(this.now));
    });
  }

  at(t: number, fn: () => void): void {
    this.q.push({ at: t, seq: this.seq++, fn });
  }

  run(until: number): void {
    while (this.q.size > 0 && this.q.peek()!.at <= until) {
      const e = this.q.pop();
      this.now = e.at;
      e.fn();
    }
    this.now = until;
  }
}
