// While the game is open (PLAN §8.7, Q-6, Q-10): a passive witness room
// for each result other players still need, and an active settler room
// for each of this player's unsettled rounds. A settler that finds the
// round still running leaves, so Home can offer Rejoin; one that hears
// nothing for 20 s shows the round as paused, so Home can offer Resume.
// Neither takes part in a round: opening it is the player's choice.

import { config } from '../config';
import { forget, isPractice, settle, settlePractice, type LedgerEntry } from '../core/ledger/ledger';
import * as M from '../core/protocol/messages';
import { ResultsPeer } from '../core/session/results-peer';
import type { RoomPeer } from '../core/session/room-peer';
import type { ProfileStore } from '../storage/profile';
import type { SavedRounds } from '../storage/rounds';
import type { WitnessStore } from '../storage/witness';
import type { Transport } from './game';

export type RoundStatus = 'checking' | 'running' | 'paused';

export interface UnsettledRound {
  roundId: string;
  entry: LedgerEntry;
  status: RoundStatus;
  saved: boolean; // this browser can resume it
}

export interface BackgroundOptions {
  me: () => { id: string; name: string };
  build: string;
  profile: ProfileStore;
  witnesses: WitnessStore;
  rounds: SavedRounds;
  open: (roundId: string, peer: RoomPeer, passive: boolean) => Transport;
  /** A game's room for this round is still closing: don't open it yet. */
  closing: (roundId: string) => boolean;
}

interface Room {
  transport: Transport;
  peer: ResultsPeer;
}

const PAUSED_AFTER_MS = 20_000; // §8.6's connection wait (research/passive)
const RECHECK_RUNNING_MS = 60_000;
const REFRESH_EVERY_MS = 15_000;
const LEAVE_AFTER_SETTLED_MS = 500; // SETTLED goes out first

export class Background {
  /** Home redraws its list when this changes. */
  version = 0;
  private readonly o: BackgroundOptions;
  private readonly witnessRooms = new Map<string, Room>();
  private readonly settlerRooms = new Map<string, Room>();
  private readonly statuses = new Map<string, RoundStatus>();
  private readonly nextCheck = new Map<string, number>();
  private open: string | null = null;
  private stopped = false;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(o: BackgroundOptions) {
    this.o = o;
    this.timer = setInterval(() => this.refresh(this.open), REFRESH_EVERY_MS);
  }

  private changed(): void {
    this.version++;
  }

  /** The unsettled rounds Home lists: the most recent ten (Q-10). */
  unsettled(): UnsettledRound[] {
    const saved = new Set(this.o.rounds.ids());
    return this.watched().map(([roundId, entry]) => ({
      roundId, entry, status: this.statuses.get(roundId) ?? 'checking', saved: saved.has(roundId),
    }));
  }

  private watched(): [string, LedgerEntry][] {
    return Object.entries(this.o.profile.get().rounds)
      .filter(([id, e]) => !e.settled && id !== this.open)
      .sort(([, a], [, b]) => b.seenAt - a.seenAt)
      .slice(0, config.unsettledRoundsWatched);
  }

  /** Before the game opens a round's room: this service leaves it. */
  release(roundId: string): void {
    this.open = roundId;
    this.close(this.witnessRooms, roundId);
    this.close(this.settlerRooms, roundId);
  }

  stop(): void {
    this.stopped = true;
    clearInterval(this.timer);
    for (const id of [...this.witnessRooms.keys()]) this.close(this.witnessRooms, id);
    for (const id of [...this.settlerRooms.keys()]) this.close(this.settlerRooms, id);
  }

  restart(open: string | null): void {
    this.stopped = false;
    this.refresh(open);
  }

  private close(rooms: Map<string, Room>, roundId: string): void {
    const r = rooms.get(roundId);
    if (!r) return;
    rooms.delete(roundId);
    void r.transport.leave().catch(() => {});
  }

  /** Bring the rooms in line with the stores; `open` is the round the game has open. */
  refresh(open: string | null): void {
    if (this.stopped) return;
    this.open = open;
    const now = Date.now();
    const me = this.o.me();

    // Witnesses: one passive room per result still owed to someone.
    const mine = (id: string): boolean => id === open || this.o.closing(id);
    const owed = new Map(this.o.witnesses.list(now).filter((w) => !mine(w.roundId)).map((w) => [w.roundId, w]));
    for (const id of [...this.witnessRooms.keys()]) if (!owed.has(id)) this.close(this.witnessRooms, id);
    for (const [roundId, w] of owed) {
      if (this.witnessRooms.has(roundId)) continue;
      const peer = new ResultsPeer({ me: me.id, name: me.name, build: this.o.build, roundId, role: M.ROLE.WITNESS }, this.linkFor(this.witnessRooms, roundId), {
        onSettled: (player) => {
          this.o.witnesses.acknowledge(roundId, player);
          if (!this.o.witnesses.get(roundId)) this.close(this.witnessRooms, roundId);
        },
      });
      peer.record = w.record;
      this.witnessRooms.set(roundId, { peer, transport: this.o.open(roundId, peer, true) });
    }

    // Settlers: one active room per unsettled round, except those known to
    // be running, which are checked again a minute later.
    const watched = new Map(this.watched().filter(([id]) => !this.o.closing(id)));
    for (const id of [...this.settlerRooms.keys()]) if (!watched.has(id)) this.close(this.settlerRooms, id);
    for (const id of [...this.statuses.keys()]) if (!watched.has(id)) this.statuses.delete(id);
    for (const [roundId, entry] of watched) {
      if (this.settlerRooms.has(roundId) || (this.nextCheck.get(roundId) ?? 0) > now) continue;
      if (this.o.witnesses.get(roundId)) continue; // this browser saw the end; it settled then
      const peer = new ResultsPeer({ me: me.id, name: me.name, build: this.o.build, roundId, role: M.ROLE.SETTLER }, this.linkFor(this.settlerRooms, roundId), {
        onResult: (r) => {
          const points = r.players.find((p) => p.player === me.id)!.points;
          const practice = isPractice(r.players.map((p) => p.player)); // Q-23: nothing was paid
          this.o.profile.update((p) => (practice ? settlePractice : settle)(p, roundId, entry.ante, points, Date.now()));
          this.o.rounds.remove(roundId);
          this.statuses.delete(roundId);
          this.changed();
          setTimeout(() => this.close(this.settlerRooms, roundId), LEAVE_AFTER_SETTLED_MS);
        },
        onWithout: () => {
          // It ended without this player, who left before the countdown.
          if (this.o.profile.update((p) => forget(p, roundId))) {
            this.o.rounds.remove(roundId);
            this.close(this.settlerRooms, roundId);
            this.changed();
          }
        },
        onRunning: () => {
          if (this.statuses.get(roundId) !== 'running') {
            this.statuses.set(roundId, 'running');
            this.changed();
          }
          this.nextCheck.set(roundId, Date.now() + RECHECK_RUNNING_MS);
          this.close(this.settlerRooms, roundId); // doesn't take part (Q-6)
        },
      });
      if (!this.statuses.has(roundId)) {
        this.statuses.set(roundId, 'checking');
        this.changed();
      }
      this.settlerRooms.set(roundId, { peer, transport: this.o.open(roundId, peer, false) });
      setTimeout(() => {
        if (this.settlerRooms.has(roundId) && this.statuses.get(roundId) === 'checking') {
          this.statuses.set(roundId, 'paused');
          this.changed();
        }
      }, PAUSED_AFTER_MS);
    }
  }

  /** A results peer's link: sends through its room's transport, once open. */
  private linkFor(rooms: Map<string, Room>, roundId: string): { send(p: string, b: Uint8Array): void; broadcast(b: Uint8Array): void; drop(p: string): void } {
    return {
      send: (p, b) => rooms.get(roundId)?.transport.send(p, b),
      broadcast: (b) => rooms.get(roundId)?.transport.broadcast(b),
      drop: (p) => rooms.get(roundId)?.transport.drop?.(p),
    };
  }
}
