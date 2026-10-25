// What a transport drives (PLAN §8): a game Session, or a ResultsPeer for
// a settler or witness. TrysteroRoom and the loopback network both take
// one, so every role runs over the same handshake.

import * as M from '../protocol/messages';

export type Refusal = { ok: false; reason: number };
export type Accepted = { ok: true; hello: M.Hello };

/** What a room peer needs from its transport. */
export interface Link {
  send(peer: string, bytes: Uint8Array): void;
  broadcast(bytes: Uint8Array): void;
  /** Close one connection and refuse it from then on (§9.4). */
  drop?(peer: string): void;
}

export interface RoomPeer {
  hello(): M.Hello;
  checkHello(hello: M.Hello): Accepted | Refusal;
  /** The handshake completed: `sent` is the HELLO this side sent. */
  onPeerJoin(peer: string, hello: M.Hello, sent: M.Hello): void;
  onPeerLeave(peer: string): void;
  onRtt(peer: string, ms: number): void;
  onMessage(peer: string, bytes: Uint8Array, now: number): void;
  advance(now: number): void;
}

/** §9.4: this many invalid messages from one peer close its connection. */
export const INVALID_LIMIT = 20;

/** The checks every role makes (D-16): protocol, build, and one connection
 *  per player. */
export function commonRefusal(hello: M.Hello, build: string, me: string, connected: (player: string) => boolean): Refusal | null {
  if (hello.protocol !== M.PROTOCOL_VERSION) return { ok: false, reason: M.REFUSAL.PROTOCOL };
  if (hello.build !== build) return { ok: false, reason: M.REFUSAL.BUILD };
  if (hello.player === me || connected(hello.player)) return { ok: false, reason: M.REFUSAL.DUPLICATE };
  return null;
}
