// Entry point: the determinism canary (D-17), then the game, or one of the
// production bundle's test pages (#test=determinism, net or frames).

import { canary } from './core/sim/goldens.json';
import { canaryHash } from './core/sim/golden';
import { holdTabLock } from './storage/tab-lock';
import { App } from './ui/app';
import { messageScreen } from './ui/screens/message';
import './ui/style.css';

// D-17: a browser that computes the simulation differently would desync
// every round it joined, so it must not join any.
const computesLikeEveryone = canaryHash() === canary;
document.documentElement.dataset.canary = computesLikeEveryone ? 'ok' : 'mismatch';

const root = document.getElementById('app')!;
const hash = location.hash;
let readyNow = true; // the game marks itself ready once it holds the tab lock
if (hash === '#test=determinism') {
  void import('./determinism').then((m) => m.run());
} else if (hash.startsWith('#test=net&') && computesLikeEveryone) {
  void import('./nettest').then((m) => m.run());
} else if (hash.startsWith('#test=frames') && computesLikeEveryone) {
  // No secure context needed: it opens no connection and stores nothing.
  void import('./frames').then((m) => m.run(root));
} else if (!computesLikeEveryone) {
  root.replaceChildren(messageScreen('This browser can’t play', 'This browser computes the game differently from other browsers, so it can’t join a round. Please try another browser.', [], 'canary-failed').el);
} else if (!isSecureContext) {
  root.replaceChildren(messageScreen('A secure connection is needed', 'roslambo needs a secure connection to reach other players. Open it over https, or on localhost.', [], 'insecure').el);
} else {
  readyNow = false;
  void start();
}
if (readyNow) document.documentElement.dataset.ready = '1';

/** One game tab per browser (Q-16): this tab plays once it holds the lock. */
async function start(): Promise<void> {
  let app: App | null = null;
  const useHere = async (): Promise<void> => {
    await holdTabLock(true, lost);
    if (app) app.resume();
    else app = new App(root);
  };
  const lost = (): void => {
    if (app) app.suspend(() => void useHere());
    else other();
  };
  const other = (): void => {
    root.replaceChildren(messageScreen('roslambo is open in another tab', 'Only one tab plays at a time. Use that one, or play here instead.', [{ label: 'Use here', run: () => void useHere() }], 'other-tab').el);
  };
  if (await holdTabLock(false, lost)) app = new App(root);
  else other();
  document.documentElement.dataset.ready = '1';
}
