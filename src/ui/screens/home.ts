// Home (PLAN §11): balance, display name, Propose a round, and Join by
// code. The unsettled-rounds list and Settings arrive with M5.

import { fitName } from '../../core/names';
import { normalizeRoundId } from '../../core/round-id';
import type { ProfileStore } from '../../storage/profile';
import { h } from '../dom';
import type { Screen } from './screen';

export interface HomeHost {
  profile: ProfileStore;
  propose(): void;
  join(roundId: string): void;
}

export function homeScreen(host: HomeHost): Screen {
  const p = host.profile.get();
  const name = h('input', { type: 'text', value: p.name, maxlength: 40, autocomplete: 'nickname', placeholder: 'Optional', 'data-test': 'name' });
  const saveName = (): void => {
    const fitted = fitName(name.value);
    name.value = fitted;
    host.profile.update((x) => {
      if (x.name === fitted) return false;
      x.name = fitted;
      return true;
    });
  };
  name.addEventListener('change', saveName);
  name.addEventListener('blur', saveName);

  const code = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'K7QM-2XDP-4TR8-WHZN-3VBC-7', 'data-test': 'code' });
  const error = h('p', { class: 'error', role: 'alert', hidden: true });
  const join = (e: Event): void => {
    e.preventDefault();
    const id = normalizeRoundId(code.value);
    if (!id) {
      error.textContent = 'That code isn’t valid. Check it and try again: it has 21 characters.';
      error.hidden = false;
      return;
    }
    host.join(id);
  };

  const el = h('section', { class: 'screen home' },
    h('h1', {}, 'roslambo'),
    h('p', { class: 'tagline' }, 'Bumper planet rock, paper, scissors.'),
    h('div', { class: 'balance' }, h('span', {}, 'Your balance'), h('strong', { 'data-test': 'balance' }, String(p.balance))),
    h('label', { class: 'field' }, h('span', {}, 'Display name'), name),
    h('button', { type: 'button', class: 'primary', 'data-test': 'propose', onclick: () => { saveName(); host.propose(); } }, 'Propose a round'),
    h('form', { class: 'join', onsubmit: join },
      h('label', { class: 'field' }, h('span', {}, 'Join with a code'), code),
      h('button', { type: 'submit', 'data-test': 'join' }, 'Join'),
      error),
    host.profile.persistent ? null : h('p', { class: 'notice' }, 'This browser isn’t keeping your balance and name between visits.'),
  );
  return { el };
}
