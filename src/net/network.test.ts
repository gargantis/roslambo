// Rounds over the loopback network in simulated time (PLAN §8.9): every
// property but P6, before a browser is involved.

import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { makeParams } from '../core/sim/params';
import { scriptButtons } from '../core/sim/scripts';
import { FROZEN, RUNNING, type RoundState } from '../core/sim/state';
import { buildHash } from '../core/session/build';
import { Session, type SessionConfig } from '../core/session/session';
import * as M from '../core/protocol/messages';
import { LoopbackNet, mulberry32, type LoopNode, type LinkSpec } from './loopback';

type GameNode = LoopNode<Session>;

const P = makeParams();
const BUILD = buildHash(P.settings);
const id = (k: number): string => (k + 1).toString(16).padStart(32, '0');
const SETTINGS = { ante: 2, minPlayers: 3, maxPlayers: 8 };

function sessionConfig(k: number, over: Partial<SessionConfig> = {}): SessionConfig {
  return {
    params: P, me: id(k), name: `P${k}`, build: BUILD,
    timeline: { delay: config.inputDelayTicks, window: config.lateWindowTicks, voteWindow: config.voteWindowTicks, warmupMs: config.joinWarmupMs, settleMs: config.clockSettleMs },
    maxSpectators: config.maxSpectators, forwarding: true, ...over,
  };
}

function uniform(seed: number, lo: number, hi: number, jitter: number): (a: string, b: string) => LinkSpec {
  const r = mulberry32(seed);
  const memo = new Map<string, number>();
  return (a, b) => {
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (!memo.has(k)) memo.set(k, lo + r() * (hi - lo));
    return { base: memo.get(k)!, jitter };
  };
}

/** A node whose player (if it plays) presses scripted buttons. */
function node(net: LoopbackNet, k: number, over: Partial<SessionConfig> = {}, opts = {}, nodeId = `n${k}`): GameNode {
  return net.add(nodeId, (link) => {
    const s = new Session(sessionConfig(k, over), link);
    s.timeline.controls = () => scriptButtons(7, k, s.timeline.localTick);
    return s;
  }, opts);
}

/** The newest tick every node has final, and each node's hash there. */
function common(nodes: GameNode[]): { tick: number; hashes: string[] } {
  const tick = Math.min(...nodes.map((n) => n.session.timeline.finalTick));
  return { tick, hashes: nodes.map((n) => n.session.timeline.hashAt(tick)) };
}

function agreeNow(nodes: GameNode[]): void {
  const c = common(nodes);
  expect(c.hashes.every((h) => h !== ''), `tick ${c.tick} missing somewhere`).toBe(true);
  expect(new Set(c.hashes).size, `disagree at tick ${c.tick}: ${c.hashes.join(' ')}`).toBe(1);
}

function finalOf(n: GameNode): RoundState {
  return n.session.timeline.final;
}

/** Keeper n0 proposes at 0; players join, press Play, and Ready. */
function lobby(net: LoopbackNet, players: number[], readyAt: number, over: Partial<SessionConfig> = {}, settings = SETTINGS): GameNode[] {
  const keeper = node(net, 0, over);
  net.join(keeper, 0, (now) => keeper.session.propose(keeper.local(now), settings, 'a'.repeat(16)));
  const nodes = [keeper];
  for (const k of players) {
    const n = node(net, k, over);
    net.join(n, 200 * k, () => n.session.play());
    net.at(readyAt + 50 * k, () => n.session.ready());
    nodes.push(n);
  }
  return nodes;
}

describe('rounds over the network (PLAN §8.9)', () => {
  it('a proposer, three players and a late spectator play to the freeze and agree (P1, P2)', () => {
    const net = new LoopbackNet(1, uniform(11, 30, 60, 20));
    const nodes = lobby(net, [1, 2, 3], 2000);
    const spectator = node(net, 9);
    net.join(spectator, 20_000);
    nodes.push(spectator);
    net.run(240_000, () => nodes.every((n) => finalOf(n).phase === FROZEN));
    for (const n of nodes) expect(finalOf(n).phase, n.id).toBe(FROZEN);
    agreeNow(nodes);
    expect(new Set(nodes.map((n) => finalOf(n).freezeTick)).size).toBe(1);
    expect(finalOf(nodes[1]!).planets.map((p) => p.id)).toEqual([id(1), id(2), id(3)]);
    for (const n of nodes) {
      expect(n.session.timeline.stats.resyncs, `${n.id} resynced`).toBe(0);
      expect(n.session.timeline.stats.disagree, `${n.id} disagreed`).toBe(0);
    }
  });

  it('numbers players the same everywhere when they join at the same moment (P4)', () => {
    const net = new LoopbackNet(2, uniform(12, 10, 150, 40));
    const keeper = node(net, 0);
    net.join(keeper, 0, (now) => keeper.session.propose(keeper.local(now), SETTINGS, 'b'.repeat(16)));
    const nodes = [keeper];
    for (let k = 1; k <= 6; k++) {
      const n = node(net, k);
      net.join(n, 300, () => n.session.play());
      nodes.push(n);
    }
    net.run(8000);
    agreeNow(nodes);
    const rosters = nodes.map((n) => finalOf(n).planets.map((p) => p.id).join(','));
    expect(new Set(rosters).size).toBe(1);
    expect(finalOf(keeper).planets).toHaveLength(6);
  });

  it('outvotes and repairs a corrupted peer (P3)', () => {
    const net = new LoopbackNet(3, uniform(13, 30, 60, 20));
    const nodes = lobby(net, [1, 2, 3], 2000);
    net.at(30_000, () => {
      const t = nodes[2]!.session.timeline as unknown as { finalState: RoundState };
      t.finalState.planets[0]!.x += 1e-9;
    });
    net.run(60_000);
    agreeNow(nodes);
    expect(nodes[2]!.session.timeline.stats.resyncs).toBe(1);
    expect(nodes[2]!.session.timeline.stats.resyncMs[0]).toBeLessThan(1000);
  });

  it('keeps a pair that can’t connect in step through forwarding (P5)', () => {
    const run = (forwarding: boolean): GameNode[] => {
      const net = new LoopbackNet(4, uniform(14, 30, 60, 20));
      net.block('n1', 'n2');
      const nodes = lobby(net, [1, 2, 3], 2000, { forwarding });
      net.run(40_000);
      return nodes;
    };
    const withFwd = run(true);
    agreeNow(withFwd);
    for (const n of withFwd) expect(n.session.timeline.stats.resyncs, n.id).toBe(0);
    expect(finalOf(withFwd[0]!).phase).toBeGreaterThanOrEqual(RUNNING);
    // Without forwarding the blocked pair misses each other's inputs.
    const without = run(false);
    expect(without[1]!.session.timeline.stats.disagree + without[2]!.session.timeline.stats.disagree).toBeGreaterThan(0);
  });

  it('merges two timelines in one room, and the losing side’s player joins again (P7)', () => {
    const net = new LoopbackNet(5, uniform(15, 30, 60, 20));
    // Two halves that can't see each other, each with a keeper and a player.
    const a = node(net, 0);
    const b = node(net, 5);
    net.block('n0', 'n5');
    net.block('n0', 'n6');
    net.block('n1', 'n5');
    net.block('n1', 'n6');
    net.join(a, 0, (now) => a.session.propose(a.local(now), SETTINGS, 'c'.repeat(16)));
    net.join(b, 1500, (now) => b.session.propose(b.local(now), SETTINGS, 'd'.repeat(16)));
    const pa = node(net, 1);
    const pb = node(net, 6);
    net.join(pa, 500, () => pa.session.play());
    net.join(pb, 2000, () => pb.session.play());
    net.at(6000, () => {
      net.unblock('n0', 'n5');
      net.unblock('n0', 'n6');
      net.unblock('n1', 'n5');
      net.unblock('n1', 'n6');
    });
    net.run(14_000);
    const all = [a, b, pa, pb];
    expect(new Set(all.map((n) => n.session.timeline.id)).size).toBe(1);
    expect(a.session.timeline.id).toBe('c'.repeat(16)); // the older timeline wins
    agreeNow(all);
    expect(finalOf(a).planets.map((p) => p.id).sort()).toEqual([id(1), id(6)].sort());
  });

  it('lets a player who reloads mid-round take back its planet', () => {
    const net = new LoopbackNet(6, uniform(16, 30, 60, 20));
    const nodes = lobby(net, [1, 2, 3], 2000);
    net.leave(nodes[2]!, 20_000);
    const back = node(net, 2); // same player ID, a fresh page
    net.join(back, 25_000, () => back.session.play());
    net.run(40_000);
    const live = [nodes[0]!, nodes[1]!, nodes[3]!, back];
    agreeNow(live);
    const me = finalOf(nodes[0]!).planets.find((p) => p.id === id(2))!;
    expect(finalOf(nodes[0]!).tick - me.lastInputTick).toBeLessThan(30); // sending again
    expect(back.session.inRoster()).toBe(true);
  });

  it('carries on after the proposer leaves', () => {
    const net = new LoopbackNet(7, uniform(17, 30, 60, 20));
    const nodes = lobby(net, [1, 2, 3], 2000);
    net.leave(nodes[0]!, 4000);
    net.run(60_000);
    const players = nodes.slice(1);
    agreeNow(players);
    expect(finalOf(players[0]!).phase).not.toBe(0);
  });

  it('repairs a player beyond the late window, and the others never split', () => {
    const slow = (x: string, y: string): LinkSpec => ({ base: x === 'n3' || y === 'n3' ? 300 : 40, jitter: 20 });
    const net = new LoopbackNet(8, slow);
    const nodes = lobby(net, [1, 2, 3], 2000);
    net.run(40_000);
    agreeNow([nodes[0]!, nodes[1]!, nodes[2]!]);
    expect(nodes[1]!.session.timeline.stats.resyncs).toBe(0);
    expect(nodes[3]!.session.timeline.stats.resyncs).toBeGreaterThan(0);
  });

  it('refuses a mismatched build, a duplicate player and a fifth spectator', () => {
    const net = new LoopbackNet(9, uniform(19, 20, 30, 5));
    const nodes = lobby(net, [1, 2, 3], 100_000);
    const wrong = node(net, 4, { build: 'f'.repeat(16) });
    net.join(wrong, 1000);
    const twin = node(net, 1, {}, {}, 'twin'); // the same player as n1, from another tab
    net.join(twin, 1500);
    for (let k = 0; k < 5; k++) net.join(node(net, 20 + k), 2000 + 100 * k);
    net.run(6000);
    const reasons = net.refusals.map((r) => r.reason);
    expect(reasons).toContain(M.REFUSAL.BUILD);
    expect(reasons).toContain(M.REFUSAL.DUPLICATE);
    expect(reasons).toContain(M.REFUSAL.SPECTATORS_FULL);
    agreeNow(nodes);
  });

  it('turns a player who joins after the countdown starts into a spectator', () => {
    const net = new LoopbackNet(10, uniform(20, 30, 60, 20));
    const nodes = lobby(net, [1, 2, 3], 2000);
    const late = node(net, 4);
    net.join(late, 8000, () => late.session.play());
    net.run(14_000);
    expect(late.session.refused).toBe(true);
    expect(late.session.timeline.sending).toBe(false);
    agreeNow([...nodes, late]);
  });

  it('confirms the freeze by vote on every peer before results count, and AGAIN reaches the room (D-10)', () => {
    const net = new LoopbackNet(11, uniform(21, 30, 60, 20));
    const nodes = lobby(net, [1, 2, 3], 2000);
    const confirmed = (n: GameNode): boolean => finalOf(n).phase === FROZEN && n.session.timeline.isConfirmed(finalOf(n).freezeTick);
    const atFreeze = new Map<string, boolean>(); // confirmed the moment it froze?
    const watch = (): void => {
      for (const n of nodes) if (finalOf(n).phase === FROZEN && !atFreeze.has(n.id)) atFreeze.set(n.id, confirmed(n));
      if (atFreeze.size < nodes.length) net.at(net.now + 4, watch);
    };
    net.at(0, watch);
    net.run(240_000, () => atFreeze.size === nodes.length);
    expect([...atFreeze.values()], 'the vote trails the freeze').toEqual(nodes.map(() => false));
    net.run(net.now + 2000, () => nodes.every(confirmed));
    for (const n of nodes) expect(confirmed(n), n.id).toBe(true);
    nodes[1]!.session.announceAgain();
    net.run(net.now + 1000);
    for (const n of [nodes[0]!, nodes[2]!, nodes[3]!]) expect(n.session.againSeen, n.id).toBe(true);
    expect(nodes[1]!.session.againSeen).toBe(false);
  });

  it('a page whose timers stopped takes the timeline from a peer again when shown (D-23)', () => {
    const net = new LoopbackNet(12, uniform(22, 30, 60, 20));
    const nodes = lobby(net, [1, 2, 3], 2000, {}, { ...SETTINGS, ante: 50 }); // still running when it returns
    const frozen = nodes[2]!;
    net.pace(frozen, 20_000, Infinity); // frozen: no timers at all
    net.pace(frozen, 23_000, 4);
    net.at(23_000, () => expect(frozen.session.rejoin()).toBe(true)); // what Game does when shown
    net.run(26_000);
    const s0 = finalOf(nodes[0]!);
    const me = s0.planets.find((p) => p.id === id(2))!;
    expect(s0.phase).toBe(RUNNING);
    expect(s0.tick - me.lastInputTick).toBeLessThan(30); // in control again
    expect(frozen.session.inRoster()).toBe(true);
    net.run(40_000);
    agreeNow(nodes);
  });

  it('a hidden page, its timers throttled to once a second, keeps its planet, number and Ready (D-23)', () => {
    const net = new LoopbackNet(13, uniform(23, 30, 60, 20));
    const nodes = lobby(net, [1, 2, 3], 100_000); // nobody readies on schedule
    const hidden = nodes[2]!;
    net.at(3000, () => hidden.session.ready());
    net.pace(hidden, 4000, 1000);
    net.pace(hidden, 12_000, 4);
    const rosters = new Set<string>();
    const watch = (): void => {
      for (const n of nodes) rosters.add(finalOf(n).planets.map((p) => p.id).join(','));
      if (net.now < 14_000) net.at(net.now + 100, watch);
    };
    net.at(3500, watch);
    net.run(14_000);
    expect([...rosters]).toEqual([[id(1), id(2), id(3)].join(',')]); // never removed, never renumbered
    const p2 = finalOf(nodes[0]!).planets.find((p) => p.id === id(2))!;
    expect(p2.readyUntil).toBeGreaterThan(finalOf(nodes[0]!).tick);
    agreeNow(nodes);
  });

  it('a page frozen for 4 s before the countdown is disconnected: removed, then joins again at the end (Q-15)', () => {
    const net = new LoopbackNet(14, uniform(24, 30, 60, 20));
    const nodes = lobby(net, [1, 2, 3], 100_000);
    const frozen = nodes[1]!; // player 1
    net.pace(frozen, 4000, Infinity);
    net.pace(frozen, 8000, 4);
    net.at(8000, () => frozen.session.rejoin());
    net.run(7900);
    expect(finalOf(nodes[0]!).planets.map((p) => p.id)).toEqual([id(2), id(3)]);
    net.run(14_000);
    expect(finalOf(nodes[0]!).planets.map((p) => p.id)).toEqual([id(2), id(3), id(1)]);
    agreeNow(nodes);
  });
});
