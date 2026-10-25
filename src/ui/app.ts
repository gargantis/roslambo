// The screens and the moves between them (PLAN §11, D-22): one in-memory
// state machine. While in a round the URL fragment is #join=<round ID>, so
// a reload returns to it; Home clears it. The background service watches
// witnessed and unsettled rounds while no game has their room (§8.7).

import * as M from '../core/protocol/messages';
import { generateRoundId, nextRoundId, roundIdFromHash } from '../core/round-id';
import type { RoomPeer } from '../core/session/room-peer';
import { scriptButtons } from '../core/sim/scripts';
import type { RoundSettings } from '../core/sim/state';
import { TrysteroRoom, type RoomOptions } from '../net/trystero';
import { ProfileStore } from '../storage/profile';
import { SavedRounds } from '../storage/rounds';
import { SettingsStore } from '../storage/settings';
import { WitnessStore } from '../storage/witness';
import { Background } from './background';
import { Controls } from './controls';
import { BUILD, Game, type Result, type Transport } from './game';
import { arenaScreen } from './screens/arena';
import { homeScreen } from './screens/home';
import { joinScreen } from './screens/join';
import { messageScreen } from './screens/message';
import { createdScreen, proposeScreen } from './screens/propose';
import { resultsScreen } from './screens/results';
import type { Screen } from './screens/screen';
import { settingsScreen } from './screens/settings';

declare global {
  interface Window {
    /** End-to-end tests only, set before the page loads: a local relay
     *  instead of the public ones, and scripted buttons for this page. */
    roslamboTest?: { relay?: string; script?: { seed: number; k: number }; inspect?: () => Inspection | null };
  }
}

/** What end-to-end tests read about the open round (window.roslamboTest). */
export interface Inspection {
  roundId: string;
  timeline: string;
  started: boolean;
  finalTick: number;
  phase: number;
  planets: { id: string; lastInputTick: number; points: number; joinTick: number; readyUntil: number }[];
  me: string;
  peers: number;
  stats: { late: number; resyncs: number; disagree: number; received: number };
  hashes: Record<number, string>; // the last 200 final ticks' hashes
  headRoster: string[]; // the predicted state's planets, which the canvas draws
}

const CLOSE_AFTER_AGAIN_MS = 500;

export class App {
  readonly profile = new ProfileStore();
  readonly rounds = new SavedRounds();
  readonly witnesses = new WitnessStore();
  readonly settings = new SettingsStore();
  readonly controls = new Controls();
  readonly background: Background;
  private readonly root: HTMLElement;
  private readonly test = window.roslamboTest ?? null;
  private screen: Screen | null = null;
  private game: Game | null = null;
  private suspended = false;
  private readonly closing = new Set<string>(); // rounds whose game room is still closing

  constructor(root: HTMLElement) {
    this.root = root;
    this.background = new Background({
      me: () => {
        const p = this.profile.get();
        return { id: p.playerId, name: p.name };
      },
      build: BUILD, profile: this.profile, witnesses: this.witnesses, rounds: this.rounds,
      open: (roundId, peer, passive) => this.room(roundId, peer, passive),
      closing: (roundId) => this.closing.has(roundId),
    });
    if (this.test) this.test.inspect = () => this.inspect();
    addEventListener('hashchange', () => this.route());
    const loop = (now: number): void => {
      this.screen?.frame?.(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    this.route();
  }

  /** Every room this tab opens: the settings' relays and TURN (§8.8), or
   *  the local relay in end-to-end tests. */
  private room(roundId: string, peer: RoomPeer, passive: boolean): Transport {
    const s = this.settings.get();
    const relay = this.test?.relay;
    const opts: RoomOptions = relay
      ? { roundId, relays: [relay], local: true, passive }
      : { roundId, extraRelays: s.relays, turn: s.turn, passive };
    return new TrysteroRoom(opts, peer, () => performance.now());
  }

  private inspect(): Inspection | null {
    const g = this.game;
    if (!g) return null;
    const t = g.session.timeline;
    const hashes: Record<number, string> = {};
    for (let k = Math.max(0, t.finalTick - 200); k <= t.finalTick; k++) hashes[k] = t.hashAt(k);
    return {
      roundId: g.roundId, timeline: t.id, started: t.started, finalTick: t.finalTick, phase: t.final.phase, me: g.session.cfg.me, hashes,
      planets: t.final.planets.map((p) => ({ id: p.id, lastInputTick: p.lastInputTick, points: p.points, joinTick: p.joinTick, readyUntil: p.readyUntil })),
      headRoster: t.head.planets.map((p) => p.id),
      peers: g.peers(),
      stats: { late: t.stats.late, resyncs: t.stats.resyncs, disagree: t.stats.disagree, received: t.stats.received },
    };
  }

  private route(): void {
    if (this.suspended) return;
    const id = roundIdFromHash(location.hash);
    if (id) this.open(id);
    else this.home();
  }

  private show(s: Screen): void {
    this.controls.releaseAll();
    this.screen?.dispose?.();
    this.screen = s;
    this.root.replaceChildren(s.el);
    const heading = s.el.querySelector('h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    scrollTo(0, 0);
  }

  private setHash(roundId: string | null): void {
    history.replaceState(null, '', roundId ? `#join=${roundId}` : `${location.pathname}${location.search}`);
  }

  /** Another tab took over (Q-16): stop everything and say so. */
  suspend(useHere: () => void): void {
    this.suspended = true;
    this.closeGame(false);
    this.background.stop();
    this.show(messageScreen('roslambo is open in another tab', 'Only one tab plays at a time. Use that one, or play here instead.', [{ label: 'Use here', run: useHere }], 'other-tab'));
  }

  resume(): void {
    this.suspended = false;
    this.background.restart(null);
    this.route();
  }

  home(): void {
    this.closeGame();
    this.setHash(null);
    this.show(homeScreen({
      profile: this.profile,
      background: this.background,
      propose: () => this.proposeForm(),
      join: (id) => this.open(id),
      rejoin: (id) => this.enter(id, true),
      settings: () => this.settingsForm(),
    }));
  }

  private settingsForm(): void {
    this.show(settingsScreen({ settings: this.settings, health: () => TrysteroRoom.relayHealth(), home: () => this.home() }));
  }

  /** A #join= link or a typed code. A player of a round this browser
   *  hasn't settled goes straight back to its planet (§11). */
  private open(roundId: string): void {
    if (this.game?.roundId === roundId) return;
    const entry = this.profile.get().rounds[roundId];
    if (entry && !entry.settled) {
      this.enter(roundId, true);
      return;
    }
    this.closeGame();
    this.setHash(roundId);
    this.show(joinScreen(roundId, { enter: (id, play) => this.enter(id, play), home: () => this.home() }));
  }

  private newGame(roundId: string): Game {
    this.closeGame(false);
    this.background.release(roundId);
    this.setHash(roundId);
    const p = this.profile.get();
    const g = new Game({
      roundId, me: p.playerId, name: p.name, profile: this.profile, rounds: this.rounds, witnesses: this.witnesses,
      saved: this.rounds.load(roundId),
      transport: (s) => this.room(roundId, s, false),
    });
    const script = this.test?.script;
    g.controls = script ? () => scriptButtons(script.seed, script.k, g.session.timeline.localTick) : () => this.controls.sample();
    this.game = g;
    return g;
  }

  /** Closes the open game; the background takes its room back unless
   *  another game is about to open. */
  private closeGame(refresh = true): void {
    this.game?.close();
    this.game = null;
    if (refresh) this.background.refresh(null);
  }

  private enter(roundId: string, play: boolean): void {
    const g = this.newGame(roundId);
    if (play) g.play();
    this.arena(g);
  }

  private arena(g: Game): void {
    this.show(arenaScreen(g, {
      controls: this.controls,
      leave: () => this.leaveGame(),
      finished: (r) => this.results(g, r),
      failed: (reason) => this.failed(g, reason),
    }));
  }

  private leaveGame(): void {
    const g = this.game;
    this.game = null;
    if (g) {
      g.leave();
      this.closeLater(g.roundId, 600); // its LEAVE goes out first
    }
    this.home();
  }

  /** The background may use a round's room again once its game has left it. */
  private closeLater(roundId: string, ms: number, close?: () => void): void {
    this.closing.add(roundId);
    setTimeout(() => {
      close?.();
      this.closing.delete(roundId);
      this.background.refresh(this.game?.roundId ?? null);
    }, ms);
  }

  private proposeForm(): void {
    this.show(proposeScreen({ home: () => this.home(), create: (s) => this.create(s) }));
  }

  private create(settings: RoundSettings): void {
    const g = this.newGame(generateRoundId());
    g.propose(settings);
    this.show(createdScreen(g, {
      play: () => {
        g.play();
        this.arena(g);
      },
      watch: () => this.arena(g),
      leave: () => this.leaveGame(),
    }));
  }

  private results(g: Game, r: Result): void {
    this.show(resultsScreen(g, r, { playAgain: () => void this.playAgain(g, r), home: () => this.home() }));
  }

  /** Q-8: every press leads to the same derived round. Whoever finds it
   *  empty proposes it with the same settings; two at once merge (D-12). */
  private async playAgain(old: Game, r: Result): Promise<void> {
    const id = await nextRoundId(old.roundId);
    if (this.game !== old) return; // left meanwhile
    old.session.announceAgain();
    this.game = null;
    this.closeLater(old.roundId, CLOSE_AFTER_AGAIN_MS, () => old.close());
    const g = this.newGame(id);
    if (!old.session.againSeen) g.propose(r.settings);
    g.play();
    this.arena(g);
  }

  private failed(g: Game, reason: 'connect' | number): void {
    const wasPlayer = g.session.wantsToPlay;
    const roundId = g.roundId;
    this.closeGame();
    const home = { label: 'Home', run: () => this.home() };
    const retry = { label: 'Try again', run: () => this.enter(roundId, wasPlayer) };
    if (reason === 'connect') {
      this.show(messageScreen('Couldn’t connect', 'Couldn’t connect to the other players. One of your networks may be blocking direct connections; try another network, or add a TURN server in Settings. The round may also have ended, or its proposer left before anyone joined.', [retry, home], 'connect-failed'));
    } else if (reason === M.REFUSAL.BUILD || reason === M.REFUSAL.PROTOCOL) {
      this.show(messageScreen('A different version', 'The other players are running a different version of roslambo. Everyone should reload the page, then join again.', [home], 'build-mismatch'));
    } else if (reason === M.REFUSAL.SPECTATORS_FULL) {
      this.show(messageScreen('No room to watch', 'This round already has as many spectators as it can take.', [retry, home], 'spectators-full'));
    } else {
      this.show(messageScreen('Open in another tab', 'This round is already open in another tab or window of this browser. Use that one, or close it and try again.', [retry, home], 'duplicate'));
    }
  }
}
