// The link and code to share (PLAN §11, Propose), also offered on the
// pre-start screen so anyone in the round can invite more players.

import { formatRoundId, joinLink } from '../../core/round-id';
import { h } from '../dom';

export function inviteLink(roundId: string): string {
  return joinLink(location.href, roundId);
}

async function copy(text: string, button: HTMLButtonElement, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Copy failed: select it instead';
  }
  setTimeout(() => { button.textContent = label; }, 1500);
}

export function invitePanel(roundId: string): HTMLElement {
  const link = inviteLink(roundId);
  const code = formatRoundId(roundId);
  const copyLink = h('button', { type: 'button', class: 'secondary' }, 'Copy link');
  copyLink.addEventListener('click', () => void copy(link, copyLink, 'Copy link'));
  const copyCode = h('button', { type: 'button', class: 'secondary' }, 'Copy code');
  copyCode.addEventListener('click', () => void copy(code, copyCode, 'Copy code'));
  const share = typeof navigator.share === 'function'
    ? h('button', { type: 'button', class: 'secondary', onclick: () => void navigator.share({ title: 'roslambo', url: link }).catch(() => {}) }, 'Share…')
    : null;
  return h('div', { class: 'invite' },
    h('label', { class: 'field' }, h('span', {}, 'Link'), h('input', { type: 'text', readonly: true, value: link, 'data-test': 'invite-link', onfocus: (e: Event) => (e.target as HTMLInputElement).select() })),
    h('p', { class: 'code', 'data-test': 'invite-code', 'aria-label': 'Round code' }, code),
    h('div', { class: 'row' }, copyLink, copyCode, share),
  );
}
