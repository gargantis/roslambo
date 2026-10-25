// Entry point. M4 builds the screens (PLAN §11); until then this runs the
// determinism canary and shows the result.

import { canary } from './core/sim/goldens.json';
import { canaryHash } from './core/sim/golden';

// D-17: a browser that computes the simulation differently would desync
// every round it joined, so it must not join any.
const computesLikeEveryone = canaryHash() === canary;
document.documentElement.dataset.canary = computesLikeEveryone ? 'ok' : 'mismatch';

const statusLine = document.getElementById('status');
if (statusLine) {
  statusLine.textContent = computesLikeEveryone
    ? 'In development.'
    : 'This browser computes the game differently from other browsers, so it can’t join a round. Please try another browser.';
}

if (location.hash === '#test=determinism') {
  void import('./determinism').then((m) => m.run());
}
if (location.hash.startsWith('#test=net&') && computesLikeEveryone) {
  void import('./nettest').then((m) => m.run());
}
document.documentElement.dataset.ready = '1';

export {};
