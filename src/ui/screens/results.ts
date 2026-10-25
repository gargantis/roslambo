// Results (PLAN §11): final points and balance changes for every player,
// your new balance, Play again and Home. AGAIN from another peer turns
// Play again into "Join the next round" (§9.3).

import { h, setText } from '../dom';
import type { Game, Result } from '../game';
import { chip, playerName } from './arena';
import type { Screen } from './screen';

export interface ResultsHost {
  playAgain(): void;
  home(): void;
}

const signed = (x: number): string => (x > 0 ? `+${x}` : x < 0 ? `−${-x}` : '0');

export function resultsScreen(game: Game, r: Result, host: ResultsHost): Screen {
  const ante = r.settings.ante;
  const rows = r.players.map((p, i) => h('tr', { class: i === r.me ? 'me' : '' },
    h('td', {}, chip(i)),
    h('td', { class: 'name' }, playerName(p.name, i), i === r.me ? h('span', { class: 'tag' }, 'you') : null),
    h('td', { class: 'num' }, String(p.points)),
    h('td', { class: 'num' }, signed(p.points - ante))));
  const again = h('button', { type: 'button', class: 'primary', 'data-test': 'again', onclick: () => host.playAgain() }, 'Play again');
  const el = h('section', { class: 'screen results' },
    h('h1', {}, 'Round over'),
    h('table', { 'data-test': 'results' },
      h('thead', {}, h('tr', {}, h('th', {}, h('span', { class: 'visually-hidden' }, 'Planet')), h('th', {}, 'Player'), h('th', { class: 'num' }, 'Points'), h('th', { class: 'num' }, 'Change'))),
      h('tbody', {}, ...rows)),
    h('p', { class: 'muted' }, `The ante was ${ante}. Change is final points minus the ante.`),
    r.balance === null ? null : h('div', { class: 'balance' }, h('span', {}, 'Your balance'), h('strong', { 'data-test': 'balance' }, String(r.balance))),
    h('div', { class: 'row' }, again,
      h('button', { type: 'button', class: 'secondary', 'data-test': 'home', onclick: () => host.home() }, 'Home')),
  );
  return {
    el,
    frame(): void {
      setText(again, game.session.againSeen ? 'Join the next round' : 'Play again');
    },
  };
}
