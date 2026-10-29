// The M2 tuning page (PLAN §15): the real simulation with every Q-12
// setting on a slider. Dev-only: served by `npm run dev`, never built.

import { DEFAULT_SETTINGS, makeParams, type SimParams, type SimSettings } from '../src/core/sim/params';
import { JOIN, LEFT, READY, RIGHT, step, THRUST, type PlayerInput } from '../src/core/sim/rules';
import { COUNTDOWN, FROZEN, genesis, hunterOf, PRESTART, quarryOf, RUNNING, type RoundState } from '../src/core/sim/state';
import { steer } from '../src/core/bot/steer';

type Key = keyof SimSettings;
const SLIDERS: [Key, string, number, number, number][] = [
  ['planetRadius', 'Planet radius', 0.01, 0.08, 0.005],
  ['ringRadius', 'Ring radius', 0.1, 0.47, 0.01],
  ['ringPeriod3Seconds', '3-planet ring period (s), sets Gm', 3, 30, 0.5],
  ['softening', 'Gravity softening ε', 0, 0.4, 0.01],
  ['thrust', 'Thrust (sides/s²)', 0.2, 4, 0.1],
  ['wallEnergyLoss', 'Wall energy loss', 0, 0.8, 0.05],
  ['correctionFactor', 'Correction factor', 0, 4, 0.1],
  ['rearmGapDiameters', 'Re-arm gap (planet diameters)', 0, 3, 0.25],
  ['countdownSeconds', 'Countdown (s)', 1, 10, 1],
];

const settings: SimSettings = { ...DEFAULT_SETTINGS };
let players = 5;
let ante = 10;
let P: SimParams = makeParams(settings);
let s: RoundState = genesis({ ante, minPlayers: 3, maxPlayers: 12 });
let pendingEvents = 0;
let botPlanet1 = false;
let paused = false;
const held = { thrust: false, left: false, right: false };
const id = (k: number): string => (k + 1).toString(16).padStart(32, '0');

const controls = document.getElementById('controls')!;
function slider(label: string, min: number, max: number, stepBy: number, get: () => number, set: (v: number) => void): void {
  const el = document.createElement('label');
  el.innerHTML = `<span>${label}</span><output></output><input type="range" min="${min}" max="${max}" step="${stepBy}">`;
  const input = el.querySelector('input')!;
  const out = el.querySelector('output')!;
  input.value = String(get());
  out.textContent = input.value;
  input.addEventListener('input', () => {
    set(Number(input.value));
    out.textContent = input.value;
    restart();
  });
  controls.append(el);
}
slider('Planets', 1, 12, 1, () => players, (v) => { players = v; });
slider('Ante', 1, 30, 1, () => ante, (v) => { ante = v; });
for (const [key, label, min, max, by] of SLIDERS) slider(label, min, max, by, () => settings[key], (v) => { settings[key] = v; });

function restart(): void {
  P = makeParams({ ...settings });
  s = genesis({ ante, minPlayers: 3, maxPlayers: 12 });
  pendingEvents = JOIN;
}
document.getElementById('ring')!.addEventListener('click', restart);
document.getElementById('start')!.addEventListener('click', () => { pendingEvents |= READY; });
const botButton = document.getElementById('bot')!;
botButton.addEventListener('click', () => {
  botPlanet1 = !botPlanet1;
  botButton.textContent = botPlanet1 ? 'Planet 1: bot' : 'Planet 1: keyboard';
});
const pauseButton = document.getElementById('pause')!;
pauseButton.addEventListener('click', () => {
  paused = !paused;
  pauseButton.textContent = paused ? 'Resume' : 'Pause';
});
const KEYS: Record<string, keyof typeof held> = { KeyW: 'thrust', KeyA: 'left', KeyD: 'right' };
addEventListener('keydown', (e) => { const k = KEYS[e.code]; if (k) held[k] = true; });
addEventListener('keyup', (e) => { const k = KEYS[e.code]; if (k) held[k] = false; });
addEventListener('blur', () => { held.thrust = held.left = held.right = false; });

// Metrics over the last second.
let episodes = 0;
let maxSpeed = 0;
const recent: number[] = [];

function tick(): void {
  const inputs: PlayerInput[] = [];
  for (let k = 0; k < players; k++) {
    const i = s.planets.findIndex((p) => p.id === id(k));
    let buttons = 0;
    if (k === 0 && !botPlanet1) {
      buttons = (held.thrust ? THRUST : 0) | (held.left ? LEFT : 0) | (held.right ? RIGHT : 0);
    } else if (i >= 0) {
      buttons = steer(s, i, P);
    }
    inputs.push({ id: id(k), buttons, events: pendingEvents, name: `P${k + 1}` });
  }
  pendingEvents = 0;
  const before = s.planets.map((p) => p.engaged);
  step(s, inputs, P);
  const gained = s.planets.filter((p, i) => p.engaged === 1 && before[i] === 0).length;
  episodes += gained;
  recent.push(gained);
  if (recent.length > 60) episodes -= recent.shift()!;
  for (const p of s.planets) maxSpeed = Math.max(maxSpeed, Math.hypot(p.vx, p.vy));
}

const COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#469990', '#dcbeff', '#9a6324', '#fffac8'];
const canvas = document.getElementById('arena') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hud = document.getElementById('hud')!;

function draw(): void {
  const size = canvas.clientWidth * Math.min(devicePixelRatio, 2);
  if (canvas.width !== size) canvas.width = canvas.height = size;
  ctx.clearRect(0, 0, size, size);
  const X = (x: number): number => x * size;
  const Y = (y: number): number => (1 - y) * size;
  const n = s.planets.length;
  if (s.phase !== RUNNING) {
    ctx.strokeStyle = '#2a3040';
    ctx.beginPath();
    ctx.arc(X(P.cx), Y(P.cy), P.ringRadius * size, 0, 2 * Math.PI);
    ctx.stroke();
  }
  const mine = s.planets.findIndex((p) => p.id === id(0));
  s.planets.forEach((p, i) => {
    const x = X(p.x);
    const y = Y(p.y);
    const r = P.r * size;
    ctx.fillStyle = COLORS[i % COLORS.length]!;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fill();
    if (mine >= 0 && n >= 2) {
      const role = i === mine ? '#ffffff' : i === quarryOf(mine, n) ? '#7CFC00' : i === hunterOf(mine, n) && n >= 3 ? '#ff4040' : '';
      if (role) {
        ctx.strokeStyle = role;
        ctx.lineWidth = Math.max(2, r / 5);
        ctx.beginPath();
        ctx.arc(x, y, r * 1.35, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }
    const th = (p.angle / 4294967296) * 2 * Math.PI;
    ctx.strokeStyle = '#000a';
    ctx.lineWidth = Math.max(2, r / 4);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(th) * r, y - Math.sin(th) * r);
    ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.font = `bold ${Math.round(r)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), x, y);
  });
  const phase = ['pre-start', 'countdown', 'running', 'frozen'][s.phase];
  const countdown = s.phase === COUNTDOWN ? `  ${Math.ceil((s.countdownStart + P.countdownTicks - s.tick) / 60)} s` : '';
  hud.textContent = [
    `${phase}${countdown}   tick ${s.tick}${s.phase === FROZEN ? '   (the round froze)' : ''}`,
    `points  ${s.planets.map((p, i) => `${i + 1}:${p.points}`).join('  ')}`,
    `episodes/s ${episodes}   top speed ${maxSpeed.toFixed(2)}   Gm ${P.gm.toFixed(4)}   8-ring ${(P.ringOmega(8) / 2 / Math.PI).toFixed(3)} turn/s`,
    `touching orbit ${(P.contactOrbitOmega / 2 / Math.PI).toFixed(3)} turn/s against a maximum rotation of ${P.settings.maxRotationTurnsPerSecond} turn/s${P.contactOrbitOmega / 2 / Math.PI > P.settings.maxRotationTurnsPerSecond ? '  (TOO SLOW: breaks the requirement)' : ''}`,
    s.phase === PRESTART ? 'Press “Everyone ready” to start the countdown.' : '',
  ].join('\n');
}

// Fixed 60 Hz simulation, drawn on animation frames.
let last = performance.now();
let acc = 0;
function frame(now: number): void {
  acc += Math.min(250, now - last);
  last = now;
  while (acc >= 1000 / 60) {
    if (!paused) tick();
    acc -= 1000 / 60;
  }
  draw();
  requestAnimationFrame(frame);
}
restart();
requestAnimationFrame(frame);
