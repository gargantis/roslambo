// The Trystero transport (PLAN D-13), and the only file that imports
// Trystero. It joins one room, runs the two-round handshake (both HELLOs,
// then both verdicts, so a refused peer learns why), carries every
// message on one binary action, measures round trips with room.ping, and
// hands everything to a Session.

import { getRelaySockets, joinRoom } from '@trystero-p2p/nostr';
import * as M from '../core/protocol/messages';
import type { Session } from '../core/session/session';
import { roomConfig, type RoomConfigInput } from './room-config';

const ACCEPTED = 0; // REFUSE with reason 0: the handshake's "yes"
const PING_EVERY_MS = 2000;

export interface RoomOptions extends RoomConfigInput {
  roundId: string;
}

function bytesOf(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return null;
}

export class TrysteroRoom {
  /** The last refusal this side received, for the failure message (§11). */
  refusedBy: number | null = null;
  private readonly room: ReturnType<typeof joinRoom>;
  private readonly action: { send: (d: Uint8Array, o?: { target?: string }) => Promise<void> };
  private readonly pending = new Map<string, { hello: M.Hello; sent: M.Hello }>();
  private readonly peers = new Set<string>();
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(opts: RoomOptions, session: Session, now: () => number) {
    this.room = joinRoom(roomConfig(opts), opts.roundId, {
      handshakeTimeoutMs: 10_000,
      onPeerHandshake: async (peerId, send, receive) => {
        const sent = session.hello();
        await send(M.encodeHello(sent));
        const theirs = M.decode(bytesOf((await receive()).data) ?? new Uint8Array(0));
        if (!theirs || theirs.type !== M.T.HELLO) throw new Error('no HELLO');
        const verdict = session.checkHello(theirs);
        await send(M.encodeRefuse(verdict.ok ? ACCEPTED : verdict.reason));
        const answer = M.decode(bytesOf((await receive()).data) ?? new Uint8Array(0));
        if (!verdict.ok) throw new Error(`refused: ${verdict.reason}`);
        if (!answer || answer.type !== M.T.REFUSE) throw new Error('no verdict');
        if (answer.reason !== ACCEPTED) {
          this.refusedBy = answer.reason;
          throw new Error(`refused by peer: ${answer.reason}`);
        }
        this.pending.set(peerId, { hello: theirs, sent });
      },
    });

    this.action = this.room.makeAction<Uint8Array>('rl', {
      onMessage: (data, ctx) => {
        const bytes = bytesOf(data);
        if (bytes) session.onMessage(ctx.peerId, bytes, now());
      },
    });
    this.room.onPeerJoin = (peerId) => {
      const p = this.pending.get(peerId);
      this.pending.delete(peerId);
      if (!p) return;
      this.peers.add(peerId);
      session.onPeerJoin(peerId, p.hello, p.sent);
      void this.ping(peerId, session);
    };
    this.room.onPeerLeave = (peerId) => {
      this.peers.delete(peerId);
      session.onPeerLeave(peerId);
    };
    this.timer = setInterval(() => {
      for (const p of this.peers) void this.ping(p, session);
    }, PING_EVERY_MS);
  }

  /** The session's link: one action, to one peer or to all. */
  send(peer: string, bytes: Uint8Array): void {
    void this.action.send(bytes, { target: peer }).catch(() => {});
  }

  broadcast(bytes: Uint8Array): void {
    if (this.peers.size > 0) void this.action.send(bytes).catch(() => {});
  }

  private async ping(peer: string, session: Session): Promise<void> {
    try {
      session.onRtt(peer, await this.room.ping(peer));
    } catch {
      // the peer went away
    }
  }

  peerCount(): number {
    return this.peers.size;
  }

  async leave(): Promise<void> {
    clearInterval(this.timer);
    await this.room.leave();
  }

  /** "n of m relays reachable" (§11 Settings). */
  static relayHealth(): { open: number; total: number } {
    const sockets = Object.values(getRelaySockets() as Record<string, WebSocket>);
    return { open: sockets.filter((s) => s.readyState === WebSocket.OPEN).length, total: sockets.length };
  }
}
