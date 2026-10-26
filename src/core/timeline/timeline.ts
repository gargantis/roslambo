// Rollback lockstep with majority voting (PLAN D-7 to D-11, M0 amendments).
//
// Tick t is final at local tick t + window: the inputs that have arrived
// for it by then are its inputs, and a player with none is absent. Every
// TICK carries the sender's input for tick n + delay, its own inputs for
// the 16 ticks before (so nothing in flight is lost), its events until
// they are final, and its vote: the hash of its newest final state. Votes
// for tick g are tallied at local tick g + window + voteWindow, and late
// votes still count. A peer on the losing side fetches the winner's STATE
// and replays from it.
//
// Pure: no DOM, timers or clocks. The caller passes `now` (ms, monotonic)
// and routes messages in.

import { decodeState, encodeState } from '../sim/codec';
import { hash64 } from '../sim/hash';
import type { SimParams } from '../sim/params';
import { step, type PlayerInput } from '../sim/rules';
import { cloneState, genesis, type RoundSettings, type RoundState } from '../sim/state';
import * as M from '../protocol/messages';

export interface TimelineConfig {
  params: SimParams;
  me: string; // this browser's player ID
  delay: number;
  window: number;
  voteWindow: number;
  warmupMs: number;
  settleMs: number;
}

export interface TimelineOut {
  broadcast(bytes: Uint8Array): void;
  /** To one player's peer; false if there is no direct connection. */
  sendToPlayer(player: string, bytes: Uint8Array): boolean;
  /** To one connection, by transport peer ID (a requester may be a spectator). */
  sendToPeer(peer: string, bytes: Uint8Array): void;
}

interface Input {
  buttons: number;
  events: number;
  name: string;
}

const INPUT_RING = 1024;
const STATE_RING = 256;
const CHECKPOINT_EVERY = 500;
const RESYNC_RETRY_MS = 500;
const EWMA = 0.1;
const SEND_BEHIND = 3; // ticks: timer jitter, not a stall
const PHASE_CAP = 0.9999; // TICK phases are clamped to 0.99998 (u16 on the wire)

export interface TimelineStats {
  sent: number;
  received: number;
  late: number; // inputs that arrived after their tick was final
  agree: number;
  disagree: number;
  split: number;
  resyncs: number;
  resyncMs: number[];
  resyncFailed: number;
  lateVoteFlips: number;
  statesSent: number;
  jumps: number;
  rateAdj: number;
  medianOffset: number;
  warmMs: number;
  joinedAt: number;
  checkpoints: Record<number, string>;
  log: [number, string][]; // [local tick, event], the first 300
}

interface Resync {
  g: number;
  hash: string;
  candidates: string[];
  next: number;
  askedAt: number;
  divergedAt: number;
}

interface OwnEvent {
  t: number;
  events: number;
  name: string;
}

export class Timeline {
  readonly cfg: TimelineConfig;
  readonly stats: TimelineStats;
  id = M.ZERO_HASH; // timeline ID (D-12)
  started = false;
  localTick = 0;
  finalTick = 0;
  /** Predicted states for drawing: the newest tick and the one before. */
  head: RoundState;
  prevHead: RoundState;
  /** Whether this browser sends inputs: a player or a candidate (§8.1). */
  sending = false;
  /** This browser's buttons, sampled once per tick when sending. */
  controls: () => number = () => 0;
  /** The newest tick whose tally agreed with this browser's state, or that
   *  had no other votes (D-10: only confirmed results count). */
  agreedTo = 0;

  private readonly out: TimelineOut;
  private readonly P: SimParams;
  private readonly baseRate: number; // ticks per ms
  private rate: number;
  private t0 = 0;
  private b0 = 0;
  private finalState: RoundState;
  private readonly slotTick = new Int32Array(INPUT_RING).fill(-1);
  private readonly slots: Map<string, Input>[] = Array.from({ length: INPUT_RING }, () => new Map());
  private readonly lastButtons = new Map<string, number>();
  private readonly ringTick = new Int32Array(STATE_RING).fill(-1);
  private readonly ringBytes: (Uint8Array | null)[] = new Array<Uint8Array | null>(STATE_RING).fill(null);
  private readonly ringHash: string[] = new Array<string>(STATE_RING).fill('');
  private readonly ringRoster: string[][] = Array.from({ length: STATE_RING }, () => []);
  private readonly votes = new Map<number, Map<string, string>>();
  private lastTallied = 0;
  private readonly oneWayMs = new Map<string, number>();
  private readonly offset = new Map<string, number>();
  private readonly firstHeard = new Map<string, number>();
  private resync: Resync | null = null;
  private lastRebalance = 0;
  private repairedFrom = 0;
  private confirmed = true;
  private quietUntil = 0;
  private warm: { expect: string[]; until: number; from: number } | null = null;
  private pendingEvents = 0;
  private pendingName = '';
  private ownEvents: OwnEvent[] = [];

  constructor(cfg: TimelineConfig, out: TimelineOut) {
    this.cfg = cfg;
    this.out = out;
    this.P = cfg.params;
    this.baseRate = cfg.params.settings.tickRate / 1000;
    this.rate = this.baseRate;
    this.finalState = genesis({ ante: 1, minPlayers: 3, maxPlayers: 3 });
    this.head = cloneState(this.finalState);
    this.prevHead = cloneState(this.finalState);
    this.stats = {
      sent: 0, received: 0, late: 0, agree: 0, disagree: 0, split: 0, resyncs: 0, resyncMs: [], resyncFailed: 0,
      lateVoteFlips: 0, statesSent: 0, jumps: 0, rateAdj: 0, medianOffset: 0, warmMs: 0, joinedAt: 0, checkpoints: {}, log: [],
    };
  }

  // ---- lifecycle ----

  /** The first peer of a round: tick 0 is the genesis state, now (§8.2). */
  start(now: number, settings: RoundSettings, id: string): void {
    this.id = id;
    this.finalState = genesis(settings);
    this.t0 = now;
    this.b0 = 0;
    this.started = true;
    this.store(0);
    this.head = cloneState(this.finalState);
    this.prevHead = cloneState(this.finalState);
  }

  /** A paused round goes on from a saved state, as a new timeline (§8.5,
   *  D-12): the saved tick is final, and the clock runs on from it. */
  resume(now: number, state: RoundState, id: string): void {
    this.id = id;
    this.finalState = cloneState(state);
    this.finalTick = state.tick;
    this.localTick = state.tick;
    this.lastTallied = state.tick;
    this.t0 = now;
    this.b0 = state.tick;
    this.started = true;
    this.store(state.tick);
    this.head = cloneState(this.finalState);
    this.prevHead = cloneState(this.finalState);
  }

  /** The newest final state. */
  get final(): RoundState {
    return this.finalState;
  }

  /** Ask a peer for its newest final state, to join its timeline. */
  requestState(peer: string): void {
    this.out.sendToPeer(peer, M.encodeStateReq(M.NO_TICK, ''));
  }

  /** Attach events (JOIN, READY, …) to this browser's next input. */
  queueEvent(events: number, name = ''): void {
    this.pendingEvents |= events;
    if (name) this.pendingName = name;
  }

  setOneWay(player: string, ms: number): void {
    this.oneWayMs.set(player, ms);
  }

  // ---- clock (D-11, M0 amendment) ----

  clock(now: number): number {
    return this.b0 + (now - this.t0) * this.rate;
  }

  /** How far into the current tick we are, 0..1, for interpolation. */
  alpha(now: number): number {
    const a = this.clock(now) - this.localTick;
    return a < 0 ? 0 : a > 1 ? 1 : a;
  }

  private setRate(now: number, rate: number): void {
    this.b0 = this.clock(now);
    this.t0 = now;
    this.rate = rate;
  }

  advance(now: number): void {
    if (!this.started) return;
    if (this.warm && (now >= this.warm.until || this.warm.expect.every((p) => this.firstHeard.has(p)))) {
      this.stats.warmMs = now - this.warm.from;
      this.warm = null;
    }
    const target = Math.floor(this.clock(now));
    if (target > this.localTick) {
      while (this.localTick < target) {
        this.localTick++;
        // After a stall (a throttled timer), send inputs only for the newest
        // ticks. Older ones would reach peers near the end of their late
        // window, in time for some and too late for others, and split them.
        this.stepLocal(this.localTick, now, this.localTick > target - SEND_BEHIND);
      }
      this.predict();
    }
    if (now - this.lastRebalance >= 1000) {
      this.lastRebalance = now;
      this.rebalance(now);
    }
    if (this.resync && now - this.resync.askedAt >= RESYNC_RETRY_MS) this.askNext(now);
  }

  // ---- inputs ----

  private inputsAt(t: number): Map<string, Input> | undefined {
    const s = t % INPUT_RING;
    return this.slotTick[s] === t ? this.slots[s] : undefined;
  }

  private slot(t: number): Map<string, Input> {
    const s = t % INPUT_RING;
    if (this.slotTick[s] !== t) {
      this.slotTick[s] = t;
      this.slots[s]!.clear();
    }
    return this.slots[s]!;
  }

  /** Records a player's input for tick t unless it's final, more than 2w
   *  ahead (§9.3), or already known; events and a name merge into a known
   *  input. "Ahead" is of the clock when `now` is given: a page whose
   *  timers sleep (hidden, throttled) has a stale localTick, and must not
   *  drop the inputs that arrive meanwhile. */
  private setInput(player: string, t: number, buttons: number, events: number, name: string, now?: number): void {
    const head = now === undefined ? this.localTick : Math.max(this.localTick, Math.floor(this.clock(now)));
    if (t <= this.finalTick || t > head + 2 * this.cfg.window + this.cfg.delay) return;
    const m = this.slot(t);
    const had = m.get(player);
    if (had) {
      had.events |= events;
      if (name) had.name = name;
      return;
    }
    m.set(player, { buttons, events, name });
    this.lastButtons.set(player, buttons);
  }

  // ---- per tick ----

  private stepLocal(n: number, now: number, send: boolean): void {
    if (this.sending && send) this.send(n, now);
    this.finalizeTo(n - this.cfg.window);
    this.tallyTo(Math.min(n - this.cfg.window - this.cfg.voteWindow, this.finalTick), now);
  }

  private send(n: number, now: number): void {
    const me = this.cfg.me;
    const t = n + this.cfg.delay;
    const buttons = this.controls() & 7;
    const events = this.pendingEvents;
    const name = this.pendingName;
    this.pendingEvents = 0;
    this.pendingName = '';
    this.setInput(me, t, buttons, events, name);
    if (events !== 0) this.ownEvents.push({ t, events, name });
    this.ownEvents = this.ownEvents.filter((e) => e.t > this.finalTick && t - e.t <= 255);
    let histMask = 0;
    const hist: number[] = [];
    for (let k = 0; k < M.HISTORY; k++) {
      const x = this.inputsAt(t - 1 - k)?.get(me);
      hist.push(x ? x.buttons : 0);
      if (x) histMask |= 1 << k;
    }
    const vt = this.finalTick;
    this.out.broadcast(M.encodeTick({
      t, buttons, voteTick: this.votesFor(vt) ? vt : M.NO_TICK, voteHash: this.hashAt(vt),
      phase: Math.min(0.99998, Math.max(0, this.clock(now) - n)), histMask, hist,
      events: this.ownEvents.map((e) => ({ back: t - e.t, events: e.events, name: e.name })),
    }));
    this.stats.sent++;
  }

  /** Whether this browser votes on tick t: a confirmed player in its roster. */
  private votesFor(t: number): boolean {
    return this.sending && this.confirmed && t > this.quietUntil && this.rosterAt(t).includes(this.cfg.me);
  }

  private finalizeTo(target: number): void {
    if (this.warm) return;
    while (this.finalTick < target) {
      const t = this.finalTick + 1;
      const inputs: PlayerInput[] = [];
      for (const [id, x] of this.inputsAt(t) ?? []) {
        inputs.push({ id, buttons: x.buttons, events: x.events, ...(x.name ? { name: x.name } : {}) });
      }
      step(this.finalState, inputs, this.P);
      this.finalTick = t;
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
    this.ringRoster[s] = this.finalState.planets.map((p) => p.id);
    if (this.votesFor(t) && t > this.lastTallied) this.vote(t, this.cfg.me, h);
    if (t % CHECKPOINT_EVERY === 0) this.stats.checkpoints[t] = h;
  }

  /** Whether tick t is final and confirmed by the vote, with no repair under way. */
  isConfirmed(t: number): boolean {
    return this.started && this.agreedTo >= t && this.resync === null;
  }

  hashAt(t: number): string {
    const s = t % STATE_RING;
    return this.ringTick[s] === t ? this.ringHash[s]! : '';
  }

  private rosterAt(t: number): string[] {
    const s = t % STATE_RING;
    return this.ringTick[s] === t ? this.ringRoster[s]! : [];
  }

  private vote(t: number, player: string, h: string): void {
    let vs = this.votes.get(t);
    if (!vs) {
      vs = new Map();
      this.votes.set(t, vs);
    }
    vs.set(player, h);
  }

  private tallyTo(target: number, now: number): void {
    while (this.lastTallied < target) {
      const g = ++this.lastTallied;
      this.votes.delete(g - STATE_RING);
      const r = this.tally(g);
      if (r === null) {
        if (this.hashAt(g)) {
          this.confirmed = true; // nobody else to agree with
          this.agreedTo = g;
        }
        continue;
      }
      if (r.split) this.stats.split++;
      if (r.agree) {
        this.stats.agree++;
        this.confirmed = true;
        this.agreedTo = g;
      } else {
        this.stats.disagree++;
        this.note(`disagree ${g}`);
        if (!this.resync) this.beginResync(g, r.win, now);
      }
    }
  }

  /** Votes that arrive after the tally still count (M0 amendment). */
  private lateVote(g: number, now: number): void {
    if (this.resync || g < this.repairedFrom || g <= this.finalTick - STATE_RING) return;
    const r = this.tally(g);
    if (r && !r.agree) {
      this.stats.lateVoteFlips++;
      this.beginResync(g, r.win, now);
    }
  }

  private note(e: string): void {
    if (this.stats.log.length < 300) this.stats.log.push([this.localTick, e]);
  }

  /** Plurality of the votes from players in my roster at g, the smallest
   *  hash on a tie (D-9). Null with no votes or no state. */
  private tally(g: number): { win: string; agree: boolean; split: boolean } | null {
    const vs = this.votes.get(g);
    const mine = this.hashAt(g);
    if (!vs || !mine) return null;
    const roster = new Set(this.rosterAt(g));
    const counts = new Map<string, number>();
    for (const [player, h] of vs) if (roster.has(player)) counts.set(h, (counts.get(h) ?? 0) + 1);
    if (counts.size === 0) return null;
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
    this.prevHead = this.head;
    this.head = cloneState(this.finalState);
    for (let t = this.finalTick + 1; t <= this.localTick; t++) {
      const known = this.inputsAt(t);
      const inputs: PlayerInput[] = [];
      for (const [id, x] of known ?? []) inputs.push({ id, buttons: x.buttons, events: x.events, ...(x.name ? { name: x.name } : {}) });
      for (const p of this.head.planets) {
        if (known?.has(p.id)) continue;
        const b = this.lastButtons.get(p.id);
        if (b !== undefined) inputs.push({ id: p.id, buttons: b, events: 0 });
      }
      step(this.head, inputs, this.P);
    }
  }

  // ---- messages ----

  /** A TICK from `origin` (a player ID), direct or forwarded. */
  onTick(origin: string, m: M.Tick, now: number): void {
    if (origin === this.cfg.me) return;
    this.stats.received++;
    if (!this.started) return;
    if (m.t <= this.finalTick) {
      this.stats.late++;
      this.note(`late ${origin.slice(-2)} t${m.t} by ${this.finalTick - m.t + 1}`);
    }
    else this.setInput(origin, m.t, m.buttons, 0, '', now);
    for (let k = 0; k < M.HISTORY; k++) {
      if ((m.histMask & (1 << k)) !== 0) this.setInput(origin, m.t - 1 - k, m.hist[k]!, 0, '', now);
    }
    for (const e of m.events) {
      const et = m.t - e.back;
      const x = this.inputsAt(et)?.get(origin);
      this.setInput(origin, et, x ? x.buttons : 0, e.events, e.name, now);
    }
    if (m.voteTick !== M.NO_TICK && m.voteHash) {
      this.vote(m.voteTick, origin, m.voteHash);
      if (m.voteTick <= this.lastTallied) this.lateVote(m.voteTick, now);
    }
    if (!this.firstHeard.has(origin)) this.firstHeard.set(origin, now);
    // Clock sample: the sender's clock read (t − delay + phase) when it
    // sent; add the one-way delay, compare with mine now. A phase at its
    // cap means the sender was catching up after its timers slept, so the
    // TICK was sent late for its tick: it says nothing about the clock.
    if (m.phase >= PHASE_CAP) return;
    const ow = (this.oneWayMs.get(origin) ?? 0) * this.baseRate;
    const off = m.t - this.cfg.delay + m.phase + ow - this.clock(now);
    const prev = this.offset.get(origin);
    this.offset.set(origin, prev === undefined ? off : prev + EWMA * (off - prev));
  }

  private rebalance(now: number): void {
    const offs: number[] = [];
    for (const [player, off] of this.offset) {
      if (now - (this.firstHeard.get(player) ?? now) >= this.cfg.settleMs) offs.push(off);
    }
    if (offs.length === 0) return;
    offs.sort((a, b) => a - b);
    const mid = offs.length >> 1;
    const med = offs.length % 2 === 1 ? offs[mid]! : (offs[mid - 1]! + offs[mid]!) / 2;
    this.stats.medianOffset = med;
    if (Math.abs(med) > this.cfg.window / 2) {
      this.b0 += med;
      for (const [p, o] of this.offset) this.offset.set(p, o - med);
      this.stats.jumps++;
      this.note(`jump ${med.toFixed(1)}`);
      this.stats.rateAdj = 0;
      this.setRate(now, this.baseRate);
      return;
    }
    const adj = Math.abs(med) <= 1 ? 0 : Math.max(-0.02, Math.min(0.02, med * 0.005));
    this.stats.rateAdj = adj;
    this.setRate(now, this.baseRate * (1 + adj));
  }

  private beginResync(g: number, hash: string, now: number): void {
    const vs = this.votes.get(g)!;
    const candidates = [...vs].filter(([p, h]) => h === hash && p !== this.cfg.me).map(([p]) => p).sort();
    this.resync = { g, hash, candidates, next: 0, askedAt: -Infinity, divergedAt: now };
    this.askNext(now);
  }

  private askNext(now: number): void {
    const r = this.resync!;
    while (r.next < r.candidates.length) {
      if (this.out.sendToPlayer(r.candidates[r.next++]!, M.encodeStateReq(r.g, r.hash))) {
        r.askedAt = now;
        return;
      }
    }
    this.stats.resyncFailed++;
    this.resync = null;
  }

  onStateReq(peer: string, m: M.StateReq, now: number): void {
    if (!this.started) return;
    let g = m.tick;
    if (g === M.NO_TICK || this.hashAt(g) === '' || (m.want !== M.ZERO_HASH && this.hashAt(g) !== m.want)) g = this.finalTick;
    const inputs: M.InputRecord[][] = [];
    for (let t = g + 1; t <= this.localTick + this.cfg.delay; t++) {
      const tick: M.InputRecord[] = [];
      for (const [player, x] of this.inputsAt(t) ?? []) tick.push({ player, buttons: x.buttons, events: x.events, name: x.name });
      inputs.push(tick);
    }
    this.stats.statesSent++;
    this.out.sendToPeer(peer, M.encodeState({
      // The clock, not localTick: a page whose timers sleep (hidden,
      // throttled) has a stale localTick, and a joiner that took it would
      // start up to a second behind, and drop everyone's inputs as too early.
      timeline: this.id, senderTick: Math.floor(this.clock(now)),
      phase: Math.min(0.99998, Math.max(0, this.clock(now) - Math.floor(this.clock(now)))),
      g, senderFinal: this.finalTick, state: this.ringBytes[g % STATE_RING]!, roster: this.rosterAt(g), inputs,
    }));
  }

  /** Inputs from a STATE: up to the sender's final tick they replace mine
   *  exactly (absences included); after it they only add. */
  private importInputs(m: M.StateMsg): void {
    m.inputs.forEach((tick, i) => {
      const t = m.g + 1 + i;
      if (t <= m.senderFinal) {
        const s = this.slot(t);
        s.clear();
        for (const x of tick) {
          s.set(x.player, { buttons: x.buttons, events: x.events, name: x.name });
          this.lastButtons.set(x.player, x.buttons);
        }
      } else {
        for (const x of tick) this.setInput(x.player, t, x.buttons, x.events, x.name);
      }
    });
  }

  /** A STATE: adoption when joining, or the repair after losing a vote. */
  onState(m: M.StateMsg, oneWayMs: number, now: number): void {
    const st = decodeState(m.state);
    if (!st || st.tick !== m.g) return;
    const h = hash64(m.state);
    if (!this.started) {
      this.id = m.timeline;
      this.finalState = st;
      this.finalTick = m.g;
      this.localTick = m.g;
      this.store(m.g);
      this.importInputs(m);
      this.t0 = now;
      this.b0 = m.senderTick + m.phase + oneWayMs * this.baseRate;
      this.rate = this.baseRate;
      this.started = true;
      const target = Math.floor(this.clock(now));
      this.quietUntil = target;
      this.localTick = target;
      this.lastTallied = Math.max(this.finalTick, target - this.cfg.window - this.cfg.voteWindow);
      for (const k of this.votes.keys()) if (k <= this.lastTallied) this.votes.delete(k);
      this.stats.joinedAt = target;
      // Warm-up: hold finalisation until every active player has been heard
      // from, so inputs in flight when the STATE was built aren't lost.
      const expect = new Set<string>();
      for (const tick of m.inputs) for (const x of tick) if (x.player !== this.cfg.me) expect.add(x.player);
      this.confirmed = false;
      this.warm = expect.size > 0 ? { expect: [...expect], until: now + this.cfg.warmupMs, from: now } : null;
      this.finalizeTo(target - this.cfg.window);
      this.predict();
      return;
    }
    const r = this.resync;
    if (!r || h !== r.hash || m.g !== r.g || m.timeline !== this.id) return; // unsolicited or stale
    const prevFinal = this.finalTick;
    this.finalState = st;
    this.finalTick = m.g;
    this.store(m.g);
    this.importInputs(m);
    this.finalizeTo(prevFinal);
    this.predict();
    this.repairedFrom = m.g;
    this.confirmed = true;
    this.agreedTo = Math.max(this.agreedTo, m.g);
    this.stats.resyncs++;
    this.note(`resync ${m.g} in ${Math.round(now - r.divergedAt)} ms`);
    this.stats.resyncMs.push(now - r.divergedAt);
    this.resync = null;
  }
}
