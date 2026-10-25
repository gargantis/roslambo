// D-16: the build hash. Peers whose simulation settings, state codec or
// protocol differ would desync silently, so the handshake refuses them.

import { CODEC_VERSION } from '../sim/codec';
import { hash64 } from '../sim/hash';
import type { SimSettings } from '../sim/params';
import { PROTOCOL_VERSION } from '../protocol/messages';

export function buildHash(settings: SimSettings): string {
  const keys = Object.keys(settings).sort() as (keyof SimSettings)[];
  const text = JSON.stringify({ codec: CODEC_VERSION, protocol: PROTOCOL_VERSION, settings: keys.map((k) => [k, settings[k]]) });
  return hash64(new TextEncoder().encode(text));
}
