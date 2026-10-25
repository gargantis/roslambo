// The screens and the moves between them (PLAN §11, D-22): one in-memory
// state machine. While in a round the URL fragment is #join=<round ID>, so
// a reload returns to it; Home clears it.

import * as M from '../core/protocol/messages';
import { generateRoundId, nextRoundId, roundIdFromHash } from '../core/round-id';
import { scriptButtons } from '../core/sim/scripts';
import type { RoundSettings } from '../core/sim/state';
import { TrysteroRoom } from '../net/trystero';
import { ProfileStore } from '../storage/profile';
import { Controls } from './controls';
import { Game, type Result } from './game';
import { arenaScreen } from './screens/arena';
import { homeScreen } from './screens/home';
import { joinScreen } from './screens/join';
import { messageScreen } from './screens/message';
import { createdScreen, proposeScreen } from './screens/propose';
import { resultsScreen } from './screens/results';
import type { Screen } from './screens/screen';

declare global {
  interface Window {
    /** End-to-end tests only, set before the page loads: a local relay
     *  instead of the public ones, and scripted buttons for this page. */
    roslamboTest?: { relay?: string; script?: { seed: number; k: number } };
  }
}

const CLOSE_AFTER_AGAIN_MS = 500;

export class App {
  readonly profile = new ProfileStore();
  readonly controls = new Controls();
  private readonly root: HTMLElement;
  private readonly test = window.roslamboTest ?? null;
  private screen: Screen | null = null;
  private game: Game | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    addEventListener('hashchange', () => this.route());
    const loop = (now: number): void => {
      this.screen?.frame?.(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    this.route();
  }

  private route(): void {
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

  home(): void {
    this.closeGame();
    this.setHash(null);
    this.show(homeScreen({ profile: this.profile, propose: () => this.proposeForm(), join: (id) => this.open(id) }));
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
    this.closeGame();
    this.setHash(roundId);
    const p = this.profile.get();
    const relay = this.test?.relay;
    const g = new Game({
      roundId, me: p.playerId, name: p.name, profile: this.profile,
      transport: (s) => new TrysteroRoom({ roundId, ...(relay ? { relays: [relay], local: true } : {}) }, s, () => performance.now()),
    });
    const script = this.test?.script;
    g.controls = script ? () => scriptButtons(script.seed, script.k, g.session.timeline.localTick) : () => this.controls.sample();
    this.game = g;
    return g;
  }

  private closeGame(): void {
    this.game?.close();
    this.game = null;
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
    this.game?.leave();
    this.game = null;
    this.home();
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
    setTimeout(() => old.close(), CLOSE_AFTER_AGAIN_MS);
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
