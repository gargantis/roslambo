import { describe, expect, it } from 'vitest';
import { roomConfig } from './room-config';

// D-13: roslambo contacts only the hosts in third-party.json.
describe('room config', () => {
  it('uses exactly the curated relays and STUN servers by default', () => {
    const c = roomConfig({});
    expect(c.relayConfig?.urls).toEqual([
      'wss://relay.damus.io', 'wss://relay.primal.net', 'wss://nos.lol',
      'wss://offchain.pub', 'wss://nostr.bitcoiner.social', 'wss://yabu.me/v2',
    ]);
    expect(c.rtcConfig?.iceServers).toEqual([{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]);
    expect(c.maxReceiveBytes).toBe(1024 * 1024);
  });

  it('always sets iceServers, so Trystero never adds its own STUN defaults', () => {
    expect(roomConfig({ local: true }).rtcConfig?.iceServers).toEqual([]);
    const turn = { urls: 'turn:turn.example.test:3478', username: 'u', credential: 'c' };
    expect(roomConfig({ turn: [turn] }).rtcConfig?.iceServers).toContainEqual(turn);
  });

  it('adds the user’s relays, and never passes an empty list', () => {
    expect(roomConfig({ extraRelays: ['wss://mine.example.test'] }).relayConfig?.urls).toContain('wss://mine.example.test');
    expect(() => roomConfig({ relays: [] })).toThrow();
  });
});
