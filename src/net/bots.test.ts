// Bots over the loopback network in simulated time (Q-23): hosted by a
// player or a spectator, their inputs in the host's TICKs, one vote per
// host however many bots it has, taken back after a reload, gone when
// their host leaves, and forwarded like any input (D-14).

import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { botId, botIds } from '../core/bot/bot';
import * as M from '../core/protocol/messages';
import { buildHash } from '../core/session/build';
import { Session, type SessionConfig } from '../core/session/session';
import { makeParams } from '../core/sim/params';
import { scriptButtons } from '../core/sim/scripts';
import { FROZEN, PRESTART, RUNNING, type RoundSettings, type RoundState } from '../core/sim/state';
import { Timeline } from '../core/timeline/timeline';
import { LoopbackNet, mulberry32, type LinkSpec, type LoopNode } from './loopback';

type GameNode = LoopNode<Session>;

const P = makeParams();
const BUILD = buildHash(P.settings);
const id = (k: number): string => (k + 1).toString(16).padStart(32, '0');
const TIMELINE = { delay: config.inputDelayTicks, window: config.lateWindowTicks, voteWindow: config.voteWindowTicks, warmupMs: config.joinWarmupMs, settleMs: config.clockSettleMs };
const LONG: RoundSettings = { ante: 50, minPlayers: 3, maxPlayers: 8 }; // still running when the test looks

function sessionConfig(k: number): SessionConfig {
  return { params: P, me: id(k), name: `P${k}`, build: BUILD, timeline: TIMELINE, maxSpectators: config.maxSpectators, forwarding: true };
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

function node(net: LoopbackNet, k: number, nodeId = `n${k}`): GameNode {
  return net.add(nodeId, (link) => {
    const s = new Session(sessionConfig(k), link);
    s.timeline.controls = () => scriptButtons(7, k, s.timeline.localTick);
    return s;
  });
}

function finalOf(n: GameNode): RoundState {
  return n.session.timeline.final;
}

function agreeNow(nodes: GameNode[]): void {
  const tick = Math.min(...nodes.map((n) => n.session.timeline.finalTick));
  const hashes = nodes.map((n) => n.session.timeline.hashAt(tick));
  expect(hashes.every((h) => h !== ''), `tick ${tick} missing somewhere`).toBe(true);
  expect(new Set(hashes).size, `disagree at tick ${tick}: ${hashes.join(' ')}`).toBe(1);
}

/** Ticks since a planet's last input, in a node's final state. */
function silentFor(n: GameNode, planet: string): number {
  const s = finalOf(n);
  return s.tick - s.planets.find((p) => p.id === planet)!.lastInputTick;
}

function corrupt(n: GameNode): void {
  const t = n.session.timeline as unknown as { finalState: RoundState };
  t.finalState.planets[0]!.x += 1e-9;
}

/** Keeper n0 proposes and watches; each player joins, plays and is ready
 *  by 2 s; a player's `bots` join with it. */
function room(net: LoopbackNet, players: { k: number; bots?: number }[], settings = LONG, readyAt = 2000): GameNode[] {
  const keeper = node(net, 0);
  net.join(keeper, 0, (now) => keeper.session.propose(keeper.local(now), settings, 'b0'.repeat(8)));
  const nodes = [keeper];
  for (const { k, bots = 0 } of players) {
    const n = node(net, k);
    net.join(n, 200 * k, () => {
      n.session.play();
      for (let b = 0; b < bots; b++) n.session.addBot();
    });
    net.at(readyAt + 50 * k, () => n.session.ready());
    nodes.push(n);
  }
  return nodes;
}

describe('bots over the network (Q-23)', () => {
  it('lets a player alone play to the confirmed freeze against two bots it hosts', () => {
    const net = new LoopbackNet(31, uniform(41, 30, 60, 20));
    const solo = node(net, 0);
    net.join(solo, 0, (now) => {
      solo.session.propose(solo.local(now), { ante: 2, minPlayers: 3, maxPlayers: 3 }, 'b1'.repeat(8));
      solo.session.play();
      expect(solo.session.addBot()).toBe(true);
      expect(solo.session.addBot()).toBe(true);
      expect(solo.session.addBot(), 'no seat left').toBe(false);
    });
    net.at(3000, () => {
      expect(finalOf(solo).phase, 'the bots wait for the player').toBe(PRESTART);
      solo.session.ready();
    });
    const confirmed = (): boolean => finalOf(solo).phase === FROZEN && solo.session.timeline.isConfirmed(finalOf(solo).freezeTick);
    net.run(240_000, confirmed);
    expect(confirmed()).toBe(true);
    expect(finalOf(solo).planets.map((p) => p.id).sort()).toEqual([id(0), ...botIds(id(0)).slice(0, 2)].sort());
    expect(finalOf(solo).planets.find((p) => p.id === botIds(id(0))[0])!.name).toMatch(/^Bot [0-9A-F]{4}$/);
  });

  // Two players and a spectator's bot. When one player's state goes wrong,
  // the other player and the spectator outvote it, 2 to 1. Were the
  // spectator's vote not counted, the 1–1 tie would go to the smaller hash,
  // and in some of these runs repair the honest player instead.
  it.each([1, 2, 3, 4])('lets a spectator fill a seat with a bot, and counts its vote, once (seed %i)', (seed) => {
    const net = new LoopbackNet(40 + seed, uniform(50 + seed, 30, 60, 20));
    const nodes = room(net, [{ k: 1 }, { k: 2 }]);
    const host = node(net, 9);
    net.join(host, 600, () => expect(host.session.addBot(), 'waits for a timeline').toBe(true));
    nodes.push(host);
    net.at(30_000, () => corrupt(nodes[1]!));
    net.run(45_000);
    const s = finalOf(nodes[2]!);
    expect(s.phase).toBe(RUNNING);
    expect(s.planets.map((p) => p.id)).toEqual([id(1), id(2), botId(id(9), 0)]);
    expect(host.session.inRoster()).toBe(false);
    agreeNow(nodes);
    expect(nodes[1]!.session.timeline.stats.resyncs, 'the wrong player').toBe(1);
    expect(nodes[2]!.session.timeline.stats.resyncs, 'the right player').toBe(0);
    expect(host.session.timeline.stats.resyncs, 'the host').toBe(0);
  });

  it('gives a host one vote however many bots it has: two players outvote it', () => {
    const net = new LoopbackNet(32, uniform(42, 30, 60, 20));
    const nodes = room(net, [{ k: 1, bots: 2 }, { k: 2 }, { k: 3 }]);
    net.at(30_000, () => corrupt(nodes[1]!));
    net.run(45_000);
    expect(finalOf(nodes[2]!).planets).toHaveLength(5);
    agreeNow(nodes);
    expect(nodes[1]!.session.timeline.stats.resyncs, 'the host').toBe(1);
    expect(nodes[2]!.session.timeline.stats.resyncs).toBe(0);
    expect(nodes[3]!.session.timeline.stats.resyncs).toBe(0);
  });

  it('lets a host that reloads mid-round take back its bots', () => {
    const net = new LoopbackNet(33, uniform(43, 30, 60, 20));
    const nodes = room(net, [{ k: 1, bots: 2 }, { k: 2 }]);
    const bots = botIds(id(1)).slice(0, 2);
    net.leave(nodes[1]!, 20_000);
    net.at(24_000, () => {
      for (const b of bots) expect(silentFor(nodes[2]!, b), 'drifting while the host is away').toBeGreaterThan(120);
    });
    const back = node(net, 1, 'n1-again'); // the same player ID, a fresh page
    net.join(back, 25_000, () => back.session.play());
    net.run(40_000);
    const live = [nodes[0]!, nodes[2]!, back];
    agreeNow(live);
    expect(finalOf(nodes[2]!).phase).toBe(RUNNING);
    expect(back.session.hostedBots().sort()).toEqual([...bots].sort());
    for (const b of bots) expect(silentFor(nodes[2]!, b), 'in control again').toBeLessThan(30);
  });

  it('takes out the newest bot on Remove, and the rest with their host when it leaves', () => {
    const net = new LoopbackNet(34, uniform(44, 30, 60, 20));
    const nodes = room(net, [{ k: 1, bots: 3 }], LONG, 100_000); // nobody readies
    const [b0, b1, b2] = botIds(id(1));
    const roster = (): string[] => finalOf(nodes[0]!).planets.map((p) => p.id).sort();
    net.at(5000, () => {
      expect(roster()).toEqual([id(1), b0!, b1!, b2!].sort());
      expect(nodes[1]!.session.removeBot()).toBe(true);
    });
    net.at(6000, () => {
      expect(roster()).toEqual([id(1), b0!, b1!].sort());
      expect(nodes[1]!.session.hostedBots()).toEqual([b0, b1]);
      nodes[1]!.session.leave();
    });
    net.leave(nodes[1]!, 6400); // Game closes the room once its LEAVEs are out
    // Silence alone would take 3 s to remove them (Q-15).
    net.run(7000);
    expect(roster()).toEqual([]);
  });

  it('forwards a host’s bots to a player who can’t reach the host (D-14)', () => {
    const net = new LoopbackNet(35, uniform(45, 30, 60, 20));
    net.block('n9', 'n2');
    const nodes = room(net, [{ k: 1 }, { k: 2 }]);
    const host = node(net, 9);
    net.join(host, 600, () => host.session.addBot());
    nodes.push(host);
    net.run(40_000);
    agreeNow(nodes);
    expect(finalOf(nodes[2]!).phase).toBe(RUNNING);
    expect(silentFor(nodes[2]!, botId(id(9), 0))).toBeLessThan(30);
    for (const n of nodes) expect(n.session.timeline.stats.resyncs, n.id).toBe(0);
  });

  it('takes a bot’s inputs only from its host', () => {
    const tl = new Timeline({ ...TIMELINE, params: P, me: id(0) }, { broadcast() {}, sendToPlayer: () => false, sendToPeer() {} });
    tl.start(0, LONG, 'b2'.repeat(8));
    const theirs = botId(id(1), 0);
    const quiet = { histMask: 0, hist: new Array<number>(M.HISTORY).fill(0), events: [] };
    const tick: M.Tick = {
      type: M.T.TICK, t: 1, own: false, buttons: 0, voteTick: M.NO_TICK, voteHash: M.ZERO_HASH, phase: 0, ...quiet,
      bots: [{ id: theirs, buttons: 7, ...quiet }],
    };
    tl.onTick(id(2), tick, 0);
    expect(tl.headButtons(theirs), 'from another peer').toBe(0);
    tl.onTick(id(1), tick, 0);
    expect(tl.headButtons(theirs), 'from its host').toBe(7);
  });
});
