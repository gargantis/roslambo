// M5 in simulated time (PLAN §8.5, §8.7, §9.4): pause and resume from
// saved states, two histories meeting (Q-7), missed results through
// settlers and witnesses (P6, D-19), and connections closed for floods and
// garbage. The browser's glue (saving, the ledger) is played by the test.

import { describe, expect, it } from 'vitest';
import { config } from '../config';
import * as M from '../core/protocol/messages';
import { resultRecord } from '../core/results/record';
import { ResultsPeer } from '../core/session/results-peer';
import type { Link, RoomPeer } from '../core/session/room-peer';
import { buildHash } from '../core/session/build';
import { resumedTimelineId, Session, type SavedTimeline, type SessionConfig } from '../core/session/session';
import { encodeState } from '../core/sim/codec';
import { hash64 } from '../core/sim/hash';
import { makeParams } from '../core/sim/params';
import { scriptButtons } from '../core/sim/scripts';
import { cloneState, FROZEN, RUNNING, type RoundState } from '../core/sim/state';
import { LoopbackNet, mulberry32, type LinkSpec, type LoopNode } from './loopback';

const P = makeParams();
const BUILD = buildHash(P.settings);
const id = (k: number): string => (k + 1).toString(16).padStart(32, '0');
const SETTINGS = { ante: 2, minPlayers: 3, maxPlayers: 8 };
const LONG = { ...SETTINGS, ante: 50 }; // pause tests: no freeze while one player plays on alone
type GameNode = LoopNode<Session>;

function cfg(k: number): SessionConfig {
  return {
    params: P, me: id(k), name: `P${k}`, build: BUILD,
    timeline: { delay: config.inputDelayTicks, window: config.lateWindowTicks, voteWindow: config.voteWindowTicks, warmupMs: config.joinWarmupMs, settleMs: config.clockSettleMs },
    maxSpectators: config.maxSpectators, forwarding: true,
  };
}

function uniform(seed: number): (a: string, b: string) => LinkSpec {
  const r = mulberry32(seed);
  const memo = new Map<string, number>();
  return (a, b) => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (!memo.has(key)) memo.set(key, 30 + r() * 30);
    return { base: memo.get(key)!, jitter: 20 };
  };
}

function node(net: LoopbackNet, k: number, nodeId: string, saved: SavedTimeline | null = null): GameNode {
  return net.add(nodeId, (link) => {
    const s = new Session(cfg(k), link);
    s.saved = saved;
    s.timeline.controls = () => scriptButtons(7, k, s.timeline.localTick);
    return s;
  });
}

/** A keeper (k = 0) and players 1–3, Ready at 2 s. */
function lobby(net: LoopbackNet, settings = SETTINGS): GameNode[] {
  const keeper = node(net, 0, 'n0');
  net.join(keeper, 0, (now) => keeper.session.propose(keeper.local(now), settings, 'a'.repeat(16)));
  const nodes = [keeper];
  for (const k of [1, 2, 3]) {
    const n = node(net, k, `n${k}`);
    net.join(n, 200 * k, () => n.session.play());
    net.at(2000 + 50 * k, () => n.session.ready());
    nodes.push(n);
  }
  return nodes;
}

/** What Game saves every second (§10). */
function save(n: GameNode): SavedTimeline {
  const t = n.session.timeline;
  const state = cloneState(t.final);
  return { timelineId: t.id, state, hash: hash64(encodeState(state)) };
}

const finalOf = (n: GameNode): RoundState => n.session.timeline.final;

function agree(nodes: GameNode[]): void {
  const tick = Math.min(...nodes.map((n) => n.session.timeline.finalTick));
  const hashes = nodes.map((n) => n.session.timeline.hashAt(tick));
  expect(hashes.every(Boolean), `tick ${tick} missing`).toBe(true);
  expect(new Set(hashes).size, `disagree at ${tick}`).toBe(1);
}

describe('pause and resume (§8.5, Q-7)', () => {
  it('a player who returns alone resumes from its save, and a later one joins it: live beats saved', () => {
    const net = new LoopbackNet(31, uniform(41));
    const nodes = lobby(net, LONG);
    let saves: SavedTimeline[] = [];
    net.at(20_000, () => {
      saves = nodes.map(save);
      for (const n of nodes) net.leave(n, net.now);
    });
    net.run(20_001);
    expect(saves[1]!.state.phase).toBe(RUNNING);
    const back1 = node(net, 1, 'b1', saves[1]!);
    net.join(back1, 25_000, () => back1.session.play());
    net.run(40_000);
    const t = back1.session.timeline;
    expect(t.started).toBe(true);
    expect(t.id).toBe(resumedTimelineId(saves[1]!.hash, id(1)));
    expect(t.finalTick).toBeGreaterThan(saves[1]!.state.tick + 500);
    expect(finalOf(back1).planets.map((p) => p.id)).toEqual([id(1), id(2), id(3)]);
    const mine = finalOf(back1).planets[0]!;
    expect(finalOf(back1).tick - mine.lastInputTick).toBeLessThan(30); // in control
    const other = finalOf(back1).planets[1]!;
    expect(other.lastInputTick).toBeLessThanOrEqual(saves[1]!.state.tick); // drifting

    // Player 2 comes back with its own, older-timeline save: the live round wins.
    const back2 = node(net, 2, 'b2', saves[2]!);
    net.join(back2, 40_000, () => back2.session.play());
    net.run(55_000);
    expect(back2.session.timeline.id).toBe(t.id);
    expect(back2.session.saved).toBeNull();
    agree([back1, back2]);
    const p2 = finalOf(back1).planets.find((p) => p.id === id(2))!;
    expect(finalOf(back1).tick - p2.lastInputTick).toBeLessThan(30);
  });

  it('of two saves that meet, the later tick wins and only its player resumes (Q-7)', () => {
    const net = new LoopbackNet(32, uniform(42));
    const nodes = lobby(net, LONG);
    const saves: SavedTimeline[] = [];
    net.at(15_000, () => {
      saves[2] = save(nodes[2]!);
      net.leave(nodes[2]!, net.now);
    });
    net.at(25_000, () => {
      for (const k of [0, 1, 3]) {
        saves[k] = save(nodes[k]!);
        net.leave(nodes[k]!, net.now);
      }
    });
    net.run(25_001);
    expect(saves[1]!.state.tick).toBeGreaterThan(saves[2]!.state.tick);
    // Both come back at once.
    const older = node(net, 2, 'b2', saves[2]!);
    const newer = node(net, 1, 'b1', saves[1]!);
    net.join(older, 30_000, () => older.session.play());
    net.join(newer, 30_000, () => newer.session.play());
    net.run(50_000);
    expect(newer.session.timeline.id).toBe(resumedTimelineId(saves[1]!.hash, id(1)));
    expect(older.session.timeline.id).toBe(newer.session.timeline.id);
    agree([older, newer]);
    // Player 2's history after it left is player 1's, not its own.
    const p2 = finalOf(newer).planets.find((p) => p.id === id(2))!;
    expect(finalOf(newer).tick - p2.lastInputTick).toBeLessThan(30);
  });
});

/** The witness side of Game: hold the confirmed result, collect SETTLED. */
function witness(n: GameNode, acks: string[]): () => boolean {
  return () => {
    const t = n.session.timeline;
    const s = t.final;
    if (n.session.resultRecord || s.phase !== FROZEN || !t.isConfirmed(s.freezeTick)) return false;
    n.session.resultRecord = resultRecord('R', s);
    n.session.onSettled = (player) => acks.push(player);
    return true;
  };
}

describe('missed results (§8.7, P6)', () => {
  it('a player who missed the end collects its result once, and the witnesses hear that it settled', () => {
    const net = new LoopbackNet(33, uniform(43));
    const nodes = lobby(net);
    net.leave(nodes[3]!, 12_000); // player 3 closes its tab mid-round
    const acks: string[][] = [[], [], []];
    const ready = nodes.slice(0, 3).map((n, i) => witness(n, acks[i]!));
    const poll = (): void => {
      ready.forEach((f) => f());
      net.at(net.now + 100, poll);
    };
    net.at(0, poll);
    net.run(300_000, () => nodes.slice(0, 3).every((n) => n.session.resultRecord !== null));
    const record = nodes[1]!.session.resultRecord!;
    expect(record.players.map((p) => p.player)).toContain(id(3));

    const results: M.ResultRecord[] = [];
    const settler = net.add('s3', (link) => new ResultsPeer({ me: id(3), name: 'P3', build: BUILD, roundId: 'R', role: M.ROLE.SETTLER }, link, {
      onResult: (r) => results.push(r),
    }));
    net.join(settler, net.now + 1000);
    net.run(net.now + 5000);
    expect(results).toHaveLength(1); // three witnesses answered; it settled once
    expect(results[0]).toEqual(record);
    expect(settler.session.settled).toBe(true);
    for (const a of acks) expect(a).toEqual([id(3)]);
  });

  it('a settler that finds the round still running says so instead of asking', () => {
    const net = new LoopbackNet(34, uniform(44));
    lobby(net);
    let running = 0;
    const settler = net.add('s9', (link) => new ResultsPeer({ me: id(9), name: '', build: BUILD, roundId: 'R', role: M.ROLE.SETTLER }, link, {
      onRunning: () => running++,
      onResult: () => { throw new Error('no result yet'); },
    }));
    net.join(settler, 15_000);
    net.run(20_000);
    expect(running).toBe(4); // one per peer
  });

  it('a witness without a game answers, and drops the player who settled', () => {
    const net = new LoopbackNet(35, uniform(45));
    const record: M.ResultRecord = { round: 'R', ante: 2, freezeTick: 999, finalHash: 'ab'.repeat(8), players: [{ player: id(1), name: 'A', points: 4 }, { player: id(2), name: 'B', points: 0 }] };
    const acked: string[] = [];
    const w = net.add('w', (link) => {
      const p = new ResultsPeer({ me: id(1), name: 'A', build: BUILD, roundId: 'R', role: M.ROLE.WITNESS }, link, { onSettled: (x) => acked.push(x) });
      p.record = record;
      return p;
    });
    const got: M.ResultRecord[] = [];
    const s = net.add('s', (link) => new ResultsPeer({ me: id(2), name: 'B', build: BUILD, roundId: 'R', role: M.ROLE.SETTLER }, link, { onResult: (r) => got.push(r) }));
    const stranger = net.add('x', (link) => new ResultsPeer({ me: id(7), name: '', build: BUILD, roundId: 'R', role: M.ROLE.SETTLER }, link, { onResult: (r) => got.push(r) }));
    net.join(w, 0);
    net.join(s, 500);
    net.join(stranger, 600);
    net.run(3000);
    expect(got).toEqual([record]); // the stranger isn't in it, so nothing settles for it
    expect(acked).toEqual([id(2)]);
  });
});

/** A peer that misbehaves once connected. */
class Rogue implements RoomPeer {
  private readonly link: Link;
  private readonly bytes: Uint8Array;
  private readonly perAdvance: number;
  private readonly peers = new Set<string>();
  sent = 0;
  constructor(link: Link, bytes: Uint8Array, perAdvance: number) {
    this.link = link;
    this.bytes = bytes;
    this.perAdvance = perAdvance;
  }
  hello(): M.Hello {
    return { type: M.T.HELLO, protocol: M.PROTOCOL_VERSION, build: BUILD, player: id(66), role: M.ROLE.SPECTATOR, timeline: M.ZERO_HASH, timelineKind: M.TIMELINE.NONE, phase: 0, finalTick: 0, hash: M.ZERO_HASH, holdsResult: false, name: '' };
  }
  checkHello(hello: M.Hello): { ok: true; hello: M.Hello } {
    return { ok: true, hello };
  }
  onPeerJoin(peer: string): void {
    this.peers.add(peer);
  }
  onPeerLeave(peer: string): void {
    this.peers.delete(peer);
  }
  onRtt(): void {}
  onMessage(): void {}
  advance(): void {
    for (let i = 0; i < this.perAdvance && this.peers.size > 0; i++) {
      this.link.broadcast(this.bytes);
      this.sent++;
    }
  }
}

describe('closing connections that misbehave (§9.4)', () => {
  const tick = M.encodeTick({ t: 5, own: true, buttons: 1, voteTick: M.NO_TICK, voteHash: M.ZERO_HASH, phase: 0, histMask: 0, hist: new Array<number>(16).fill(0), events: [], bots: [] });

  it('closes a peer that floods TICKs, and the round goes on', () => {
    const net = new LoopbackNet(36, uniform(46));
    const nodes = lobby(net);
    const rogue = net.add('rogue', (link) => new Rogue(link, tick, 3)); // 750 TICKs a second
    net.join(rogue, 5000);
    net.run(15_000);
    for (const n of nodes) expect(net.drops.some(([by, peer]) => by === n.id && peer === 'rogue'), n.id).toBe(true);
    expect(rogue.session.sent).toBeLessThan(3 * 250 * 4); // closed within a few seconds
    agree(nodes);
  });

  it('keeps a peer that sends one TICK per tick, and closes one that sends 20 invalid messages', () => {
    const net = new LoopbackNet(37, uniform(47));
    const nodes = lobby(net);
    const junk = net.add('junk', (link) => new Rogue(link, new Uint8Array([0xee, 1, 2]), 1));
    net.join(junk, 5000);
    net.run(15_000);
    expect(net.drops.filter(([, p]) => p === 'junk').length).toBe(nodes.length);
    expect(net.drops.filter(([, p]) => p !== 'junk')).toEqual([]); // honest players stay
    agree(nodes);
  });
});

describe('events that arrive too late (§8.3)', () => {
  it('a Ready whose TICKs reach the others after its tick is final is sent again, so the countdown still starts', () => {
    // Player 3's links are slow for 0.6 s around its Ready, at 2150 ms.
    const net: LoopbackNet = new LoopbackNet(38, (a: string, b: string): LinkSpec => {
      const late = (a === 'n3' || b === 'n3') && net.now >= 2100 && net.now < 2700;
      return { base: late ? 450 : 40, jitter: 10 };
    });
    const nodes = lobby(net);
    net.run(12_000);
    for (const n of nodes) expect(finalOf(n).phase, n.id).not.toBe(0);
    agree(nodes);
  });

  it('a Ready that expires the normal way stays expired', () => {
    const net = new LoopbackNet(39, uniform(49));
    const keeper = node(net, 0, 'n0');
    net.join(keeper, 0, (now) => keeper.session.propose(keeper.local(now), SETTINGS, 'a'.repeat(16)));
    const nodes = [keeper];
    for (const k of [1, 2, 3]) {
      const n = node(net, k, `n${k}`);
      net.join(n, 200 * k, () => n.session.play());
      if (k !== 3) net.at(2000 + 50 * k, () => n.session.ready()); // player 3 never presses Ready
      nodes.push(n);
    }
    net.run(2000 + config.readyExpirySeconds * 1000 + 5000);
    const s = finalOf(nodes[1]!);
    expect(s.phase).toBe(0);
    expect(s.planets.map((p) => p.readyUntil > s.tick)).toEqual([false, false, false]);
    agree(nodes);
  });
});

