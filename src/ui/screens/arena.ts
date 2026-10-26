// Pre-start, countdown and round (PLAN §11): the arena, the players and
// their points, and for players the buttons below or beside the arena.
// The canvas draws predicted ticks every frame; lists follow final ticks
// (§12), and only change the DOM when their content changes.

import { config } from '../../config';
import { LEFT, RIGHT, THRUST } from '../../core/sim/rules';
import { COUNTDOWN, PRESTART, RUNNING, hunterOf, quarryOf, type RoundState } from '../../core/sim/state';
import { interpolate, type DrawnPlanet } from '../../render/interpolate';
import { arenaLayout } from '../../render/layout';
import { planetColour } from '../../render/palette';
import { ArenaRenderer, type ArenaView } from '../../render/renderer';
import type { Controls } from '../controls';
import { h, setClass, setText } from '../dom';
import { PARAMS, type Game, type Result } from '../game';
import { bindButton, bindKeyboard } from '../input';
import { invitePanel } from './invite';
import type { Screen } from './screen';

export interface ArenaHost {
  controls: Controls;
  leave(): void;
  finished(result: Result): void;
  failed(reason: 'connect' | number): void;
}

/** A player's label: their display name, or for one without a name a
 *  label from their player ID. Not "Player 2": planet numbers follow the
 *  join order, so a number-based label moved between browsers from one
 *  round to the next (the owner's report, 2026-10-25). */
export function playerName(name: string, id: string): string {
  return name || `Player ${id.slice(0, 4).toUpperCase()}`;
}

export function chip(i: number): HTMLElement {
  return h('span', { class: 'chip', style: `--c:${planetColour(i + 1)}`, 'aria-hidden': 'true' }, String(i + 1));
}

function countdownLeft(s: RoundState): number {
  return Math.max(0, Math.ceil((s.countdownStart + PARAMS.countdownTicks - s.tick) / config.tickRate));
}

export function arenaScreen(game: Game, host: ArenaHost): Screen {
  const session = game.session;
  const me = session.cfg.me;
  const canvas = h('canvas', { class: 'arena', role: 'img', 'aria-label': 'The arena' });
  const overlay = h('div', { class: 'overlay', 'aria-live': 'polite' });
  const status = h('p', { class: 'status', 'data-test': 'status' }, 'Connecting to the round…');
  const leave = h('button', { type: 'button', class: 'secondary small', onclick: () => host.leave() }, 'Leave');
  const notice = h('p', { class: 'notice', hidden: true });
  const list = h('ol', { class: 'players', 'data-test': 'players' });
  const invite = h('details', { class: 'invite-box' }, h('summary', {}, 'Invite more players'), invitePanel(game.roundId));
  let inviteShown = false; // opened once while the round lacks players

  const left = h('button', { type: 'button', class: 'pad-button', 'aria-label': 'Rotate left (A)' }, '⟲');
  const right = h('button', { type: 'button', class: 'pad-button', 'aria-label': 'Rotate right (D)' }, '⟳');
  const thrust = h('button', { type: 'button', class: 'pad-button thrust', 'aria-label': 'Thrust (W)', hidden: true }, 'Thrust');
  // Disabled until this player has a planet: a Ready before then has no
  // planet to apply to, and would be lost.
  const ready = h('button', { type: 'button', class: 'pad-button ready', 'data-test': 'ready', disabled: true }, 'Joining…');
  bindButton(left, LEFT, host.controls);
  bindButton(right, RIGHT, host.controls);
  bindButton(thrust, THRUST, host.controls);
  const pad = h('div', { class: 'pad' }, left, ready, thrust, right);

  const stage = h('div', { class: 'stage' }, h('div', { class: 'arena-box' }, canvas, overlay), pad);
  const el = h('section', { class: 'screen arena-screen' },
    h('header', { class: 'bar' }, status, leave),
    stage, notice, list, invite);

  const renderer = new ArenaRenderer(canvas);
  const unbindKeys = bindKeyboard(host.controls);
  const drawn: DrawnPlanet[] = [];
  const view: ArenaView = { me: -1, ring: true, ringRadius: PARAMS.ringRadius, r: PARAMS.r, cx: PARAMS.cx, cy: PARAMS.cy };
  let readyOn = false;
  ready.addEventListener('click', () => game.ready(!readyOn));

  let layoutKey = '';
  const layout = (): void => {
    const player = game.isPlayer();
    const l = arenaLayout(innerWidth, innerHeight, player);
    const key = `${l.mode}:${l.arena}:${player}`;
    if (key === layoutKey) return;
    layoutKey = key;
    el.style.setProperty('--arena', `${l.arena}px`);
    setClass(el, 'beside', l.mode === 'beside');
    pad.hidden = !player;
  };
  addEventListener('resize', layout);
  layout();

  let lastFinal = -1;
  let listKey = '';
  let held = -1;
  let ended = false;

  function updateLists(s: RoundState): void {
    const n = s.planets.length;
    const mine = s.planets.findIndex((p) => p.id === me);
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const p = s.planets[i]!;
      const rdy = p.readyUntil > s.tick;
      parts.push(`${p.id}|${p.name}|${rdy ? 1 : 0}|${p.points}`);
    }
    const key = `${s.phase}|${mine}|${parts.join(',')}`;
    if (key === listKey) return;
    listKey = key;
    const rows = s.planets.map((p, i) => {
      const tags: string[] = [];
      if (i === mine) tags.push('you');
      else if (mine >= 0 && n >= 2 && i === quarryOf(mine, n)) tags.push('your quarry');
      if (mine >= 0 && n >= 3 && i === hunterOf(mine, n) && i !== mine) tags.push('your hunter');
      const detail = s.phase === PRESTART ? (p.readyUntil > s.tick ? 'ready' : 'not ready') : s.phase === COUNTDOWN ? 'ready' : `${p.points} ${p.points === 1 ? 'point' : 'points'}`;
      return h('li', { class: i === mine ? 'me' : '' }, chip(i),
        h('span', { class: 'name' }, playerName(p.name, p.id)),
        tags.length ? h('span', { class: 'tag' }, tags.join(', ')) : null,
        h('span', { class: 'detail' }, detail));
    });
    list.replaceChildren(...rows);
  }

  function statusLine(s: RoundState): string {
    const n = s.planets.length;
    const spectator = !game.isPlayer();
    const prefix = spectator ? 'Watching. ' : '';
    if (s.phase === PRESTART) {
      if (n < s.minPlayers) return `${prefix}Waiting for players: ${n} of at least ${s.minPlayers}.`;
      const readyCount = s.planets.filter((p) => p.readyUntil > s.tick).length;
      return `${prefix}Starts when everyone is ready: ${readyCount} of ${n}.`;
    }
    if (s.phase === COUNTDOWN) return `${prefix}Starting…`;
    if (s.phase === RUNNING) return spectator ? 'Watching.' : 'Hit your quarry; dodge your hunter.';
    return 'The round is over.';
  }

  return {
    el,
    frame(now: number): void {
      const t = session.timeline;
      if (!t.started) {
        const r = game.refusal();
        if (r !== null) host.failed(r);
        else if (game.failed(now)) host.failed('connect');
        renderer.draw([], view);
        return;
      }
      const head = t.head;
      view.me = head.planets.findIndex((p) => p.id === me);
      view.ring = head.phase === PRESTART || head.phase === COUNTDOWN;
      renderer.draw(interpolate(t.prevHead, head, t.alpha(now), drawn), view);

      // Buttons follow the predicted phase, so Thrust is live at 0.
      const playing = game.isPlayer();
      const prestart = head.phase === PRESTART;
      ready.hidden = !prestart;
      thrust.hidden = prestart;
      setClass(thrust, 'waiting', head.phase === COUNTDOWN);
      const b = host.controls.held();
      if (b !== held) {
        held = b;
        setClass(left, 'held', (b & LEFT) !== 0);
        setClass(right, 'held', (b & RIGHT) !== 0);
        setClass(thrust, 'held', (b & THRUST) !== 0);
      }
      setText(overlay, head.phase === COUNTDOWN ? String(countdownLeft(head)) : '');

      if (t.finalTick !== lastFinal) {
        lastFinal = t.finalTick;
        const s = t.final;
        layout();
        const mine = s.planets.find((p) => p.id === me);
        readyOn = mine !== undefined && mine.readyUntil > s.tick;
        ready.disabled = !mine;
        setText(ready, !mine ? (playing ? 'Joining…' : 'Ready') : readyOn ? 'Ready ✓' : 'Ready');
        setClass(ready, 'on', readyOn);
        setText(status, statusLine(s));
        updateLists(s);
        invite.hidden = s.phase !== PRESTART;
        if (!inviteShown && s.phase === PRESTART && s.planets.length < s.minPlayers) {
          inviteShown = true;
          invite.open = true; // a proposer who played at once still needs the link
        }
        const refused = session.refused;
        notice.hidden = !refused;
        if (refused) setText(notice, 'This round is full or has already started, so you’re watching it.');
      }
      if (!ended && game.result) {
        ended = true;
        host.finished(game.result);
      }
    },
    dispose(): void {
      removeEventListener('resize', layout);
      unbindKeys();
      renderer.dispose();
    },
  };
}
