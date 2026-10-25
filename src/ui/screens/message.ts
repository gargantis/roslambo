// The messages of PLAN §11: a title, an explanation, and what to do next.

import { h } from '../dom';
import type { Screen } from './screen';

export interface Action {
  label: string;
  run: () => void;
}

export function messageScreen(title: string, body: string, actions: Action[], test = 'message'): Screen {
  const el = h('section', { class: 'screen message', 'data-test': test, role: 'alert' },
    h('h1', {}, title),
    h('p', {}, body),
    actions.length ? h('div', { class: 'row' }, ...actions.map((a, i) => h('button', { type: 'button', class: i === 0 ? 'primary' : 'secondary', onclick: a.run }, a.label))) : null,
  );
  return { el };
}
