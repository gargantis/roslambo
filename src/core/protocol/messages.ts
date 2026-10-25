// The wire protocol of PLAN §9: one byte of type, then the payload. Every
// decoder is total: anything malformed decodes to null.

import { JOIN, LEAVE, READY, UNREADY } from '../sim/rules';
import { MAX_MESSAGE, Reader, Writer } from './bytes';

export const PROTOCOL_VERSION = 1;
export const NO_TICK = 0xffffffff;
export const ZERO_HASH = '0000000000000000';
export const HISTORY = 16; // ticks of the sender's own input repeated in each TICK (M0)

export const T = {
  HELLO: 0x01,
  REFUSE: 0x02,
  TICK: 0x10,
  FWD: 0x11,
  PEERS: 0x12,
  AGAIN: 0x13,
  STATE_REQ: 0x20,
  STATE: 0x21,
  RESULT_REQ: 0x30,
  RESULT: 0x31,
  SETTLED: 0x32,
} as const;

export const ROLE = { KEEPER: 1, PLAYER: 2, SPECTATOR: 3, SETTLER: 4, WITNESS: 5 } as const;
export const TIMELINE = { NONE: 0, LIVE: 1, SAVED: 2 } as const;
export const REFUSAL = { PROTOCOL: 1, BUILD: 2, DUPLICATE: 3, SPECTATORS_FULL: 4 } as const;

// Event kinds on the wire, and the simulation's event bits.
const KIND_TO_BIT: Record<number, number> = { 1: JOIN, 2: LEAVE, 3: READY, 4: UNREADY };
const BIT_KINDS: [number, number][] = [[JOIN, 1], [LEAVE, 2], [READY, 3], [UNREADY, 4]];

export interface Hello {
  type: typeof T.HELLO;
  protocol: number;
  build: string; // 16 hex
  player: string; // 32 hex
  role: number;
  timeline: string; // 16 hex; ZERO_HASH for none
  timelineKind: number;
  phase: number;
  finalTick: number;
  hash: string;
  holdsResult: boolean;
  name: string;
}

export interface Refuse {
  type: typeof T.REFUSE;
  reason: number;
}

/** One event the sender attaches, for its own input at tick `t − back`. */
export interface TickEvent {
  back: number;
  events: number; // simulation event bits (JOIN, LEAVE, …)
  name: string; // with JOIN
}

export interface Tick {
  type: typeof T.TICK;
  t: number;
  buttons: number;
  voteTick: number;
  voteHash: string;
  phase: number; // 0..1
  histMask: number;
  hist: number[]; // HISTORY entries, tick t − 1 first
  events: TickEvent[];
}

export interface Fwd {
  type: typeof T.FWD;
  origin: string;
  tick: Tick;
}

export interface Peers {
  type: typeof T.PEERS;
  players: string[];
}

export interface Again {
  type: typeof T.AGAIN;
}

export interface StateReq {
  type: typeof T.STATE_REQ;
  tick: number; // NO_TICK: newest final
  want: string; // ZERO_HASH: any
}

/** One player's input for one tick, as STATE carries it. */
export interface InputRecord {
  player: string;
  buttons: number;
  events: number;
  name: string;
}

export interface StateMsg {
  type: typeof T.STATE;
  timeline: string;
  senderTick: number;
  phase: number;
  g: number;
  senderFinal: number;
  state: Uint8Array; // canonical state at g (A.1)
  roster: string[]; // the player IDs in that state, in order: what roster indices refer to
  inputs: InputRecord[][]; // ticks g+1, g+2, …
}

export interface ResultReq {
  type: typeof T.RESULT_REQ;
  player: string;
}

export interface ResultRecord {
  round: string;
  ante: number;
  freezeTick: number;
  finalHash: string;
  players: { player: string; name: string; points: number }[];
}

export interface Result {
  type: typeof T.RESULT;
  record: ResultRecord;
}

export interface Settled {
  type: typeof T.SETTLED;
  player: string;
}

export type Message = Hello | Refuse | Tick | Fwd | Peers | Again | StateReq | StateMsg | ResultReq | Result | Settled;

// ---- encoding ----

function writeEvents(w: Writer, bits: number, name: string): void {
  // Multiple bits in one input become one record per kind.
  for (const [bit, kind] of BIT_KINDS) {
    if ((bits & bit) === 0) continue;
    w.u8(kind);
    if (bit === JOIN) w.string(name);
  }
}

function eventCount(bits: number): number {
  let c = 0;
  for (const [bit] of BIT_KINDS) if ((bits & bit) !== 0) c++;
  return c;
}

export function encodeHello(m: Omit<Hello, 'type'>): Uint8Array {
  return new Writer()
    .u8(T.HELLO).u16(m.protocol).hex(m.build, 8).hex(m.player, 16).u8(m.role)
    .hex(m.timeline, 8).u8(m.timelineKind).u8(m.phase).u32(m.finalTick).hex(m.hash || ZERO_HASH, 8)
    .u8(m.holdsResult ? 1 : 0).string(m.name).done();
}

export function encodeRefuse(reason: number): Uint8Array {
  return new Writer().u8(T.REFUSE).u8(reason).done();
}

function writeTick(w: Writer, m: Omit<Tick, 'type'>): void {
  w.u8(T.TICK).u32(m.t).u8(m.buttons & 7).u32(m.voteTick).hex(m.voteHash || ZERO_HASH, 8)
    .u16(Math.min(65535, Math.max(0, Math.floor(m.phase * 65536)))).u16(m.histMask & 0xffff);
  let lo = 0;
  let hi = 0;
  for (let k = 0; k < 8; k++) lo |= (m.hist[k]! & 7) << (3 * k);
  for (let k = 0; k < 8; k++) hi |= (m.hist[8 + k]! & 7) << (3 * k);
  w.u8(lo & 0xff).u8((lo >>> 8) & 0xff).u8((lo >>> 16) & 0xff).u8(hi & 0xff).u8((hi >>> 8) & 0xff).u8((hi >>> 16) & 0xff);
  let n = 0;
  for (const e of m.events) n += eventCount(e.events);
  w.u8(n);
  for (const e of m.events) {
    for (const [bit, kind] of BIT_KINDS) {
      if ((e.events & bit) === 0) continue;
      w.u8(e.back).u8(kind);
      if (bit === JOIN) w.string(e.name);
    }
  }
}

export function encodeTick(m: Omit<Tick, 'type'>): Uint8Array {
  const w = new Writer();
  writeTick(w, m);
  return w.done();
}

export function encodeFwd(origin: string, tick: Uint8Array): Uint8Array {
  return new Writer().u8(T.FWD).hex(origin, 16).bytes(tick).done();
}

export function encodePeers(players: string[]): Uint8Array {
  const w = new Writer().u8(T.PEERS).u8(players.length);
  for (const p of players) w.hex(p, 16);
  return w.done();
}

export function encodeAgain(): Uint8Array {
  return new Writer().u8(T.AGAIN).done();
}

export function encodeStateReq(tick: number, want: string): Uint8Array {
  return new Writer().u8(T.STATE_REQ).u32(tick).hex(want || ZERO_HASH, 8).done();
}

/** STATE, with as many input ticks as fit in one message. */
export function encodeState(m: Omit<StateMsg, 'type'>): Uint8Array {
  const w = new Writer()
    .u8(T.STATE).hex(m.timeline, 8).u32(m.senderTick)
    .u16(Math.min(65535, Math.max(0, Math.floor(m.phase * 65536))))
    .u32(m.g).u32(m.senderFinal).u16(m.state.length).bytes(m.state);
  const index = new Map(m.roster.map((p, i) => [p, i]));
  const ticks: Writer[] = [];
  let size = w.length + 2;
  for (const inputs of m.inputs) {
    const t = new Writer().u8(inputs.length);
    for (const x of inputs) {
      const i = index.get(x.player);
      if (i !== undefined && i < 0xff) t.u8(i);
      else t.u8(0xff).hex(x.player, 16);
      t.u8(x.buttons & 7).u8(eventCount(x.events));
      writeEvents(t, x.events, x.name);
    }
    if (size + t.length > MAX_MESSAGE) break;
    size += t.length;
    ticks.push(t);
  }
  w.u16(ticks.length);
  for (const t of ticks) w.bytes(t.done());
  return w.done();
}

export function encodeResultReq(player: string): Uint8Array {
  return new Writer().u8(T.RESULT_REQ).hex(player, 16).done();
}

export function encodeResult(r: ResultRecord): Uint8Array {
  const w = new Writer().u8(T.RESULT).string(r.round).u32(r.ante).u32(r.freezeTick).hex(r.finalHash, 8).u8(r.players.length);
  for (const p of r.players) w.hex(p.player, 16).string(p.name).i32(p.points);
  return w.done();
}

export function encodeSettled(player: string): Uint8Array {
  return new Writer().u8(T.SETTLED).hex(player, 16).done();
}

// ---- decoding ----

function readTick(r: Reader): Tick | null {
  const t = r.u32();
  const buttons = r.u8() & 7;
  const voteTick = r.u32();
  const voteHash = r.hex(8);
  const phase = r.u16() / 65536;
  const histMask = r.u16();
  const b = r.bytes(6);
  if (r.bad) return null;
  const lo = b[0]! | (b[1]! << 8) | (b[2]! << 16);
  const hi = b[3]! | (b[4]! << 8) | (b[5]! << 16);
  const hist: number[] = [];
  for (let k = 0; k < 8; k++) hist.push((lo >>> (3 * k)) & 7);
  for (let k = 0; k < 8; k++) hist.push((hi >>> (3 * k)) & 7);
  const n = r.u8();
  const byBack = new Map<number, TickEvent>();
  for (let i = 0; i < n; i++) {
    const back = r.u8();
    const bit = KIND_TO_BIT[r.u8()];
    if (bit === undefined) return null;
    const name = bit === JOIN ? r.string() : '';
    const e = byBack.get(back) ?? { back, events: 0, name: '' };
    e.events |= bit;
    if (bit === JOIN) e.name = name;
    byBack.set(back, e);
  }
  if (r.bad) return null;
  return { type: T.TICK, t, buttons, voteTick, voteHash, phase, histMask, hist, events: [...byBack.values()] };
}

function readInputEvents(r: Reader): { events: number; name: string } | null {
  const n = r.u8();
  let events = 0;
  let name = '';
  for (let i = 0; i < n; i++) {
    const bit = KIND_TO_BIT[r.u8()];
    if (bit === undefined) return null;
    events |= bit;
    if (bit === JOIN) name = r.string();
  }
  return r.bad ? null : { events, name };
}

/** The roster of a canonical state (A.1): planet IDs in order. */
function rosterOf(state: Uint8Array): string[] | null {
  const r = new Reader(state);
  r.bytes(2 + 1 + 4 + 4 + 1 + 1 + 4 + 4 + 4);
  const n = r.u8();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(r.hex(16));
    const len = r.u8();
    r.bytes(len + 4 * 6 + 8 * 4 + 1);
  }
  return r.bad ? null : out;
}

export function decode(bytes: Uint8Array): Message | null {
  if (bytes.length === 0 || bytes.length > MAX_MESSAGE) return null;
  const r = new Reader(bytes);
  const type = r.u8();
  let m: Message | null;
  switch (type) {
    case T.HELLO: {
      m = {
        type, protocol: r.u16(), build: r.hex(8), player: r.hex(16), role: r.u8(), timeline: r.hex(8),
        timelineKind: r.u8(), phase: r.u8(), finalTick: r.u32(), hash: r.hex(8), holdsResult: r.u8() === 1, name: r.string(),
      };
      break;
    }
    case T.REFUSE:
      m = { type, reason: r.u8() };
      break;
    case T.TICK:
      m = readTick(r);
      break;
    case T.FWD: {
      const origin = r.hex(16);
      if (r.u8() !== T.TICK) return null;
      const tick = readTick(r);
      m = tick && { type, origin, tick };
      break;
    }
    case T.PEERS: {
      const n = r.u8();
      const players: string[] = [];
      for (let i = 0; i < n; i++) players.push(r.hex(16));
      m = { type, players };
      break;
    }
    case T.AGAIN:
      m = { type };
      break;
    case T.STATE_REQ:
      m = { type, tick: r.u32(), want: r.hex(8) };
      break;
    case T.STATE: {
      const timeline = r.hex(8);
      const senderTick = r.u32();
      const phase = r.u16() / 65536;
      const g = r.u32();
      const senderFinal = r.u32();
      const state = r.bytes(r.u16());
      const roster = r.bad ? null : rosterOf(state);
      if (!roster) return null;
      const count = r.u16();
      const inputs: InputRecord[][] = [];
      for (let k = 0; k < count && !r.bad; k++) {
        const n = r.u8();
        const tick: InputRecord[] = [];
        for (let i = 0; i < n; i++) {
          const idx = r.u8();
          const player = idx === 0xff ? r.hex(16) : roster[idx];
          if (player === undefined) return null;
          const buttons = r.u8() & 7;
          const ev = readInputEvents(r);
          if (!ev) return null;
          tick.push({ player, buttons, events: ev.events, name: ev.name });
        }
        inputs.push(tick);
      }
      m = { type, timeline, senderTick, phase, g, senderFinal, state, roster, inputs };
      break;
    }
    case T.RESULT_REQ:
      m = { type, player: r.hex(16) };
      break;
    case T.RESULT: {
      const round = r.string();
      const ante = r.u32();
      const freezeTick = r.u32();
      const finalHash = r.hex(8);
      const n = r.u8();
      const players: ResultRecord['players'] = [];
      for (let i = 0; i < n; i++) players.push({ player: r.hex(16), name: r.string(), points: r.i32() });
      m = { type, record: { round, ante, freezeTick, finalHash, players } };
      break;
    }
    case T.SETTLED:
      m = { type, player: r.hex(16) };
      break;
    default:
      return null;
  }
  return m && r.complete ? m : null;
}
