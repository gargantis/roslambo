// The exact config handed to Trystero's joinRoom, built by the shared
// vendor/hermet/room-config.ts from the hosts third-party.json declares, as
// a literal typed against the library's own JoinRoomConfig: a misspelt or
// renamed key is a compile error, where an untyped spread would be silently
// ignored (that is how amorfus once ran on the library's default relays).
// Type-only import: src/net/trystero.ts stays the one runtime importer.

import type { JoinRoomConfig } from '@trystero-p2p/nostr';
import thirdParty from '../../third-party.json';
import { declaredUrls, roomConfig as buildRoomConfig } from '../../vendor/hermet/room-config';

export const APP_ID = 'roslambo';
export const CURATED_RELAYS: string[] = declaredUrls(thirdParty, 'signaling');
export const STUN_URLS: string[] = declaredUrls(thirdParty, 'stun');

export interface RoomConfigInput {
  relays?: string[]; // replaces the curated relays: tests use a local relay
  extraRelays?: string[]; // Settings
  turn?: RTCIceServer[]; // Settings
  local?: boolean; // tests on one machine: no STUN, mDNS rewritten to loopback
  passive?: boolean; // witnesses (§8.7)
}

export function roomConfig(o: RoomConfigInput): JoinRoomConfig {
  return buildRoomConfig({
    appId: APP_ID,
    relays: [...(o.relays ?? CURATED_RELAYS), ...(o.extraRelays ?? [])],
    iceServers: [...(o.local ? [] : [{ urls: STUN_URLS }]), ...(o.turn ?? [])],
    maxReceiveBytes: 1024 * 1024,
    passive: o.passive,
    loopbackMdns: o.local,
  });
}
