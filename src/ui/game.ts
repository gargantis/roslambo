// One round in this tab (PLAN §8.2): the session, its transport and its
// clock, plus what the screens need: the ledger writes at the confirmed
// start and freeze (D-10, D-18), the saved state (§10), the witness record
// and SETTLED (§8.7), hidden-tab handling (D-23), and whether connecting
// has failed (§8.6).

import { config } from '../config';
import { forget, noteJoined, payAnte, settle } from '../core/ledger/ledger';
import type { ResultRecord } from '../core/protocol/messages';
import { resultRecord } from '../core/results/record';
import { buildHash } from '../core/session/build';
import { Session, type SavedTimeline } from '../core/session/session';
import { makeParams } from '../core/sim/params';
import { FROZEN, PRESTART, RUNNING, type RoundSettings } from '../core/sim/state';
import type { ProfileStore } from '../storage/profile';
import type { SavedRounds } from '../storage/rounds';
import type { WitnessStore } from '../storage/witness';

/** What a game needs from its room: TrysteroRoom, or the frame-time bench's virtual peers. */
export interface Transport {
  send(peer: string, bytes: Uint8Array): void;
  broadcast(bytes: Uint8Array): void;
  peerCount(): number;
  /** The last refusal this side received (REFUSAL reasons), or null. */
  readonly refusedBy: number | null;
  /** §9.4: close one peer's connection. */
  drop?(peer: string): void;
  leave(): Promise<void>;
}

export interface ResultRow {
  id: string;
  name: string;
  points: number;
}

/** The confirmed end of a round, for the results screen. */
export interface Result {
  roundId: string;
  record: ResultRecord;
  settings: RoundSettings;
  players: ResultRow[]; // in planet-number order
  me: number; // my index in players, or −1 for a spectator
  balance: number | null; // my balance after crediting, players only
}

export const PARAMS = makeParams();
export const BUILD = buildHash(PARAMS.settings);

const ADVANCE_EVERY_MS = 4;
const FAIL_AFTER_MS = 20_000; // §8.6
const HIDDEN_RESYNC_MS = 2000; // D-23
const LEAVE_GRACE_MS = 400; // LEAVE repeats in TICKs until final (w = 200 ms)
const TICK_COSTS_KEPT = 50_000;
const SAVE_EVERY_MS = 1000; // §10

function randomTimelineId(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export interface GameOptions {
  roundId: string;
  me: string;
  name: string;
  profile: ProfileStore | null; // null: the bench, which keeps no ledger
  rounds?: SavedRounds | null;
  witnesses?: WitnessStore | null;
  /** This browser's save of the round, for a player returning to it. */
  saved?: SavedTimeline | null;
  transport: (session: Session) => Transport;
}

export class Game {
  readonly roundId: string;
  readonly session: Session;
  readonly openedAt = performance.now();
  /** Set once the freeze is confirmed. */
  result: Result | null = null;
  /** ms per advance() that moved the clock on: the M3 load run's measure. */
  readonly tickCosts: number[] = [];
  private readonly transport: Transport;
  private readonly profile: ProfileStore | null;
  private readonly rounds: SavedRounds | null;
  private readonly witnesses: WitnessStore | null;
  private readonly saved: SavedTimeline | null;
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly onVisibility = (): void => this.visibility();
  private readonly onPageHide = (): void => this.save();
  private readonly settledSeen = new Set<string>();
  private lastSave = -Infinity;
  private forgotten = false; // left before the countdown: nothing to save
  private keeper = false;
  private joined = false;
  private paid = false;
  private hiddenAt = -1;
  private closed = false;

  constructor(o: GameOptions) {
    this.roundId = o.roundId;
    this.profile = o.profile;
    this.rounds = o.rounds ?? null;
    this.witnesses = o.witnesses ?? null;
    this.saved = o.saved ?? null;
    let transport: Transport | null = null;
    this.session = new Session({
      params: PARAMS, me: o.me, name: o.name, build: BUILD,
      timeline: { delay: config.inputDelayTicks, window: config.lateWindowTicks, voteWindow: config.voteWindowTicks, warmupMs: config.joinWarmupMs, settleMs: config.clockSettleMs },
      maxSpectators: config.maxSpectators, forwarding: true,
    }, {
      send: (peer, b) => transport?.send(peer, b),
      broadcast: (b) => transport?.broadcast(b),
      drop: (peer) => transport?.drop?.(peer),
    });
    transport = o.transport(this.session);
    this.transport = transport;
    this.session.onSettled = (player) => {
      this.settledSeen.add(player);
      this.witnesses?.acknowledge(this.roundId, player);
    };
    this.timer = setInterval(() => this.advance(performance.now()), ADVANCE_EVERY_MS);
    document.addEventListener('visibilitychange', this.onVisibility);
    addEventListener('pagehide', this.onPageHide);
  }

  /** This browser's buttons, sampled once per tick while it plays. */
  set controls(sample: () => number) {
    this.session.timeline.controls = sample;
  }

  /** The proposer: tick 0 of a new round, held here until someone arrives. */
  propose(settings: RoundSettings): void {
    this.keeper = true;
    this.session.propose(performance.now(), settings, randomTimelineId());
  }

  /** Play: with a save of this round, resume it if nobody is playing it (§8.5). */
  play(): void {
    if (this.saved && !this.session.timeline.started) this.session.saved = this.saved;
    this.session.play();
  }

  ready(on: boolean): void {
    this.session.ready(on);
  }

  isPlayer(): boolean {
    return this.session.wantsToPlay || this.session.inRoster();
  }

  peers(): number {
    return this.transport.peerCount();
  }

  /** Nobody to take the round from after 20 s (§8.6). Not for a proposer,
   *  who holds the round and waits for others. */
  failed(now: number): boolean {
    return !this.keeper && !this.session.timeline.started && now - this.openedAt > FAIL_AFTER_MS;
  }

  /** A refusal, once no peer accepted this side. */
  refusal(): number | null {
    return this.transport.peerCount() === 0 ? this.transport.refusedBy : null;
  }

  private advance(now: number): void {
    if (this.closed) return;
    const t = this.session.timeline;
    const before = t.localTick;
    this.session.advance(now);
    if (t.localTick !== before && this.tickCosts.length < TICK_COSTS_KEPT) this.tickCosts.push(performance.now() - now);
    if (this.session.timeline.started && !this.result) {
      this.ledger();
      if (!this.result && now - this.lastSave >= SAVE_EVERY_MS) {
        this.lastSave = now;
        this.save();
      }
    }
  }

  /** §10: a player's browser keeps the newest final state, so the round
   *  can resume if everyone leaves. */
  private save(): void {
    if (!this.rounds || this.result || this.forgotten || !this.session.timeline.started || !this.session.inRoster()) return;
    const t = this.session.timeline;
    this.rounds.save(this.roundId, t.id, t.final, Date.now());
  }

  /** The ledger follows the confirmed timeline only (D-10). */
  private ledger(): void {
    const t = this.session.timeline;
    const s = t.final;
    const i = s.planets.findIndex((p) => p.id === this.session.cfg.me);
    const at = Date.now();
    if (i >= 0 && !this.joined) {
      this.joined = true;
      this.profile?.update((p) => noteJoined(p, this.roundId, s.ante, at));
    }
    if (i >= 0 && !this.paid && s.phase >= RUNNING && t.isConfirmed(s.countdownStart + PARAMS.countdownTicks)) {
      this.paid = true;
      this.profile?.update((p) => payAnte(p, this.roundId, s.ante, at));
    }
    if (s.phase !== FROZEN || !t.isConfirmed(s.freezeTick)) return;
    // The confirmed end (§8.2 step 6): credit, tell the room, and keep the
    // result for the players who haven't acknowledged it (§8.7).
    const record = resultRecord(this.roundId, s);
    this.session.resultRecord = record;
    if (i >= 0) {
      this.profile?.update((p) => settle(p, this.roundId, s.ante, s.planets[i]!.points, at));
      this.session.announceSettled();
    }
    const waiting = s.planets.map((p) => p.id).filter((p) => p !== this.session.cfg.me && !this.settledSeen.has(p));
    this.witnesses?.put(record, waiting, at);
    this.rounds?.remove(this.roundId);
    this.result = {
      roundId: this.roundId,
      record,
      settings: { ante: s.ante, minPlayers: s.minPlayers, maxPlayers: s.maxPlayers },
      players: s.planets.map((p) => ({ id: p.id, name: p.name, points: p.points })),
      me: i,
      balance: i >= 0 && this.profile ? this.profile.get().balance : null,
    };
  }

  /** D-23: a hidden page stops sending, so its planet drifts; back after
   *  more than a moment, it takes the round from a peer again. */
  private visibility(): void {
    const now = performance.now();
    if (document.visibilityState === 'hidden') {
      this.session.timeline.sending = false;
      this.hiddenAt = now;
      return;
    }
    if (this.hiddenAt < 0) return;
    if (now - this.hiddenAt > HIDDEN_RESYNC_MS) this.session.rejoin();
    this.session.timeline.sending = this.session.wantsToPlay;
    this.hiddenAt = -1;
  }

  /** Leave the round: a player's LEAVE goes out first. Before the
   *  countdown that takes the planet away, so the round is forgotten here. */
  leave(): void {
    const s = this.session.timeline.final;
    if (this.session.inRoster() && s.phase === PRESTART) {
      this.profile?.update((p) => forget(p, this.roundId));
      this.rounds?.remove(this.roundId);
      this.forgotten = true;
    }
    this.session.leave();
    setTimeout(() => this.close(), LEAVE_GRACE_MS);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.save();
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    removeEventListener('pagehide', this.onPageHide);
    void this.transport.leave().catch(() => {});
  }
}
