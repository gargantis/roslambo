// An in-memory room in simulated time, for testing sessions without a
// browser (PLAN §14): the real handshake checks, per-link latency and
// jitter, FIFO per link like a reliable data channel, pairs that can't
// connect, and per-node clock offset and drift. Seeded, so runs repeat.

import * as M from '../core/protocol/messages';
import type { Session } from '../core/session/session';

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
  private readonly a: Ev[] = [];
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

export interface LinkSpec {
  base: number; // one-way ms
  jitter: number; // extra ms, uniform
}

export interface NodeOptions {
  clockOffset?: number; // ms added to this node's clock
  drift?: number; // relative clock rate error
}

export interface LoopNode {
  id: string; // transport peer ID
  session: Session;
  online: boolean;
  local(now: number): number;
  neighbours: Set<string>;
}

export class LoopbackNet {
  now = 0;
  messages = 0;
  bytes = 0;
  readonly nodes = new Map<string, LoopNode>();
  private readonly q = new Heap();
  private seq = 0;
  private readonly rand: () => number;
  private readonly latency: (a: string, b: string) => LinkSpec;
  private readonly blocked = new Set<string>();
  private readonly linkLast = new Map<string, number>();

  constructor(seed: number, latency: (a: string, b: string) => LinkSpec) {
    this.rand = mulberry32(seed);
    this.latency = latency;
  }

  private key(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  /** The pair can't connect directly (strict NATs, no TURN). */
  block(a: string, b: string): void {
    this.blocked.add(this.key(a, b));
  }

  unblock(a: string, b: string): void {
    this.blocked.delete(this.key(a, b));
    const na = this.nodes.get(a);
    const nb = this.nodes.get(b);
    if (na?.online && nb?.online) this.connect(na, nb);
  }

  /** Adds a node, offline until join(). `make` builds its session around
   *  the link this network provides. */
  add(id: string, make: (link: { send(peer: string, b: Uint8Array): void; broadcast(b: Uint8Array): void }) => Session, opts: NodeOptions = {}): LoopNode {
    const offset = opts.clockOffset ?? 0;
    const drift = opts.drift ?? 0;
    const node: LoopNode = {
      id,
      online: false,
      neighbours: new Set(),
      local: (now) => now * (1 + drift) + offset,
      session: undefined as unknown as Session,
    };
    node.session = make({
      send: (peer, b) => {
        if (node.online && node.neighbours.has(peer)) this.deliver(node, peer, b);
      },
      broadcast: (b) => {
        if (!node.online) return;
        for (const peer of node.neighbours) this.deliver(node, peer, b);
      },
    });
    this.nodes.set(id, node);
    return node;
  }

  /** The node enters the room at virtual time `at`, connecting to every
   *  online node it isn't blocked from, after the link's latency. */
  join(node: LoopNode, at: number, then?: (now: number) => void): void {
    this.at(at, () => {
      node.online = true;
      for (const other of this.nodes.values()) {
        if (other === node || !other.online) continue;
        const l = this.latency(node.id, other.id);
        this.at(this.now + 2 * l.base, () => this.connect(node, other));
      }
      then?.(this.now);
      const tick = (): void => {
        if (!node.online) return;
        node.session.advance(node.local(this.now));
        this.at(this.now + 4, tick);
      };
      tick();
    });
  }

  /** The node drops out (closed tab, lost network) at virtual time `at`. */
  leave(node: LoopNode, at: number): void {
    this.at(at, () => {
      node.online = false;
      for (const peer of node.neighbours) {
        const other = this.nodes.get(peer)!;
        other.neighbours.delete(node.id);
        other.session.onPeerLeave(node.id);
        node.session.onPeerLeave(peer);
      }
      node.neighbours.clear();
    });
  }

  /** The handshake (D-16): both HELLOs, both checks, then both joins. */
  private connect(a: LoopNode, b: LoopNode): void {
    if (!a.online || !b.online || a.neighbours.has(b.id) || this.blocked.has(this.key(a.id, b.id))) return;
    const ha = a.session.hello();
    const hb = b.session.hello();
    const okA = a.session.checkHello(hb);
    const okB = b.session.checkHello(ha);
    if (!okA.ok || !okB.ok) {
      this.refusals.push({ from: okA.ok ? b.id : a.id, to: okA.ok ? a.id : b.id, reason: okA.ok ? (okB as { reason: number }).reason : okA.reason });
      return;
    }
    a.neighbours.add(b.id);
    b.neighbours.add(a.id);
    a.session.onPeerJoin(b.id, hb, ha);
    b.session.onPeerJoin(a.id, ha, hb);
    // What a ping would measure: the round trip, mean jitter included.
    const l = this.latency(a.id, b.id);
    a.session.onRtt(b.id, 2 * l.base + l.jitter);
    b.session.onRtt(a.id, 2 * l.base + l.jitter);
  }

  readonly refusals: { from: string; to: string; reason: number }[] = [];

  private deliver(from: LoopNode, to: string, b: Uint8Array): void {
    this.messages++;
    this.bytes += b.length;
    const l = this.latency(from.id, to);
    let t = this.now + l.base + this.rand() * l.jitter;
    const key = `${from.id}>${to}`;
    const last = this.linkLast.get(key) ?? 0;
    if (t < last) t = last; // FIFO per link
    this.linkLast.set(key, t);
    const copy = b.slice();
    this.at(t, () => {
      const node = this.nodes.get(to);
      if (node?.online && node.neighbours.has(from.id)) node.session.onMessage(from.id, copy, node.local(this.now));
    });
  }

  at(t: number, fn: () => void): void {
    this.q.push({ at: t, seq: this.seq++, fn });
  }

  run(until: number, stop?: () => boolean): void {
    while (this.q.size > 0 && this.q.peek()!.at <= until) {
      const e = this.q.pop();
      this.now = e.at;
      e.fn();
      if (stop && e.at % 500 < 4 && stop()) return;
    }
    this.now = until;
  }
}

export { M };
