// The production bundle's networking check (PLAN §14): opened as
// #test=net&… by e2e/round.spec.ts, it plays a scripted round over the
// real Trystero transport and exposes what happened. Parameters:
//   room, relay (a ws:// URL), k (player number), role (keeper, player or
//   spectator), ready (ms after load), ante, seed.

import { config } from './config';
import { makeParams } from './core/sim/params';
import { scriptButtons } from './core/sim/scripts';
import { buildHash } from './core/session/build';
import { Session } from './core/session/session';
import { TrysteroRoom } from './net/trystero';

declare global {
  interface Window {
    roslamboNet?: {
      report: () => Record<string, unknown>;
      hashAt: (t: number) => string;
    };
  }
}

export function run(): void {
  const q = new URLSearchParams(location.hash.slice(1));
  const k = Number(q.get('k') ?? '1');
  const role = q.get('role') ?? 'player';
  const seed = Number(q.get('seed') ?? '7');
  const me = (k + 1).toString(16).padStart(32, '0');
  const P = makeParams();
  let room: TrysteroRoom | null = null;
  const session = new Session({
    params: P, me, name: `P${k}`, build: buildHash(P.settings),
    timeline: { delay: config.inputDelayTicks, window: config.lateWindowTicks, voteWindow: config.voteWindowTicks, warmupMs: config.joinWarmupMs, settleMs: config.clockSettleMs },
    maxSpectators: config.maxSpectators, forwarding: true,
  }, {
    send: (peer, b) => room?.send(peer, b),
    broadcast: (b) => room?.broadcast(b),
  });
  session.timeline.controls = () => scriptButtons(seed, k, session.timeline.localTick);
  const relay = q.get('relay');
  room = new TrysteroRoom({ roundId: q.get('room') ?? 'roslambo-test', ...(relay ? { relays: [relay], local: true } : {}) }, session, () => performance.now());
  const start = performance.now();
  if (role === 'keeper') {
    session.propose(start, { ante: Number(q.get('ante') ?? '2'), minPlayers: 3, maxPlayers: config.maxPlayersCap }, me.slice(0, 16));
  }
  if (role === 'keeper' || role === 'player') session.play();
  const readyAt = Number(q.get('ready') ?? '-1');
  let readied = false;
  const cpu: number[] = [];
  setInterval(() => {
    const now = performance.now();
    if (!readied && readyAt >= 0 && now - start >= readyAt && session.inRoster()) {
      session.ready();
      readied = true;
    }
    const before = session.timeline.localTick;
    session.advance(now);
    if (session.timeline.localTick !== before && cpu.length < 50_000) cpu.push(performance.now() - now);
  }, 4);

  window.roslamboNet = {
    hashAt: (t) => session.timeline.hashAt(t),
    report: () => {
      const t = session.timeline;
      const s = t.final;
      const sorted = [...cpu].sort((a, b) => a - b);
      return {
        me, role, started: t.started, timeline: t.id, localTick: t.localTick, finalTick: t.finalTick,
        phase: s.phase, freezeTick: s.freezeTick, roster: s.planets.map((p) => p.id), points: s.planets.map((p) => p.points),
        peers: room?.peerCount() ?? 0, refused: session.refused, refusedBy: room?.refusedBy ?? null,
        stats: { ...t.stats, checkpoints: undefined },
        cpu: sorted.length ? { mean: sorted.reduce((a, b) => a + b, 0) / sorted.length, p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted[sorted.length - 1] } : null,
      };
    },
  };
}
