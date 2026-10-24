// The spike's Trystero transport (PLAN D-13): one binary action, a JSON
// HELLO in the handshake, RTT from room.ping. The only Trystero import.

import { getRelaySockets, joinRoom, selfId, type JoinRoomConfig } from '@trystero-p2p/nostr';

export type Hello = { v: number; key: string; me: number };

export interface NetOptions {
  roomId: string;
  relays: string[];
  local: boolean; // local test relay: no STUN, mDNS candidates rewritten to loopback
  hello: Hello;
  lagMs: number; // fault: delay every outgoing message
}

export const PUBLIC_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://offchain.pub',
  'wss://nostr.bitcoiner.social',
  'wss://yabu.me/v2',
];
const STUN = ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'];

export class Net {
  readonly id = selfId;
  onMessage: (from: string, bytes: Uint8Array) => void = () => {};
  onPeerJoin: (peerId: string, hello: Hello) => void = () => {};
  onPeerLeave: (peerId: string) => void = () => {};
  onRtt: (peerId: string, ms: number) => void = () => {};
  readonly hellos = new Map<string, Hello>();
  readonly joinedAt = new Map<string, number>();
  sent = 0;
  recv = 0;
  bytesOut = 0;
  bytesIn = 0;

  private readonly room: ReturnType<typeof joinRoom>;
  private readonly action: { send: (d: Uint8Array, o?: { target?: string }) => Promise<void> };
  private readonly flooder: { send: (d: Uint8Array, o?: { target?: string }) => Promise<void> };
  private readonly peerSet = new Set<string>();
  private readonly lagMs: number;
  floodErrors = 0;

  constructor(opts: NetOptions) {
    if (opts.relays.length === 0) throw new Error('no relays');
    this.lagMs = opts.lagMs;
    const config: JoinRoomConfig = {
      appId: 'roslambo-spike',
      relayConfig: { urls: [...opts.relays] },
      rtcConfig: { iceServers: opts.local ? [] : [{ urls: STUN }] },
      maxReceiveBytes: 1024 * 1024,
    };
    if (opts.local) config._test_only_mdnsHostFallbackToLoopback = true;
    this.room = joinRoom(config, opts.roomId, {
      handshakeTimeoutMs: 10_000,
      onPeerHandshake: async (peerId, send, receive) => {
        await send(opts.hello);
        const { data } = await receive();
        const h = data as Hello;
        if (!h || h.v !== opts.hello.v || h.key !== opts.hello.key) throw new Error('spike config mismatch');
        this.hellos.set(peerId, h);
      },
    });
    const action = this.room.makeAction<Uint8Array>('rl', {
      onMessage: (data, ctx) => {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data as unknown as ArrayBuffer);
        this.recv++;
        this.bytesIn += bytes.length;
        this.onMessage(ctx.peerId, bytes);
      },
    });
    this.action = action;
    // Registered on the sender only, so receivers see an unknown type (run 5).
    this.flooder = this.room.makeAction<Uint8Array>('zz');
    this.room.onPeerJoin = (peerId) => {
      this.peerSet.add(peerId);
      this.joinedAt.set(peerId, performance.now());
      const h = this.hellos.get(peerId) ?? { v: 0, key: '', me: -1 };
      this.onPeerJoin(peerId, h);
      void this.ping(peerId);
    };
    this.room.onPeerLeave = (peerId) => {
      this.peerSet.delete(peerId);
      this.onPeerLeave(peerId);
    };
    setInterval(() => {
      for (const p of this.peerSet) void this.ping(p);
    }, 2000);
  }

  private async ping(peerId: string): Promise<void> {
    try {
      const ms = await this.room.ping(peerId);
      this.onRtt(peerId, ms);
    } catch {
      // peer went away
    }
  }

  peers(): string[] {
    return [...this.peerSet];
  }

  send(peerId: string, bytes: Uint8Array): void {
    this.out(bytes, peerId);
  }

  broadcast(bytes: Uint8Array): void {
    if (this.peerSet.size > 0) this.out(bytes, undefined);
  }

  private out(bytes: Uint8Array, target: string | undefined): void {
    const go = (): void => {
      this.sent++;
      this.bytesOut += bytes.length;
      void this.action.send(bytes, target === undefined ? {} : { target }).catch(() => {});
    };
    if (this.lagMs > 0) setTimeout(go, this.lagMs);
    else go();
  }

  /** Run 5: oversized payloads on the real action, and payloads of a type
   *  the receiver never registered. */
  async flood(target: string, count: number, bytes: number): Promise<void> {
    const big = new Uint8Array(bytes);
    const jobs: Promise<void>[] = [];
    for (let i = 0; i < count; i++) {
      jobs.push(this.action.send(big, { target }).catch(() => { this.floodErrors++; }));
      jobs.push(this.flooder.send(big.subarray(0, Math.min(bytes, 512 * 1024)), { target }).catch(() => { this.floodErrors++; }));
    }
    await Promise.all(jobs);
  }

  relayHealth(): { open: number; total: number } {
    const sockets = Object.values(getRelaySockets() as Record<string, WebSocket>);
    return { open: sockets.filter((s) => s.readyState === WebSocket.OPEN).length, total: sockets.length };
  }
}
