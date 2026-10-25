// Settings (PLAN §11): extra signalling relays and the player's own TURN
// server, checked as typed, and how many relays this tab reaches now.

import { h, setText } from '../dom';
import type { SettingsStore } from '../../storage/settings';
import type { Screen } from './screen';

export interface SettingsHost {
  settings: SettingsStore;
  health(): { open: number; total: number };
  home(): void;
}

export function settingsScreen(host: SettingsHost): Screen {
  const s = host.settings.get();
  const relays = h('textarea', { rows: 3, spellcheck: 'false', placeholder: 'One wss:// address per line', 'data-test': 'relays' });
  relays.value = s.relays.join('\n');
  const turn = s.turn[0];
  const turnUrl = h('input', { type: 'text', spellcheck: 'false', placeholder: 'turns:turn.example.com:443', value: turn?.urls ?? '', 'data-test': 'turn-url' });
  const turnUser = h('input', { type: 'text', autocomplete: 'off', value: turn?.username ?? '', 'data-test': 'turn-user' });
  const turnPass = h('input', { type: 'password', autocomplete: 'off', value: turn?.credential ?? '', 'data-test': 'turn-credential' });
  const message = h('p', { role: 'status', 'aria-live': 'polite', 'data-test': 'settings-message' });
  const health = h('p', { class: 'muted', 'data-test': 'relay-health' });

  const save = (e: Event): void => {
    e.preventDefault();
    const list = relays.value.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    const anyTurn = turnUrl.value.trim() || turnUser.value || turnPass.value;
    const problem = host.settings.set({
      relays: list,
      turn: anyTurn ? [{ urls: turnUrl.value.trim(), username: turnUser.value, credential: turnPass.value }] : [],
    });
    message.className = problem ? 'error' : 'muted';
    message.textContent = problem ?? 'Saved. Rounds you open from now on use these.';
  };

  const el = h('section', { class: 'screen' },
    h('h1', {}, 'Settings'),
    h('form', { class: 'form', novalidate: true, onsubmit: save },
      h('label', { class: 'field' }, h('span', {}, 'Extra relays, one per line, as well as the built-in six'), relays),
      h('fieldset', { class: 'field' },
        h('legend', {}, 'Your own TURN server, for networks that block direct connections'),
        h('label', { class: 'field' }, h('span', {}, 'URL'), turnUrl),
        h('label', { class: 'field' }, h('span', {}, 'User name'), turnUser),
        h('label', { class: 'field' }, h('span', {}, 'Credential'), turnPass)),
      message,
      h('div', { class: 'row' },
        h('button', { type: 'submit', class: 'primary', 'data-test': 'settings-save' }, 'Save'),
        h('button', { type: 'button', class: 'secondary', onclick: () => host.home() }, 'Back'))),
    health,
  );
  return {
    el,
    frame(): void {
      const { open, total } = host.health();
      setText(health, total === 0 ? 'Relays are contacted when you propose or join a round.' : `${open} of ${total} relays reachable.`);
    },
  };
}
