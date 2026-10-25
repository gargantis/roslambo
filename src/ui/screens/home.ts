// Home (PLAN §11): balance, display name, Propose a round, Join by code,
// the unsettled rounds with Rejoin or Resume (Q-6), and Settings.

import { fitName } from '../../core/names';
import { formatRoundId, normalizeRoundId } from '../../core/round-id';
import type { ProfileStore } from '../../storage/profile';
import type { Background, UnsettledRound } from '../background';
import { h, setText } from '../dom';
import type { Screen } from './screen';

export interface HomeHost {
  profile: ProfileStore;
  background: Background;
  propose(): void;
  join(roundId: string): void;
  rejoin(roundId: string): void;
  settings(): void;
}

function unsettledRow(u: UnsettledRound, host: HomeHost): HTMLElement {
  const code = formatRoundId(u.roundId);
  const what = u.status === 'running' ? 'Still being played.'
    : u.status === 'paused' ? (u.saved ? 'Paused: nobody is playing it. You can resume it from where you left.' : 'Paused: nobody is playing it.')
      : 'Looking for its players…';
  const label = u.status === 'running' ? 'Rejoin' : u.status === 'paused' ? 'Resume' : 'Open';
  return h('li', { 'data-test': 'unsettled' },
    h('div', { class: 'grow' },
      h('span', { class: 'code small' }, code),
      h('span', { class: 'muted' }, ` · ante ${u.entry.ante}${u.entry.antePaid ? '' : ', not started'}`),
      h('p', { class: 'muted small', 'data-test': 'unsettled-status' }, what)),
    h('button', { type: 'button', 'data-test': 'unsettled-open', onclick: () => host.rejoin(u.roundId) }, label));
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

  const unsettled = h('ul', { class: 'unsettled' });
  const unsettledBox = h('section', { class: 'box', hidden: true },
    h('h2', {}, 'Your unsettled rounds'),
    h('p', { class: 'muted small' }, 'Rounds whose result you haven’t received. Results arrive by themselves while roslambo is open and another player of the round is too.'),
    unsettled);
  let shown = -1;
  const balance = h('strong', { 'data-test': 'balance' }, String(p.balance));

  const el = h('section', { class: 'screen home' },
    h('h1', {}, 'roslambo'),
    h('p', { class: 'tagline' }, 'Bumper planet rock, paper, scissors.'),
    h('div', { class: 'balance' }, h('span', {}, 'Your balance'), balance),
    h('label', { class: 'field' }, h('span', {}, 'Display name'), name),
    h('button', { type: 'button', class: 'primary', 'data-test': 'propose', onclick: () => { saveName(); host.propose(); } }, 'Propose a round'),
    h('form', { class: 'join', onsubmit: join },
      h('label', { class: 'field' }, h('span', {}, 'Join with a code'), code),
      h('button', { type: 'submit', 'data-test': 'join' }, 'Join'),
      error),
    unsettledBox,
    host.profile.persistent ? null : h('p', { class: 'notice' }, 'This browser isn’t keeping your balance and name between visits.'),
    h('p', {}, h('button', { type: 'button', class: 'secondary', 'data-test': 'settings', onclick: () => host.settings() }, 'Settings')),
  );
  return {
    el,
    frame(): void {
      if (host.background.version === shown) return;
      shown = host.background.version;
      const list = host.background.unsettled();
      unsettledBox.hidden = list.length === 0;
      unsettled.replaceChildren(...list.map((u) => unsettledRow(u, host)));
      setText(balance, String(host.profile.get().balance)); // a background result may have landed
    },
  };
}
