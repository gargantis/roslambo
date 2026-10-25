// Entry point: the determinism canary (D-17), then the game, or one of the
// production bundle's test pages (#test=determinism, net or frames).

import { canary } from './core/sim/goldens.json';
import { canaryHash } from './core/sim/golden';
import { App } from './ui/app';
import { messageScreen } from './ui/screens/message';
import './ui/style.css';

// D-17: a browser that computes the simulation differently would desync
// every round it joined, so it must not join any.
const computesLikeEveryone = canaryHash() === canary;
document.documentElement.dataset.canary = computesLikeEveryone ? 'ok' : 'mismatch';

const root = document.getElementById('app')!;
const hash = location.hash;
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
  new App(root);
}
document.documentElement.dataset.ready = '1';
