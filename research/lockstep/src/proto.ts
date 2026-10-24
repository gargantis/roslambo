// Spike subset of PLAN §9: TICK, STATE_REQ and STATE, little-endian.
// The spike identifies players by index instead of a 16-byte player ID.

import { bytesToHash, hashToBytes } from './hash.ts';

export const TICK = 0x10;
export const STATE_REQ = 0x20;
export const STATE = 0x21;
export const NONE = 0xffffffff;
export const UNKNOWN_INPUT = 0xff;

export interface TickMsg {
  type: typeof TICK;
  t: number;
  from: number;
  buttons: number;
  voteTick: number;
  voteHash: string;
  phase: number; // fraction of the sender's current tick, 0..1
  // Redundancy: the sender's own inputs for ticks t-1 … t-16. Bit k of
  // histMask says whether tick t-1-k is present; values are 3 bits each.
  histMask: number;
  hist: number[]; // 16 entries
}

export interface StateReqMsg {
  type: typeof STATE_REQ;
  tick: number; // NONE: newest final
  want: string; // '' for any
}

export interface StateMsg {
  type: typeof STATE;
  senderTick: number;
  phase: number;
  g: number;
  senderFinal: number;
  state: Uint8Array;
  n: number;
  inputs: Uint8Array; // count × n, ticks g+1 …, UNKNOWN_INPUT where not known
}

export type Msg = TickMsg | StateReqMsg | StateMsg;

export const HIST = 16;
const TICK_SIZE = 29;

export function encodeTick(m: Omit<TickMsg, 'type'>): Uint8Array {
  const out = new Uint8Array(TICK_SIZE);
  const v = new DataView(out.buffer);
  v.setUint8(0, TICK);
  v.setUint32(1, m.t, true);
  v.setUint8(5, m.from);
  v.setUint8(6, m.buttons);
  v.setUint32(7, m.voteTick, true);
  if (m.voteHash) hashToBytes(m.voteHash, out, 11);
  v.setUint16(19, Math.min(65535, Math.max(0, Math.floor(m.phase * 65536))), true);
  v.setUint16(21, m.histMask, true);
  // 16 × 3 bits = 48 bits, as two u24 halves.
  let lo = 0;
  let hi = 0;
  for (let k = 0; k < 8; k++) lo |= (m.hist[k]! & 7) << (3 * k);
  for (let k = 0; k < 8; k++) hi |= (m.hist[8 + k]! & 7) << (3 * k);
  out[23] = lo & 0xff; out[24] = (lo >>> 8) & 0xff; out[25] = (lo >>> 16) & 0xff;
  out[26] = hi & 0xff; out[27] = (hi >>> 8) & 0xff; out[28] = (hi >>> 16) & 0xff;
  return out;
}

export function encodeStateReq(tick: number, want: string): Uint8Array {
  const out = new Uint8Array(13);
  const v = new DataView(out.buffer);
  v.setUint8(0, STATE_REQ);
  v.setUint32(1, tick, true);
  if (want) hashToBytes(want, out, 5);
  return out;
}

export function encodeState(m: Omit<StateMsg, 'type'>): Uint8Array {
  const count = m.inputs.length / m.n;
  const out = new Uint8Array(1 + 4 + 2 + 4 + 4 + 2 + m.state.length + 2 + 1 + m.inputs.length);
  const v = new DataView(out.buffer);
  let o = 0;
  v.setUint8(o, STATE); o += 1;
  v.setUint32(o, m.senderTick, true); o += 4;
  v.setUint16(o, Math.min(65535, Math.floor(m.phase * 65536)), true); o += 2;
  v.setUint32(o, m.g, true); o += 4;
  v.setUint32(o, m.senderFinal, true); o += 4;
  v.setUint16(o, m.state.length, true); o += 2;
  out.set(m.state, o); o += m.state.length;
  v.setUint16(o, count, true); o += 2;
  v.setUint8(o, m.n); o += 1;
  out.set(m.inputs, o);
  return out;
}

/** Total decoder: malformed bytes give null, never an exception. */
export function decode(bytes: Uint8Array): Msg | null {
  if (bytes.length < 1) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = v.getUint8(0);
  if (type === TICK) {
    if (bytes.length !== TICK_SIZE) return null;
    const lo = bytes[23]! | (bytes[24]! << 8) | (bytes[25]! << 16);
    const hi = bytes[26]! | (bytes[27]! << 8) | (bytes[28]! << 16);
    const hist: number[] = [];
    for (let k = 0; k < 8; k++) hist.push((lo >>> (3 * k)) & 7);
    for (let k = 0; k < 8; k++) hist.push((hi >>> (3 * k)) & 7);
    return {
      type,
      t: v.getUint32(1, true),
      from: v.getUint8(5),
      buttons: v.getUint8(6) & 7,
      voteTick: v.getUint32(7, true),
      voteHash: bytesToHash(bytes, 11),
      phase: v.getUint16(19, true) / 65536,
      histMask: v.getUint16(21, true),
      hist,
    };
  }
  if (type === STATE_REQ) {
    if (bytes.length !== 13) return null;
    const want = bytesToHash(bytes, 5);
    return { type, tick: v.getUint32(1, true), want: want === '0000000000000000' ? '' : want };
  }
  if (type === STATE) {
    if (bytes.length < 19) return null;
    let o = 1;
    const senderTick = v.getUint32(o, true); o += 4;
    const phase = v.getUint16(o, true) / 65536; o += 2;
    const g = v.getUint32(o, true); o += 4;
    const senderFinal = v.getUint32(o, true); o += 4;
    const len = v.getUint16(o, true); o += 2;
    if (bytes.length < o + len + 3) return null;
    const state = bytes.slice(o, o + len); o += len;
    const count = v.getUint16(o, true); o += 2;
    const n = v.getUint8(o); o += 1;
    if (n === 0 || bytes.length !== o + count * n) return null;
    return { type, senderTick, phase, g, senderFinal, state, n, inputs: bytes.slice(o) };
  }
  return null;
}
