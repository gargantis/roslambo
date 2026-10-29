// The look book's two recorded rounds (REPORT.md): the game's simulation,
// with every player steered by src/core/bot/steer.ts (dev/steer.ts when
// they were recorded), written into look-book.html.
// Planets press nothing before the round, so the ring keeps its default
// facing; once it runs, each bot steers with its own style. Deterministic.
// Run with
//   npx vitest run --config research/appearance/vitest.config.ts

import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { DEFAULT_SETTINGS, makeParams } from '../../src/core/sim/params';
import { JOIN, READY, step, type PlayerInput } from '../../src/core/sim/rules';
import { scriptPlayerId } from '../../src/core/sim/scripts';
import { COUNTDOWN, FROZEN, RUNNING, genesis } from '../../src/core/sim/state';
import { DEFAULT_STYLE, steer, type SteerStyle } from '../../src/core/bot/steer';

const PAGE = new URL('./look-book.html', import.meta.url);
const NAMES = ['kepler', 'Mo', 'nova', 'Pia', 'rocky', 'Lumen', 'zed', 'Ines'];

interface Frame {
  n: number;
  phase: number;
  p: { x: number; y: number; a: number; f: number; pts: number }[];
}

/** Players join 36 ticks apart and press Ready together; the countdown is
 *  cut to 3 s. Every second tick is kept. */
function record(n: number, seed: number, ante: number, maxRunSeconds: number) {
  const P = makeParams({ ...DEFAULT_SETTINGS, countdownSeconds: 3 });
  const s = genesis({ ante, minPlayers: 3, maxPlayers: 8 });
  const ids = Array.from({ length: n }, (_, k) => scriptPlayerId(seed, k));
  const joinAt = (k: number): number => 1 + 36 * k;
  const readyAt = joinAt(n - 1) + 70;
  let rnd = seed * 7919 + 17;
  const rand = (): number => (rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648;
  const styles: SteerStyle[] = ids.map(() => ({
    ...DEFAULT_STYLE, gain: 3 + 2 * rand(), aimTolerance: 0.35 + 0.4 * rand(), fear: 1 + rand(), fearRange: 0.15 + 0.1 * rand(),
  }));
  const frames: Frame[] = [];
  const marks = { countdown: -1, running: -1, frozen: -1 };
  for (let t = 1; ; t++) {
    const inputs: PlayerInput[] = [];
    const buttons: number[] = [];
    for (let k = 0; k < n; k++) {
      if (t < joinAt(k)) continue;
      const i = s.planets.findIndex((p) => p.id === ids[k]);
      const b = s.phase === RUNNING && i >= 0 ? steer(s, i, P, styles[k]) : 0;
      let events = 0;
      if (t === joinAt(k)) events |= JOIN;
      if (t === readyAt + k) events |= READY;
      inputs.push({ id: ids[k]!, buttons: b, events, ...((events & JOIN) !== 0 ? { name: NAMES[k]! } : {}) });
      if (i >= 0) buttons[i] = b;
    }
    step(s, inputs, P);
    if (s.phase === COUNTDOWN && marks.countdown < 0) marks.countdown = t;
    if (s.phase === RUNNING && marks.running < 0) marks.running = t;
    if (s.phase === FROZEN && marks.frozen < 0) marks.frozen = t;
    if (t % 2 === 0) {
      frames.push({ n: s.planets.length, phase: s.phase, p: s.planets.map((p, i) => ({ x: p.x, y: p.y, a: p.angle >>> 16, f: buttons[i] ?? 0, pts: p.points })) });
    }
    if (marks.frozen > 0 && t > marks.frozen + 120) break;
    if (marks.running > 0 && t > marks.running + maxRunSeconds * 60) break;
  }
  return { ids, frames, marks };
}

/** Per frame: planet count and phase, then per planet x, y (0…1 as
 *  uint16), the angle's top 16 bits, buttons and points, little-endian. */
function encode(r: ReturnType<typeof record>, n: number) {
  const per = 2 + n * 8;
  const buf = Buffer.alloc(r.frames.length * per);
  const q = (v: number): number => Math.max(0, Math.min(65535, Math.round(v * 65535)));
  r.frames.forEach((fr, j) => {
    let o = j * per;
    buf.writeUInt8(fr.n, o++);
    buf.writeUInt8(fr.phase, o++);
    for (let k = 0; k < n; k++, o += 8) {
      const p = fr.p[k];
      if (!p) continue;
      buf.writeUInt16LE(q(p.x), o);
      buf.writeUInt16LE(q(p.y), o + 2);
      buf.writeUInt16LE(p.a, o + 4);
      buf.writeUInt8(p.f, o + 6);
      buf.writeInt8(p.pts, o + 7);
    }
  });
  const frame = (tick: number): number => (tick < 0 ? -1 : Math.floor(tick / 2));
  return {
    fps: 30, frames: r.frames.length, n, ids: r.ids, names: NAMES.slice(0, n),
    countdown: frame(r.marks.countdown), running: frame(r.marks.running), frozen: frame(r.marks.frozen),
    data: buf.toString('base64'),
  };
}

function setIsland(html: string, id: string, json: string): string {
  const re = new RegExp(`(<script type="application/json" id="${id}">)[\\s\\S]*?(</script>)`);
  if (!re.test(html)) throw new Error(`look-book.html has no ${id} block`);
  return html.replace(re, (_, open: string, close: string) => open + json + close);
}

it('records both rounds into look-book.html', () => {
  let html = readFileSync(PAGE, 'utf8');
  html = setIsland(html, 'round-8', JSON.stringify(encode(record(8, 1, 5, 90), 8)));
  html = setIsland(html, 'round-5', JSON.stringify(encode(record(5, 3, 4, 90), 5)));
  writeFileSync(PAGE, html);
}, 60_000);
