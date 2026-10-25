// The exact config handed to Trystero's joinRoom, built as a literal typed
// against the library's own JoinRoomConfig: a misspelt or renamed key is a
// compile error, where an untyped spread would be silently ignored (that
// is how amorfus once ran on the library's default relays). Type-only
// import: src/net/trystero.ts stays the one runtime importer.

import type { JoinRoomConfig } from '@trystero-p2p/nostr';
import thirdParty from '../../third-party.json';

export const APP_ID = 'roslambo';
export const CURATED_RELAYS: string[] = thirdParty.filter((e) => e.kind === 'signaling').map((e) => e.url);
export const STUN_URLS: string[] = thirdParty.filter((e) => e.kind === 'stun').map((e) => e.url);

export interface RoomConfigInput {
  relays?: string[]; // replaces the curated relays: tests use a local relay
  extraRelays?: string[]; // Settings
  turn?: RTCIceServer[]; // Settings
  local?: boolean; // tests on one machine: no STUN, mDNS rewritten to loopback
  passive?: boolean; // witnesses (§8.7)
}

export function roomConfig(o: RoomConfigInput): JoinRoomConfig {
  const relays = [...(o.relays ?? CURATED_RELAYS), ...(o.extraRelays ?? [])];
  // An empty list would make Trystero fall back to its own relays.
  if (relays.length === 0) throw new Error('no signaling relays');
  const config: JoinRoomConfig = {
    appId: APP_ID,
    relayConfig: { urls: relays },
    // Always set: otherwise Trystero adds its own default STUN servers.
    rtcConfig: { iceServers: [...(o.local ? [] : [{ urls: STUN_URLS }]), ...(o.turn ?? [])] },
    maxReceiveBytes: 1024 * 1024,
    passive: o.passive ?? false,
  };
  if (o.local) config._test_only_mdnsHostFallbackToLoopback = true;
  return config;
}
