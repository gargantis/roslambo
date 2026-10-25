// Propose (PLAN §11): ante, minimum and maximum, then the link and code to
// share. The proposer holds the round until someone arrives, and can then
// play, watch or leave (REQUIREMENTS "Proposing").

import { config, playersCap } from '../../config';
import type { RoundSettings } from '../../core/sim/state';
import { h, setText } from '../dom';
import type { Game } from '../game';
import { invitePanel } from './invite';
import type { Screen } from './screen';

export interface ProposeHost {
  home(): void;
  create(settings: RoundSettings): void;
}

/** Null if the settings are valid, else what's wrong (REQUIREMENTS "Proposing"). */
export function checkSettings(s: RoundSettings): string | null {
  if (!Number.isSafeInteger(s.ante) || s.ante < 1) return 'The ante is a whole number, at least 1.';
  if (!Number.isSafeInteger(s.minPlayers) || s.minPlayers < config.minPlayers) return `The minimum is at least ${config.minPlayers} players.`;
  if (!Number.isSafeInteger(s.maxPlayers) || s.maxPlayers < s.minPlayers) return 'The maximum is at least the minimum.';
  if (s.maxPlayers > playersCap) return `The maximum is at most ${playersCap} players.`;
  return null;
}

export function proposeScreen(host: ProposeHost): Screen {
  const num = (value: number, min: number, max: number | undefined, test: string): HTMLInputElement =>
    h('input', { type: 'number', inputmode: 'numeric', value, min, max, step: 1, required: true, 'data-test': test });
  const ante = num(5, 1, undefined, 'ante');
  const min = num(config.minPlayers, config.minPlayers, playersCap, 'min');
  const max = num(playersCap, config.minPlayers, playersCap, 'max');
  const error = h('p', { class: 'error', role: 'alert', hidden: true });
  const submit = (e: Event): void => {
    e.preventDefault();
    const s = { ante: Number(ante.value), minPlayers: Number(min.value), maxPlayers: Number(max.value) };
    const problem = checkSettings(s);
    error.hidden = problem === null;
    if (problem) {
      error.textContent = problem;
      return;
    }
    host.create(s);
  };
  const el = h('section', { class: 'screen' },
    h('h1', {}, 'Propose a round'),
    h('form', { class: 'form', novalidate: true, onsubmit: submit },
      h('label', { class: 'field' }, h('span', {}, 'Ante: the points each player brings'), ante),
      h('label', { class: 'field' }, h('span', {}, 'Minimum players'), min),
      h('label', { class: 'field' }, h('span', {}, `Maximum players (at most ${playersCap})`), max),
      error,
      h('div', { class: 'row' },
        h('button', { type: 'submit', class: 'primary', 'data-test': 'create' }, 'Create'),
        h('button', { type: 'button', class: 'secondary', onclick: () => host.home() }, 'Back'))),
  );
  return { el };
}

export interface CreatedHost {
  play(): void;
  watch(): void;
  leave(): void;
}

/** After Create: share, keep the page open, then Play, Watch or Leave. */
export function createdScreen(game: Game, host: CreatedHost): Screen {
  const waiting = h('p', { class: 'status', 'data-test': 'created-status', 'aria-live': 'polite' });
  const play = h('button', { type: 'button', class: 'primary', disabled: true, 'data-test': 'play', onclick: () => host.play() }, 'Play');
  const watch = h('button', { type: 'button', disabled: true, 'data-test': 'watch', onclick: () => host.watch() }, 'Watch');
  const el = h('section', { class: 'screen' },
    h('h1', {}, 'Share this round'),
    h('p', {}, 'Send the link, or read out the code. Keep this page open until someone joins: until then, the round exists only here.'),
    invitePanel(game.roundId),
    waiting,
    h('div', { class: 'row' }, play, watch,
      h('button', { type: 'button', class: 'secondary', onclick: () => host.leave() }, 'Leave')),
  );
  return {
    el,
    frame(): void {
      const n = game.peers();
      const arrived = n > 0;
      play.disabled = watch.disabled = !arrived;
      setText(waiting, arrived ? `${n} ${n === 1 ? 'person has' : 'people have'} joined. You can play, watch or leave.` : 'Waiting for someone to join…');
    },
  };
}
