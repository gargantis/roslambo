// Rollback lockstep with majority voting (PLAN D-7, D-9, D-10, D-11).
//
// Tick t is final at local tick t + window; a missing input is then final
// as 0 (no buttons). Every TICK carries the sender's input for tick
// n + delay and its vote: the hash of its newest final state. Votes for
// tick g are tallied at local tick g + window + voteWindow; a peer on the
// losing side fetches the winner's STATE and replays.
//
// Pure: no DOM and no timers. The caller passes its clock reading `now`
// (ms, monotonic) and delivers messages.

import { cloneState, copyState, corrupt, decodeState, encodeState, genesis, Sim, type SimConfig, type State } from './sim.ts';
import { hash64 } from './hash.ts';
import * as P from './proto.ts';

export interface TimelineConfig {
  sim: SimConfig;
  me: number; // player index, -1 for a spectator
  delay: number;
  window: number;
  voteWindow: number;
  inputSource?: (tick: number) => number;
  corruptAt?: number; // fault: perturb my state once, after finalising this tick
  stopSendingAt?: number; // fault: stop sending from this local tick
}

export interface Outbox {
  broadcast(bytes: Uint8Array): void;
  sendTo(peerId: string, bytes: Uint8Array): void;
}

const INPUT_RING = 1024;
const STATE_RING = 256;
const CHECKPOINT_EVERY = 1000;
const RESYNC_RETRY_MS = 500;
const EWMA = 0.1;
const MAX_STATE_INPUT_TICKS = 300;
const WARM_MS = 500;
const SETTLE_MS = 2000;

export interface TimelineStats {
  sent: number;
  recv: number;
  late: number; // inputs that arrived after their tick was final
  lateBy: number[]; // how many ticks after finalisation, per late input
  missingAtFinal: number[]; // per player
  agree: number;
  disagree: number;
  split: number; // tallies that saw more than one hash
  resyncs: number;
  resyncMs: number[];
  resyncFailed: number;
  lateVoteFlips: number; // resyncs triggered by votes that arrived after the tally
  statesSent: number;
  stateBytesSent: number;
  rateAdj: number;
  jumps: number;
  medianOffset: number;
  checkpoints: Record<number, string>;
  joinedAt: number;
  warmMs: number;
  log: [number, string][]; // [local tick, event], capped
}

interface Resync {
  g: number;
  hash: string;
  candidates: number[];
  next: number;
  askedAt: number;
  divergedAt: number;
}

export class Timeline {
  readonly cfg: TimelineConfig;
  readonly n: number;
  started = false;
  localTick = 0;
  finalTick = 0;
  head: State;
  prevHead: State;
  readonly stats: TimelineStats;

  private readonly out: Outbox;
  private readonly sim: Sim;
  private readonly baseRate: number; // ticks per ms
  private rate: number;
  private t0 = 0;
  private b0 = 0;
  private finalState: State;
  private readonly scratch: Uint8Array;
  private readonly slotTick = new Int32Array(INPUT_RING).fill(-1);
  private readonly slotVals: Int16Array;
  private readonly lastInput: Uint8Array;
  private readonly lastInputTick: Int32Array;
  private readonly ringTick = new Int32Array(STATE_RING).fill(-1);
  private readonly ringBytes: (Uint8Array | null)[] = new Array<Uint8Array | null>(STATE_RING).fill(null);
  private readonly ringHash: string[] = new Array<string>(STATE_RING).fill('');
  private readonly votes = new Map<number, Map<number, string>>();
  private lastTallied = 0;
  private readonly peerOfPlayer = new Map<number, string>();
  private readonly oneWayMs = new Map<string, number>();
  private readonly offset: Float64Array;
  private readonly offsetSeen: Uint8Array;
  private resync: Resync | null = null;
  private lastRebalance = 0;
  private corrupted = false;
  private readonly histScratch: number[] = new Array<number>(P.HIST).fill(0);
  private readonly heard = new Set<number>(); // players a TICK has arrived from
  private readonly firstHeard = new Map<number, number>(); // player -> local time of its first TICK
  private warm: { expect: number[]; until: number } | null = null; // joiner warm-up
  private warmStart = 0;
  private confirmed = true; // a joiner votes only once a tally agrees, or after a resync
  private quietUntil = 0; // a joiner doesn't vote on ticks it finalised from a partial input set
  private repairedFrom = 0; // ticks before the last resync point can't be re-tallied usefully

  constructor(cfg: TimelineConfig, out: Outbox) {
    this.cfg = cfg;
    this.out = out;
    this.n = cfg.sim.n;
    this.sim = new Sim(cfg.sim);
    this.baseRate = cfg.sim.tickRate / 1000;
    this.rate = this.baseRate;
    this.finalState = genesis(cfg.sim);
    this.head = cloneState(this.finalState);
    this.prevHead = cloneState(this.finalState);
    this.scratch = new Uint8Array(this.n);
    this.slotVals = new Int16Array(INPUT_RING * this.n).fill(-1);
    this.lastInput = new Uint8Array(this.n);
    this.lastInputTick = new Int32Array(this.n).fill(-1);
    this.offset = new Float64Array(this.n);
    this.offsetSeen = new Uint8Array(this.n);
    this.stats = {
      sent: 0, recv: 0, late: 0, lateBy: [], missingAtFinal: new Array<number>(this.n).fill(0),
      agree: 0, disagree: 0, split: 0, resyncs: 0, resyncMs: [], resyncFailed: 0, lateVoteFlips: 0,
      statesSent: 0, stateBytesSent: 0, rateAdj: 0, jumps: 0, medianOffset: 0,
      checkpoints: {}, joinedAt: 0, warmMs: 0, log: [],
    };
  }

  // ---- clock (D-11) ----

  clock(now: number): number {
    return this.b0 + (now - this.t0) * this.rate;
  }

  private setRate(now: number, rate: number): void {
    this.b0 = this.clock(now);
    this.t0 = now;
    this.rate = rate;
  }

  /** Fraction of the current tick, for interpolation. */
  alpha(now: number): number {
    const a = this.clock(now) - this.localTick;
    return a < 0 ? 0 : a > 1 ? 1 : a;
  }

  // ---- lifecycle ----

  /** The first peer: tick 0 is the genesis state, now. */
  start(now: number): void {
    this.t0 = now;
    this.b0 = 0;
    this.started = true;
    this.store(0);
  }

  /** A joining peer asks an existing one for its newest final state. */
  requestJoin(peerId: string): void {
    this.out.sendTo(peerId, P.encodeStateReq(P.NONE, ''));
  }

  setPeer(peerId: string, player: number | null): void {
    if (player !== null && player >= 0 && player < this.n) this.peerOfPlayer.set(player, peerId);
  }

  setOneWay(peerId: string, ms: number): void {
    this.oneWayMs.set(peerId, ms);
  }

  advance(now: number): void {
    if (!this.started) return;
    if (this.warm && (now >= this.warm.until || this.warm.expect.every((p) => this.heard.has(p)))) {
      this.stats.warmMs = now - this.warmStart;
      this.warm = null;
    }
    const target = Math.floor(this.clock(now));
    if (target > this.localTick) {
      while (this.localTick < target) {
        this.localTick++;
        this.onTick(this.localTick, now);
      }
      this.predict();
    }
    if (now - this.lastRebalance >= 1000) {
      this.lastRebalance = now;
      this.rebalance(now);
    }
    if (this.resync && now - this.resync.askedAt >= RESYNC_RETRY_MS) this.askNext(now);
  }

  receive(fromPeer: string, bytes: Uint8Array, now: number): void {
    const m = P.decode(bytes);
    if (!m) return;
    if (m.type === P.TICK) this.onTickMsg(fromPeer, m, now);
    else if (m.type === P.STATE_REQ) this.onStateReq(fromPeer, m, now);
    else this.onState(fromPeer, m, now);
  }

  // ---- inputs ----

  private getInput(p: number, t: number): number {
    const s = t % INPUT_RING;
    return this.slotTick[s] === t ? this.slotVals[s * this.n + p]! : -1;
  }

  private setInput(p: number, t: number, b: number, force: boolean): void {
    if (!force && (t <= this.finalTick || t > this.localTick + INPUT_RING / 2)) return;
    const s = t % INPUT_RING;
    if (this.slotTick[s] !== t) {
      this.slotTick[s] = t;
      this.slotVals.fill(-1, s * this.n, s * this.n + this.n);
    }
    if (!force && this.slotVals[s * this.n + p]! >= 0) return; // duplicate
    this.slotVals[s * this.n + p] = b;
    if (t >= this.lastInputTick[p]!) {
      this.lastInputTick[p] = t;
      this.lastInput[p] = b;
    }
  }

  // ---- per tick ----

  private onTick(n: number, now: number): void {
    const me = this.cfg.me;
    const stopped = this.cfg.stopSendingAt !== undefined && n >= this.cfg.stopSendingAt;
    if (me >= 0 && !stopped) {
      const t = n + this.cfg.delay;
      const b = (this.cfg.inputSource?.(t) ?? 0) & 7;
      this.setInput(me, t, b, false);
      const vt = this.finalTick;
      let histMask = 0;
      const hist = this.histScratch;
      for (let k = 0; k < P.HIST; k++) {
        const v = this.getInput(me, t - 1 - k);
        hist[k] = v < 0 ? 0 : v;
        if (v >= 0) histMask |= 1 << k;
      }
      this.out.broadcast(P.encodeTick({
        t, from: me, buttons: b, voteTick: vt, voteHash: this.hashAt(vt),
        phase: Math.min(0.99998, Math.max(0, this.clock(now) - n)), histMask, hist,
      }));
      this.stats.sent++;
    }
    this.finalizeTo(n - this.cfg.window);
    this.tallyTo(Math.min(n - this.cfg.window - this.cfg.voteWindow, this.finalTick), now);
  }

  private finalizeTo(target: number): void {
    if (this.warm) return;
    const arr = this.scratch;
    while (this.finalTick < target) {
      const t = this.finalTick + 1;
      for (let p = 0; p < this.n; p++) {
        let v = this.getInput(p, t);
        if (v < 0) {
          v = 0;
          this.stats.missingAtFinal[p]!++;
          this.setInput(p, t, 0, true);
        }
        arr[p] = v;
      }
      this.sim.step(this.finalState, arr);
      this.finalTick = t;
      if (this.cfg.corruptAt === t && !this.corrupted) {
        this.corrupted = true;
        corrupt(this.finalState);
      }
      this.store(t);
    }
  }

  private store(t: number): void {
    const bytes = encodeState(this.finalState);
    const h = hash64(bytes);
    const s = t % STATE_RING;
    this.ringTick[s] = t;
    this.ringBytes[s] = bytes;
    this.ringHash[s] = h;
    if (this.cfg.me >= 0 && this.confirmed && t > this.lastTallied && t > this.quietUntil) this.vote(t, this.cfg.me, h);
    if (t % CHECKPOINT_EVERY === 0) this.stats.checkpoints[t] = h;
  }

  private hashAt(t: number): string {
    const s = t % STATE_RING;
    return this.ringTick[s] === t ? this.ringHash[s]! : '';
  }

  private vote(t: number, p: number, h: string): void {
    let vs = this.votes.get(t);
    if (!vs) {
      vs = new Map();
      this.votes.set(t, vs);
    }
    vs.set(p, h);
  }

  private tallyTo(target: number, now: number): void {
    while (this.lastTallied < target) {
      const g = ++this.lastTallied;
      this.votes.delete(g - STATE_RING);
      const r = this.tally(g);
      if (r === null) { // no votes or no state: trust myself
        if (this.hashAt(g)) this.confirmed = true;
        continue;
      }
      if (r.split) this.stats.split++;
      if (r.agree) {
        this.stats.agree++;
        this.confirmed = true;
      } else {
        this.stats.disagree++;
        this.event(`disagree ${g}`);
        if (!this.resync) this.beginResync(g, r.win, this.votes.get(g)!, now);
      }
    }
  }

  /** Votes that arrive after the tally still count ("among the votes
   *  received"): a peer whose latency exceeds the vote window would
   *  otherwise only ever hear itself. */
  private lateVote(g: number, now: number): void {
    if (this.resync || g < this.repairedFrom || g <= this.finalTick - STATE_RING) return;
    const r = this.tally(g);
    if (r && !r.agree) {
      this.stats.lateVoteFlips++;
      this.event(`late-vote-flip ${g}`);
      this.beginResync(g, r.win, this.votes.get(g)!, now);
    }
  }

  private tally(g: number): { win: string; agree: boolean; split: boolean } | null {
    const vs = this.votes.get(g);
    const mine = this.hashAt(g);
    if (!vs || vs.size === 0 || !mine) return null;
    const counts = new Map<string, number>();
    for (const h of vs.values()) counts.set(h, (counts.get(h) ?? 0) + 1);
    let win = '';
    let best = 0;
    for (const [h, c] of counts) {
      if (c > best || (c === best && h < win)) {
        win = h;
        best = c;
      }
    }
    return { win, agree: win === mine, split: counts.size > 1 };
  }

  private predict(): void {
    const tmp = this.prevHead;
    this.prevHead = this.head;
    this.head = tmp;
    copyState(this.head, this.finalState);
    const arr = this.scratch;
    for (let t = this.finalTick + 1; t <= this.localTick; t++) {
      for (let p = 0; p < this.n; p++) {
        const v = this.getInput(p, t);
        arr[p] = v >= 0 ? v : this.lastInput[p]!;
      }
      this.sim.step(this.head, arr);
    }
  }

  // ---- messages ----

  private onTickMsg(fromPeer: string, m: P.TickMsg, now: number): void {
    this.stats.recv++;
    const p = m.from;
    if (p >= this.n || p === this.cfg.me) return;
    if (!this.peerOfPlayer.has(p)) this.peerOfPlayer.set(p, fromPeer);
    if (!this.started) return;
    if (m.t <= this.finalTick) {
      this.stats.late++;
      this.event(`late p${p} t${m.t} by ${this.finalTick - m.t + 1}`);
      if (this.stats.lateBy.length < 10000) this.stats.lateBy.push(this.finalTick - m.t + 1);
    } else {
      this.setInput(p, m.t, m.buttons, false);
    }
    for (let k = 0; k < P.HIST; k++) {
      if ((m.histMask & (1 << k)) !== 0) this.setInput(p, m.t - 1 - k, m.hist[k]!, false);
    }
    this.heard.add(p);
    if (m.voteTick !== P.NONE && m.voteHash) {
      this.vote(m.voteTick, p, m.voteHash);
      if (m.voteTick <= this.lastTallied) this.lateVote(m.voteTick, now);
    }
    // Clock sample: the sender's clock read (t - delay + phase) when it
    // sent; add the one-way delay, compare with mine now.
    const ow = (this.oneWayMs.get(fromPeer) ?? 0) * this.baseRate;
    const off = m.t - this.cfg.delay + m.phase + ow - this.clock(now);
    this.offset[p] = this.offsetSeen[p] ? this.offset[p]! + EWMA * (off - this.offset[p]!) : off;
    this.offsetSeen[p] = 1;
    if (!this.firstHeard.has(p)) this.firstHeard.set(p, now);
  }

  private rebalance(now: number): void {
    const offs: number[] = [];
    // Only players heard for SETTLE_MS count, so a joiner whose clock is
    // still settling can't drag everyone else's.
    for (let p = 0; p < this.n; p++) {
      if (p === this.cfg.me || !this.offsetSeen[p] || now - (this.firstHeard.get(p) ?? now) < SETTLE_MS) continue;
      offs.push(this.offset[p]!);
    }
    if (offs.length === 0) return;
    offs.sort((a, b) => a - b);
    const mid = offs.length >> 1;
    const med = offs.length % 2 === 1 ? offs[mid]! : (offs[mid - 1]! + offs[mid]!) / 2;
    this.stats.medianOffset = med;
    if (Math.abs(med) > this.cfg.window / 2) {
      // Far off: shift the clock. Behind, the next advance() catches up;
      // ahead, no new ticks come until real time reaches the local tick.
      this.b0 += med;
      for (let p = 0; p < this.n; p++) this.offset[p] = this.offset[p]! - med;
      this.stats.jumps++;
      this.event(`jump ${med.toFixed(1)}`);
      this.stats.rateAdj = 0;
      this.setRate(now, this.baseRate);
      return;
    }
    // Proportional, with a 1-tick deadband so jitter isn't chased.
    const adj = Math.abs(med) <= 1 ? 0 : Math.max(-0.02, Math.min(0.02, med * 0.005));
    this.stats.rateAdj = adj;
    this.setRate(now, this.baseRate * (1 + adj));
  }

  private beginResync(g: number, hash: string, vs: Map<number, string>, now: number): void {
    const candidates = [...vs].filter(([p, h]) => h === hash && p !== this.cfg.me).map(([p]) => p).sort((a, b) => a - b);
    this.resync = { g, hash, candidates, next: 0, askedAt: -Infinity, divergedAt: now };
    this.askNext(now);
  }

  private askNext(now: number): void {
    const r = this.resync!;
    while (r.next < r.candidates.length) {
      const peer = this.peerOfPlayer.get(r.candidates[r.next++]!);
      if (peer) {
        this.out.sendTo(peer, P.encodeStateReq(r.g, r.hash));
        r.askedAt = now;
        return;
      }
    }
    this.stats.resyncFailed++;
    this.resync = null;
  }

  private onStateReq(fromPeer: string, m: P.StateReqMsg, now: number): void {
    if (!this.started) return;
    let g = m.tick;
    if (g === P.NONE || this.hashAt(g) === '' || (m.want && this.hashAt(g) !== m.want)) g = this.finalTick;
    const state = this.ringBytes[g % STATE_RING]!;
    const last = Math.min(this.localTick + this.cfg.delay, g + MAX_STATE_INPUT_TICKS);
    const count = Math.max(0, last - g);
    const inputs = new Uint8Array(count * this.n);
    for (let i = 0; i < count; i++) {
      for (let p = 0; p < this.n; p++) {
        const v = this.getInput(p, g + 1 + i);
        inputs[i * this.n + p] = v < 0 ? P.UNKNOWN_INPUT : v;
      }
    }
    const bytes = P.encodeState({
      senderTick: this.localTick, phase: Math.min(0.99998, Math.max(0, this.clock(now) - this.localTick)),
      g, senderFinal: this.finalTick, state, n: this.n, inputs,
    });
    this.stats.statesSent++;
    this.stats.stateBytesSent += bytes.length;
    this.out.sendTo(fromPeer, bytes);
  }

  private importInputs(m: P.StateMsg): void {
    const count = m.inputs.length / m.n;
    for (let i = 0; i < count; i++) {
      const t = m.g + 1 + i;
      for (let p = 0; p < this.n; p++) {
        const v = m.inputs[i * m.n + p]!;
        if (v === P.UNKNOWN_INPUT) continue;
        if (t <= m.senderFinal) this.setInput(p, t, v, true);
        else if (t > this.finalTick) this.setInput(p, t, v, false);
      }
    }
  }

  private onState(fromPeer: string, m: P.StateMsg, now: number): void {
    if (m.n !== this.n) return;
    const st = decodeState(m.state);
    if (!st || st.tick !== m.g) return;
    const h = hash64(m.state);
    if (!this.started) {
      // Late joiner: adopt the state and the sender's clock (D-11).
      this.finalState = st;
      this.finalTick = m.g;
      this.localTick = m.g;
      this.store(m.g);
      this.importInputs(m);
      const ow = (this.oneWayMs.get(fromPeer) ?? 0) * this.baseRate;
      this.t0 = now;
      this.b0 = m.senderTick + m.phase + ow;
      this.rate = this.baseRate;
      this.started = true;
      const target = Math.floor(this.clock(now));
      this.quietUntil = target;
      this.localTick = target;
      this.lastTallied = Math.max(this.finalTick, target - this.cfg.window - this.cfg.voteWindow);
      for (const k of this.votes.keys()) if (k <= this.lastTallied) this.votes.delete(k);
      this.stats.joinedAt = target;
      // Warm-up: hold finalisation until every active player has been heard
      // from (each TICK repeats 16 ticks of input), so inputs that were in
      // flight when the STATE was built aren't finalised as absent.
      const expect = activePlayers(m).filter((p) => p !== this.cfg.me);
      this.confirmed = false;
      this.warm = expect.length > 0 ? { expect, until: now + WARM_MS } : null;
      this.warmStart = now;
      this.finalizeTo(target - this.cfg.window);
      this.predict();
      return;
    }
    const r = this.resync;
    if (!r || h !== r.hash || m.g !== r.g) return; // unsolicited or stale
    const prevFinal = this.finalTick;
    this.finalState = st;
    this.finalTick = m.g;
    this.store(m.g);
    this.importInputs(m);
    this.finalizeTo(prevFinal);
    this.predict();
    this.repairedFrom = m.g;
    this.confirmed = true;
    this.stats.resyncs++;
    this.event(`resync ${m.g} in ${Math.round(now - r.divergedAt)} ms`);
    this.stats.resyncMs.push(now - r.divergedAt);
    this.resync = null;
  }

  private event(e: string): void {
    if (this.stats.log.length < 2000) this.stats.log.push([this.localTick, e]);
  }

  report(): Record<string, unknown> {
    return {
      me: this.cfg.me,
      localTick: this.localTick,
      finalTick: this.finalTick,
      contacts: this.finalState.contacts,
      ...this.stats,
      lateBy: undefined,
      lateByHistogram: histogram(this.stats.lateBy),
    };
  }
}

/** Players with any known input in a STATE's tail: the ones a joiner must hear from. */
function activePlayers(m: P.StateMsg): number[] {
  const out: number[] = [];
  const count = m.inputs.length / m.n;
  for (let p = 0; p < m.n; p++) {
    for (let i = 0; i < count; i++) {
      if (m.inputs[i * m.n + p] !== P.UNKNOWN_INPUT && m.inputs[i * m.n + p] !== 0) {
        out.push(p);
        break;
      }
    }
  }
  return out;
}

function histogram(xs: number[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const x of xs) {
    const k = x <= 1 ? '1' : x <= 3 ? '2-3' : x <= 10 ? '4-10' : '>10';
    h[k] = (h[k] ?? 0) + 1;
  }
  return h;
}
