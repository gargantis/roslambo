import { describe, expect, it } from 'vitest';
import thirdParty from '../../third-party.json';

// PLAN §18 and REQUIREMENTS "Stack": third-party.json is the single list of
// external hosts. It drives the runtime (M3) and the dist audit.
describe('third-party.json', () => {
  it('names exactly the six curated relays', () => {
    expect(thirdParty.filter((e) => e.kind === 'signaling').map((e) => e.url)).toEqual([
      'wss://relay.damus.io', 'wss://relay.primal.net', 'wss://nos.lol',
      'wss://offchain.pub', 'wss://nostr.bitcoiner.social', 'wss://yabu.me/v2',
    ]);
  });

  it('names exactly the two STUN servers', () => {
    expect(thirdParty.filter((e) => e.kind === 'stun').map((e) => e.url)).toEqual([
      'stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302',
    ]);
  });

  it('says who runs each host and what it sees', () => {
    for (const e of thirdParty) {
      expect(e.operator.length).toBeGreaterThan(0);
      expect(e.sees.length).toBeGreaterThan(0);
      expect(new URL(e.url).hostname || e.url.split(':')[1]).toContain(e.host);
    }
  });
});
