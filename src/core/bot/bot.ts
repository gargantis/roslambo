// Bots (Q-23): computer-controlled players that a player's or a
// spectator's browser hosts. A bot is an ordinary player of the round: its
// host sends its inputs inside the host's own TICKs (§9.3), and the
// simulation can't tell it from a person.
//
// A bot's ID is derived from its host's, so a host that reloads finds its
// bots in the roster again, and a receiver can check that a bot's inputs
// come from its host. It is a UUID of version 8, RFC 9562's custom
// version, where a browser's own ID is version 4 (D-20), so every peer
// tells a bot from a person by its ID alone.

import { playersCap } from '../../config';
import { hash64 } from '../sim/hash';
import type { SimParams } from '../sim/params';
import { COUNTDOWN, RUNNING, type RoundState } from '../sim/state';
import { DEFAULT_STYLE, steer, type SteerStyle } from './steer';

/** The most bots one browser hosts: every seat of the largest round. */
export const BOT_SLOTS = playersCap;

/** The ID of the k-th bot that `host` hosts. */
export function botId(host: string, k: number): string {
  const enc = new TextEncoder();
  const hex = hash64(enc.encode(`roslambo bot ${host} ${k} a`)) + hash64(enc.encode(`roslambo bot ${host} ${k} b`));
  const variant = ((parseInt(hex[16]!, 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 12)}8${hex.slice(13, 16)}${variant}${hex.slice(17)}`;
}

/** Every ID `host` may give a bot, in the order it hands them out. */
export function botIds(host: string): string[] {
  return Array.from({ length: BOT_SLOTS }, (_, k) => botId(host, k));
}

export function isBot(id: string): boolean {
  return id.length === 32 && id[12] === '8';
}

/** A bot's display name, from its ID as a nameless player's label is. */
export function botName(id: string): string {
  return `Bot ${id.slice(0, 4).toUpperCase()}`;
}

/** Each bot's own temper, from its ID: how hard it turns, how well it
 *  aims before it thrusts, and how much it fears its hunter. */
function styleOf(id: string): SteerStyle {
  const u = (k: number): number => parseInt(id.slice(20 + 2 * k, 22 + 2 * k), 16) / 255;
  return { ...DEFAULT_STYLE, gain: 3 + 2 * u(0), aimTolerance: 0.35 + 0.4 * u(1), fear: 1 + u(2), fearRange: 0.15 + 0.1 * u(3) };
}

/** The buttons bot `id` holds in state s. Before the countdown it leaves
 *  its rotation alone: the ring keeps every planet facing its quarry. */
export function botButtons(s: RoundState, id: string, P: SimParams): number {
  if (s.phase !== COUNTDOWN && s.phase !== RUNNING) return 0;
  const i = s.planets.findIndex((p) => p.id === id);
  return i < 0 ? 0 : steer(s, i, P, styleOf(id));
}
