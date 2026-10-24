// The spike page. ?mode=golden runs M0 run 1; otherwise it joins a room
// and plays scripted inputs. Results are exposed as window.spike.
//
// Mesh parameters: room, relay ('public' or a ws:// URL), n, me (-1 for a
// spectator), genesis=1 on the first peer, d, w, v, corrupt=<tick>,
// stop=<tick>, lag=<ms>.

import { botInput } from './bots.ts';
import { goldenSuite } from './golden.ts';
import { Net, PUBLIC_RELAYS } from './net.ts';
import { DEFAULT_SIM, type State } from './sim.ts';
import { Timeline, type TimelineConfig } from './timeline.ts';

declare global {
  interface Window {
    spike: Record<string, unknown>;
  }
}

const q = new URLSearchParams(location.search);
const num = (k: string, d: number): number => (q.has(k) ? Number(q.get(k)) : d);
const status = document.getElementById('status')!;
window.spike = { ua: navigator.userAgent };

if (q.get('mode') === 'golden') {
  status.textContent = 'running golden suite…';
  setTimeout(() => {
    const t0 = performance.now();
    const runs = goldenSuite();
    window.spike.golden = { ms: performance.now() - t0, runs };
    status.textContent = `golden done in ${Math.round(performance.now() - t0)} ms`;
  }, 0);
} else {
  mesh();
}

function mesh(): void {
  const n = num('n', 3);
  const me = num('me', 0);
  const cfg: TimelineConfig = {
    sim: { ...DEFAULT_SIM, n },
    me,
    delay: num('d', 2),
    window: num('w', 12),
    voteWindow: num('v', 12),
    inputSource: me >= 0 ? (t) => botInput(me + 1, t) : undefined,
  };
  if (q.has('corrupt')) cfg.corruptAt = num('corrupt', 0);
  if (q.has('stop')) cfg.stopSendingAt = num('stop', 0);
  const relay = q.get('relay') ?? 'public';
  const key = JSON.stringify({ sim: cfg.sim, d: cfg.delay, w: cfg.window, v: cfg.voteWindow });
  const net = new Net({
    roomId: q.get('room') ?? 'roslambo-spike-default',
    relays: relay === 'public' ? PUBLIC_RELAYS : [relay],
    local: relay !== 'public',
    hello: { v: 1, key, me },
    lagMs: num('lag', 0),
  });
  const tl = new Timeline(cfg, {
    broadcast: (b) => net.broadcast(b),
    sendTo: (p, b) => net.send(p, b),
  });
  const pageStart = performance.now();
  let firstPeerMs = -1;
  let startedMs = -1;
  net.onMessage = (from, bytes) => tl.receive(from, bytes, performance.now());
  net.onPeerJoin = (peer, hello) => {
    if (firstPeerMs < 0) firstPeerMs = performance.now() - pageStart;
    tl.setPeer(peer, hello.me >= 0 ? hello.me : null);
  };
  net.onRtt = (peer, ms) => tl.setOneWay(peer, ms / 2);
  if (q.get('genesis') === '1') {
    tl.start(performance.now());
    startedMs = 0;
  }
  // A joiner asks each connected peer in turn until one answers with a state.
  let ask = 0;
  setInterval(() => {
    if (tl.started) return;
    const peers = net.peers();
    if (peers.length > 0) tl.requestJoin(peers[ask++ % peers.length]!);
  }, 1000);

  const cpu: number[] = [];
  setInterval(() => {
    const before = tl.localTick;
    const t0 = performance.now();
    tl.advance(t0);
    if (tl.started && startedMs < 0) startedMs = t0 - pageStart;
    if (tl.localTick !== before && cpu.length < 50_000) cpu.push(performance.now() - t0);
  }, 4);

  const canvas = document.getElementById('arena') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const draw = (): void => {
    if (tl.started) render(ctx, canvas, tl.prevHead, tl.head, tl.alpha(performance.now()), cfg.sim.radius, me);
    status.textContent = `me ${me} · tick ${tl.localTick} · final ${tl.finalTick} · peers ${net.peers().length} · agree ${tl.stats.agree} · disagree ${tl.stats.disagree} · resyncs ${tl.stats.resyncs}`;
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);

  window.spike.report = () => ({
    ua: navigator.userAgent,
    ...tl.report(),
    firstPeerMs,
    startedMs,
    peers: net.peers().length,
    hellos: [...net.hellos.values()].map((h) => h.me),
    net: { sent: net.sent, recv: net.recv, bytesOut: net.bytesOut, bytesIn: net.bytesIn, floodErrors: net.floodErrors },
    relays: net.relayHealth(),
    cpu: summary(cpu),
    // usedJSHeapSize exists in Chromium only.
    heap: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
  });
  window.spike.flood = (count: number, bytes: number) => Promise.all(net.peers().map((p) => net.flood(p, count, bytes)));
}

function summary(xs: number[]): { n: number; mean: number; p95: number; max: number } {
  if (xs.length === 0) return { n: 0, mean: 0, p95: 0, max: 0 };
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, mean: s.reduce((a, b) => a + b, 0) / s.length, p95: s[Math.floor(s.length * 0.95)]!, max: s[s.length - 1]! };
}

const COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#469990', '#9a6324', '#800000', '#000075'];

function render(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, a: State, b: State, t: number, r: number, me: number): void {
  const size = c.width;
  ctx.fillStyle = '#10131a';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < b.x.length; i++) {
    const x = (a.x[i]! + (b.x[i]! - a.x[i]!) * t) * size;
    const y = (1 - (a.y[i]! + (b.y[i]! - a.y[i]!) * t)) * size;
    ctx.fillStyle = COLORS[i % COLORS.length]!;
    ctx.beginPath();
    ctx.arc(x, y, r * size, 0, Math.PI * 2);
    ctx.fill();
    const th = (b.angle[i]! / 4294967296) * Math.PI * 2;
    ctx.strokeStyle = i === me ? '#fff' : '#0008';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(th) * r * size, y - Math.sin(th) * r * size);
    ctx.stroke();
  }
}
