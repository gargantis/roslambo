// The frame-time bench (Q-1, docs/acceptance.md): the real round screen,
// renderer and timeline, with seven virtual players on this page instead
// of a network, measured for `seconds` once all eight planets are in.
// Opened as #test=frames[&seconds=120]; shows the verdict on screen and
// exposes it to Playwright. Pass: frame interval p95 ≤ 18 ms, max ≤ 50 ms.

import { config } from './config';
import { scriptButtons } from './core/sim/scripts';
import { VirtualRoom } from './bench/virtual-room';
import { Controls } from './ui/controls';
import { h } from './ui/dom';
import { BUILD, Game } from './ui/game';
import { arenaScreen } from './ui/screens/arena';

export interface FrameReport {
  done: boolean;
  seconds: number;
  frames: number;
  interval: { p50: number; p95: number; p99: number; max: number };
  work: { mean: number; p95: number; max: number };
  tick: { mean: number; p95: number; max: number };
  pass: boolean;
  userAgent: string;
  devicePixelRatio: number;
  arenaPx: number;
}

declare global {
  interface Window {
    roslamboFrames?: { report: () => FrameReport | null };
  }
}

const P95_MS = 18;
const MAX_MS = 50;

function quantile(sorted: number[], q: number): number {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]! : 0;
}

function summary(xs: number[]): { mean: number; p95: number; max: number } {
  const s = [...xs].sort((a, b) => a - b);
  return { mean: s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0, p95: quantile(s, 0.95), max: s.length ? s[s.length - 1]! : 0 };
}

export function run(root: HTMLElement): void {
  const q = new URLSearchParams(location.hash.slice(1));
  const seconds = Math.max(1, Number(q.get('seconds') ?? '120'));
  const players = Math.min(config.maxPlayersCap, Math.max(3, Number(q.get('players') ?? String(config.maxPlayersCap))));
  const me = (1).toString(16).padStart(32, '0');
  const game = new Game({
    roundId: 'BENCH', me, name: 'You', profile: null,
    transport: (s) => new VirtualRoom(s, { players: players - 1, seed: 7, latencyMs: [20, 80], jitterMs: 15, build: BUILD }),
  });
  game.controls = () => scriptButtons(7, 0, game.session.timeline.localTick);
  game.propose({ ante: 100_000, minPlayers: 3, maxPlayers: players });
  game.play();

  const screen = arenaScreen(game, { controls: new Controls(), leave: () => {}, finished: () => {}, failed: () => {} });
  const verdict = h('pre', { class: 'bench', 'data-test': 'bench' }, `Frame-time bench: waiting for ${players} planets…`);
  root.replaceChildren(screen.el, verdict);

  const intervals: number[] = [];
  const work: number[] = [];
  let tickFrom = -1;
  let startedAt = -1;
  let last = -1;
  let readied = false;
  let report: FrameReport | null = null;
  window.roslamboFrames = { report: () => report };

  const frame = (now: number): void => {
    const t0 = performance.now();
    screen.frame?.(now);
    const s = game.session.timeline.final;
    if (!readied && s.planets.length === players) {
      game.ready(true);
      readied = true;
      startedAt = now;
      tickFrom = game.tickCosts.length;
    }
    if (startedAt >= 0) {
      if (last >= 0) intervals.push(now - last);
      work.push(performance.now() - t0);
    }
    last = now;
    if (startedAt >= 0 && now - startedAt >= seconds * 1000) {
      finish();
      return;
    }
    requestAnimationFrame(frame);
  };

  function finish(): void {
    const sorted = [...intervals].sort((a, b) => a - b);
    const interval = { p50: quantile(sorted, 0.5), p95: quantile(sorted, 0.95), p99: quantile(sorted, 0.99), max: sorted[sorted.length - 1] ?? 0 };
    report = {
      done: true, seconds, frames: intervals.length, interval, work: summary(work), tick: summary(game.tickCosts.slice(tickFrom)),
      pass: interval.p95 <= P95_MS && interval.max <= MAX_MS,
      userAgent: navigator.userAgent, devicePixelRatio, arenaPx: screen.el.querySelector('canvas')?.clientWidth ?? 0,
    };
    game.close();
    const f = (x: number): string => x.toFixed(1);
    verdict.textContent = [
      `Frame-time bench: ${report.pass ? 'PASS' : 'FAIL'} (p95 ≤ ${P95_MS} ms and max ≤ ${MAX_MS} ms)`,
      `${report.frames} frames in ${seconds} s with ${players} planets`,
      `frame interval  p50 ${f(interval.p50)}  p95 ${f(interval.p95)}  p99 ${f(interval.p99)}  max ${f(interval.max)} ms`,
      `frame work      mean ${f(report.work.mean)}  p95 ${f(report.work.p95)}  max ${f(report.work.max)} ms`,
      `tick            mean ${f(report.tick.mean)}  p95 ${f(report.tick.p95)}  max ${f(report.tick.max)} ms`,
      `${navigator.userAgent}  dpr ${devicePixelRatio}  arena ${report.arenaPx} px`,
    ].join('\n');
  }
  requestAnimationFrame(frame);
}
