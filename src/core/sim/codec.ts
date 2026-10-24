// Canonical state bytes (PLAN A.1): the hash input and the STATE payload.
// One encoding per state, little-endian. The decoder is total: malformed
// bytes give null, never an exception.

import { hash64 } from './hash';
import { FROZEN, type Planet, type RoundState } from './state';

export const CODEC_VERSION = 1;
const NAME_MAX_BYTES = 32;
const HEADER = 2 + 1 + 4 + 4 + 1 + 1 + 4 + 4 + 4 + 1;
const PLANET_FIXED = 16 + 1 + 4 + 4 + 4 + 4 + 4 + 4 + 8 * 4 + 1;

const utf8 = new TextEncoder();
const utf8Strict = new TextDecoder('utf-8', { fatal: true });

const ID_RE = /^[0-9a-f]{32}$/;

export function encodeState(s: RoundState): Uint8Array {
  const names = s.planets.map((p) => utf8.encode(p.name));
  let size = HEADER;
  for (const nm of names) size += PLANET_FIXED + nm.length;
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  let o = 0;
  v.setUint16(o, CODEC_VERSION, true); o += 2;
  v.setUint8(o, s.phase); o += 1;
  v.setUint32(o, s.tick, true); o += 4;
  v.setUint32(o, s.ante, true); o += 4;
  v.setUint8(o, s.minPlayers); o += 1;
  v.setUint8(o, s.maxPlayers); o += 1;
  v.setUint32(o, s.countdownStart, true); o += 4;
  v.setUint32(o, s.freezeTick, true); o += 4;
  v.setUint32(o, s.ringPhase, true); o += 4;
  v.setUint8(o, s.planets.length); o += 1;
  s.planets.forEach((p, i) => {
    for (let k = 0; k < 16; k++) out[o + k] = parseInt(p.id.slice(2 * k, 2 * k + 2), 16);
    o += 16;
    const nm = names[i]!;
    v.setUint8(o, nm.length); o += 1;
    out.set(nm, o); o += nm.length;
    v.setUint32(o, p.joinTick, true); o += 4;
    v.setUint32(o, p.readyUntil, true); o += 4;
    v.setUint32(o, p.lastInputTick, true); o += 4;
    v.setInt32(o, p.points, true); o += 4;
    v.setUint32(o, p.angle, true); o += 4;
    v.setInt32(o, p.rate, true); o += 4;
    for (const f of [p.x, p.y, p.vx, p.vy]) {
      if (f !== f) throw new Error('NaN in round state'); // must never happen (D-1)
      v.setFloat64(o, f, true);
      o += 8;
    }
    v.setUint8(o, p.engaged); o += 1;
  });
  return out;
}

export function decodeState(bytes: Uint8Array): RoundState | null {
  if (bytes.length < HEADER) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  if (v.getUint16(o, true) !== CODEC_VERSION) return null;
  o += 2;
  const phase = v.getUint8(o); o += 1;
  if (phase > FROZEN) return null;
  const s: RoundState = {
    phase: phase as RoundState['phase'],
    tick: v.getUint32(o, true),
    ante: v.getUint32(o + 4, true),
    minPlayers: v.getUint8(o + 8),
    maxPlayers: v.getUint8(o + 9),
    countdownStart: v.getUint32(o + 10, true),
    freezeTick: v.getUint32(o + 14, true),
    ringPhase: v.getUint32(o + 18, true),
    planets: [],
  };
  o += 22;
  const n = v.getUint8(o); o += 1;
  for (let i = 0; i < n; i++) {
    if (bytes.length < o + 17) return null;
    let id = '';
    for (let k = 0; k < 16; k++) id += bytes[o + k]!.toString(16).padStart(2, '0');
    o += 16;
    const len = v.getUint8(o); o += 1;
    if (len > NAME_MAX_BYTES || bytes.length < o + len + PLANET_FIXED - 17) return null;
    let name: string;
    try {
      name = utf8Strict.decode(bytes.subarray(o, o + len));
    } catch {
      return null;
    }
    o += len;
    const p: Planet = {
      id,
      name,
      joinTick: v.getUint32(o, true),
      readyUntil: v.getUint32(o + 4, true),
      lastInputTick: v.getUint32(o + 8, true),
      points: v.getInt32(o + 12, true),
      angle: v.getUint32(o + 16, true),
      rate: v.getInt32(o + 20, true),
      x: v.getFloat64(o + 24, true),
      y: v.getFloat64(o + 32, true),
      vx: v.getFloat64(o + 40, true),
      vy: v.getFloat64(o + 48, true),
      engaged: v.getUint8(o + 56),
    };
    o += 57;
    if (p.engaged > 1 || !ID_RE.test(p.id)) return null;
    for (const f of [p.x, p.y, p.vx, p.vy]) if (f !== f) return null;
    s.planets.push(p);
  }
  return o === bytes.length ? s : null;
}

export function hashState(s: RoundState): string {
  return hash64(encodeState(s));
}

/** UTF-8 byte length, for validating names before they enter the state. */
export function nameBytes(name: string): number {
  return utf8.encode(name).length;
}
