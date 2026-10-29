import { describe, expect, it } from 'vitest';
import { makeParams } from '../sim/params';
import { JOIN, READY, step, THRUST, type PlayerInput } from '../sim/rules';
import { COUNTDOWN, FROZEN, PRESTART, RUNNING, genesis } from '../sim/state';
import { BOT_SLOTS, botButtons, botId, botIds, botName, isBot } from './bot';

const P = makeParams();
const id = (k: number): string => (k + 1).toString(16).padStart(32, '0');

/** A round from tick 1, everyone joined and ready at once; bots steer and
 *  the others press nothing. The ticks from the start to the freeze, or −1. */
function playOut(players: string[], ante: number, maxSeconds: number): number {
  const s = genesis({ ante, minPlayers: 3, maxPlayers: 8 });
  let start = -1;
  for (let t = 1; t <= maxSeconds * 60; t++) {
    const inputs: PlayerInput[] = players.map((p) => ({ id: p, buttons: isBot(p) ? botButtons(s, p, P) : 0, events: t === 1 ? JOIN | READY : 0 }));
    step(s, inputs, P);
    if (s.phase === RUNNING && start < 0) start = t;
    if (s.phase === FROZEN) return t - start;
  }
  return -1;
}

describe('bots (Q-23)', () => {
  it('gives each host its own bot IDs, the same after a reload, of a UUID version no browser uses', () => {
    const a = botIds(id(1));
    const b = botIds(id(2));
    expect(a).toHaveLength(BOT_SLOTS);
    expect(new Set([...a, ...b]).size).toBe(2 * BOT_SLOTS);
    expect(botIds(id(1))).toEqual(a);
    expect(botId(id(1), 3)).toBe(a[3]);
    for (const x of [...a, ...b]) {
      expect(x).toMatch(/^[0-9a-f]{12}8[0-9a-f]{3}[89ab][0-9a-f]{15}$/); // version 8, variant 10 (RFC 9562)
      expect(isBot(x)).toBe(true);
    }
    // A browser's own ID is version 4 (D-20).
    for (let k = 0; k < 200; k++) expect(isBot(crypto.randomUUID().replace(/-/g, ''))).toBe(false);
  });

  it('names a bot from its ID, as a nameless player is labelled', () => {
    const x = botId(id(1), 0);
    expect(botName(x)).toBe(`Bot ${x.slice(0, 4).toUpperCase()}`);
  });

  it('leaves the ring alone before the countdown, turns during it, and thrusts only once the round runs', () => {
    const P1 = makeParams({ ...P.settings, countdownSeconds: 1 });
    const bots = botIds(id(1)).slice(0, 3);
    const s = genesis({ ante: 5, minPlayers: 3, maxPlayers: 8 });
    step(s, bots.map((b) => ({ id: b, buttons: 0, events: JOIN })), P1);
    const seen = { [PRESTART]: 0, [COUNTDOWN]: 0, [RUNNING]: 0 } as Record<number, number>;
    let thrust = 0;
    for (let t = 2; t < 400; t++) {
      const inputs = bots.map((b) => ({ id: b, buttons: botButtons(s, b, P1), events: t === 100 ? READY : 0 }));
      for (const x of inputs) {
        if (s.phase === PRESTART) expect(x.buttons).toBe(0);
        if (s.phase === COUNTDOWN) expect(x.buttons & THRUST).toBe(0);
        if (s.phase === RUNNING && (x.buttons & THRUST) !== 0) thrust++;
      }
      seen[s.phase] = (seen[s.phase] ?? 0) + 1;
      step(s, inputs, P1);
    }
    expect(seen[PRESTART]).toBeGreaterThan(90);
    expect(seen[COUNTDOWN]).toBeGreaterThan(50);
    expect(thrust).toBeGreaterThan(0);
    expect(botButtons(s, id(9), P1)).toBe(0); // not in the round
  });

  it('end their rounds: three bots, or a player who presses nothing against two', () => {
    // research/tuning measured steering bots' rounds at a median of 48 s
    // with three planets and an ante of 5. On 2026-10-28 these hosts' bots
    // took 21–197 s, and a player pressing nothing lasted 13–221 s.
    for (let h = 0; h < 12; h++) {
      const bots = botIds(id(h));
      const alone = playOut(bots.slice(0, 3), 5, 600);
      const withMe = playOut(['f'.repeat(32), ...bots.slice(0, 2)], 5, 600);
      expect(alone, `host ${h}, three bots`).toBeGreaterThan(0);
      expect(alone, `host ${h}, three bots`).toBeLessThan(300 * 60);
      expect(withMe, `host ${h}, a player and two bots`).toBeGreaterThan(0);
      expect(withMe, `host ${h}, a player and two bots`).toBeLessThan(300 * 60);
    }
  });
});
