// Join (PLAN §11): Play or Watch, for a #join= link or a typed code.

import { formatRoundId } from '../../core/round-id';
import { h } from '../dom';
import type { Screen } from './screen';

export interface JoinHost {
  enter(roundId: string, play: boolean): void;
  home(): void;
}

export function joinScreen(roundId: string, host: JoinHost): Screen {
  const el = h('section', { class: 'screen' },
    h('h1', {}, 'Join a round'),
    h('p', { class: 'code' }, formatRoundId(roundId)),
    h('p', {}, 'Play to fly a planet, or watch without one.'),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'primary', 'data-test': 'join-play', onclick: () => host.enter(roundId, true) }, 'Play'),
      h('button', { type: 'button', 'data-test': 'join-watch', onclick: () => host.enter(roundId, false) }, 'Watch'),
      h('button', { type: 'button', class: 'secondary', onclick: () => host.home() }, 'Home')),
  );
  return { el };
}
