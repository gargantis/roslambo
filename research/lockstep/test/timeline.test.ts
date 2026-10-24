// Timeline properties on the virtual network (PLAN §8.9 P1–P3), before
// any browser is involved.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botInput } from '../src/bots.ts';
import { DEFAULT_SIM } from '../src/sim.ts';
import type { TimelineConfig } from '../src/timeline.ts';
import { mulberry32, VNet, type VPeer } from './vnet.ts';

function cfg(n: number, me: number, extra: Partial<TimelineConfig> = {}): TimelineConfig {
  return {
    sim: { ...DEFAULT_SIM, n },
    me,
    delay: 2,
    window: 12,
    voteWindow: 12,
    inputSource: me >= 0 ? (t) => botInput(me + 1, t) : undefined,
    ...extra,
  };
}

/** Every peer has the same hash at each of these checkpoints. */
function assertAgree(peers: VPeer[], ticks: number[]): void {
  for (const t of ticks) {
    const hashes = peers.map((p) => p.tl.stats.checkpoints[t]);
    assert.ok(hashes.every((h) => h !== undefined), `checkpoint ${t} missing: ${JSON.stringify(hashes)}`);
    assert.equal(new Set(hashes).size, 1, `checkpoint ${t} differs: ${JSON.stringify(hashes)}`);
  }
}

function uniform(seed: number, base: [number, number], jitter: number) {
  const r = mulberry32(seed);
  const memo = new Map<string, number>();
  return (a: number, b: number) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!memo.has(k)) memo.set(k, base[0] + r() * (base[1] - base[0]));
    return { base: memo.get(k)!, jitter };
  };
}

test('three players on 30-60 ms links agree on every final tick', () => {
  const net = new VNet(1, uniform(11, [30, 60], 20));
  const peers = [0, 1, 2].map((me) =>
    net.add({ cfg: cfg(3, me), joinAt: me * 300, clockOffset: me * 7919, drift: (me - 1) * 0.002 }));
  net.run(60_000);
  assertAgree(peers, [1000, 2000, 3000]);
  for (const p of peers) {
    assert.equal(p.tl.stats.disagree, 0, `${p.id} disagreed`);
    assert.equal(p.tl.stats.resyncs, 0, `${p.id} resynced`);
  }
});

test('a corrupted peer is outvoted and repaired within a second', () => {
  const net = new VNet(2, uniform(12, [30, 60], 20));
  const peers = [0, 1, 2].map((me) =>
    net.add({ cfg: cfg(3, me, me === 2 ? { corruptAt: 1500 } : {}), joinAt: me * 300 }));
  net.run(60_000);
  assertAgree(peers, [2000, 3000]);
  const bad = peers[2]!.tl.stats;
  assert.equal(bad.resyncs, 1);
  assert.ok(bad.resyncMs[0]! < 1000, `repair took ${bad.resyncMs[0]} ms`);
  assert.equal(peers[0]!.tl.stats.resyncs, 0);
  assert.equal(peers[1]!.tl.stats.resyncs, 0);
});

test('eight players and four spectators agree, spectators joining late', () => {
  const net = new VNet(3, uniform(13, [20, 120], 30));
  const peers: VPeer[] = [];
  for (let me = 0; me < 8; me++) peers.push(net.add({ cfg: cfg(8, me), joinAt: me * 250, drift: (me % 3 - 1) * 0.003 }));
  for (let s = 0; s < 4; s++) peers.push(net.add({ cfg: cfg(8, -1), joinAt: 5000 + s * 3000 }));
  net.run(50_000);
  assertAgree(peers, [1000, 2000]);
  for (const p of peers) assert.equal(p.tl.stats.resyncs, 0, `${p.id} resynced`);
  const perPeerPerSecond = net.messages / 50 / peers.length;
  assert.ok(perPeerPerSecond > 0);
});

test('a player that stops sending drifts identically everywhere', () => {
  const net = new VNet(4, uniform(14, [30, 60], 20));
  const peers = [0, 1, 2].map((me) =>
    net.add({ cfg: cfg(3, me, me === 1 ? { stopSendingAt: 600 } : {}), joinAt: me * 300 }));
  net.run(60_000);
  assertAgree(peers, [1000, 2000, 3000]);
  assert.ok(peers[0]!.tl.stats.missingAtFinal[1]! > 2000);
});

test('a peer beyond the late window is repaired, and the others never split', () => {
  // Player 2 is 300 ms from everyone: its inputs reach the others after
  // they are final, and theirs reach it late too.
  const slow = (a: number, b: number) => ({ base: a === 2 || b === 2 ? 300 : 40, jitter: 20 });
  const net = new VNet(5, slow);
  const peers = [0, 1, 2].map((me) => net.add({ cfg: cfg(3, me), joinAt: me * 300 }));
  net.run(60_000);
  assertAgree([peers[0]!, peers[1]!], [1000, 2000, 3000]);
  assert.equal(peers[0]!.tl.stats.resyncs, 0);
  assert.ok(peers[2]!.tl.stats.resyncs > 0, 'the slow peer never resynced');
  assert.ok(peers[2]!.tl.stats.lateVoteFlips > 0, 'late votes should have caught the slow peer');
});

test('two players: a tie resolves the same way on both (C-19)', () => {
  const net = new VNet(6, uniform(16, [30, 60], 20));
  const peers = [0, 1].map((me) =>
    net.add({ cfg: cfg(2, me, me === 1 ? { corruptAt: 1500 } : {}), joinAt: me * 300 }));
  net.run(60_000);
  // Either history may win the tie; both peers must hold the same one.
  assertAgree(peers, [2000, 3000]);
});

test('a player who reloads mid-round takes back its planet', () => {
  const net = new VNet(7, uniform(17, [30, 60], 20));
  const peers = [0, 1, 2].map((me) => net.add({ cfg: cfg(3, me), joinAt: me * 300 }));
  net.dropAt(peers[1]!, 20_000);
  const back = net.add({ cfg: cfg(3, 1), joinAt: 25_000 });
  net.run(60_000);
  assertAgree([peers[0]!, peers[2]!, back], [2000, 3000]);
  // About 5 s of absence, then inputs again: far fewer missing ticks than if it stayed away.
  const missing = peers[0]!.tl.stats.missingAtFinal[1]!;
  assert.ok(missing > 250 && missing < 450, `player 1 missing for ${missing} ticks`);
});
