// The arena on one canvas (D-21, PLAN §12), as the owner chose on
// 2026-10-26 from research/appearance/: planets as shaded spheres with
// their numbers and a pip showing which way they face; a flame behind
// each thrusting planet; your planet, quarry and hunter marked in colour
// and by shape (a white ring, an amber ring in four arcs, a red dashed
// ring), so the marks don't rely on colour; and, if this player chooses,
// names under the planets. The walls are the canvas edge, drawn by CSS.

import type { DrawnPlanet } from './interpolate';
import { ARENA, FLAME, HUNTER, INK, LABEL, LABEL_OUTLINE, MARK, QUARRY, RING_GUIDE, SHADE, planetColour } from './palette';

export interface ArenaView {
  me: number; // index of this browser's planet, or −1
  ring: boolean; // draw the pre-start ring's guide
  ringRadius: number; // arena sides
  r: number; // planet radius, arena sides
  cx: number;
  cy: number;
  thrust: boolean[]; // by planet index: draw its flame
  labels: readonly string[] | null; // by planet index: names under the planets, or none
  now: number; // ms, for the flames' flicker
}

const PIP = 0.7; // the pip's centre, in radii from the planet's
const PIP_R = 0.16;
const MARK_R = 1.34; // the marks' radius, in radii
const LABEL_GAP = 1.42; // from the planet's centre to its name, in radii: clear of the marks
const FONT = 'system-ui, sans-serif';

export class ArenaRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private size = 0;
  private cssSize = 0;
  private readonly observer: ResizeObserver;
  // Gradients in a planet's own coordinates, made once per planet size.
  private gradientR = 0;
  private shade: CanvasGradient | null = null;
  private flameFill: CanvasGradient | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.observer = new ResizeObserver(() => { this.cssSize = canvas.clientWidth; });
    this.observer.observe(canvas);
    this.cssSize = canvas.clientWidth;
  }

  dispose(): void {
    this.observer.disconnect();
  }

  draw(planets: readonly DrawnPlanet[], view: ArenaView): void {
    const size = Math.round(this.cssSize * Math.min(devicePixelRatio || 1, 2));
    if (size !== this.size && size > 0) {
      this.size = size;
      this.canvas.width = this.canvas.height = size;
    }
    const s = this.size;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = ARENA;
    ctx.fillRect(0, 0, s, s);
    if (s === 0) return;
    const r = view.r * s;
    const line = Math.max(1.5, r * 0.14);
    if (r !== this.gradientR) this.gradients(r);

    if (view.ring) {
      ctx.strokeStyle = RING_GUIDE;
      ctx.lineWidth = line;
      ctx.beginPath();
      ctx.arc(view.cx * s, (1 - view.cy) * s, view.ringRadius * s, 0, 2 * Math.PI);
      ctx.stroke();
    }

    const n = planets.length;
    const t = view.now / 1000;
    for (let i = 0; i < n; i++) if (view.thrust[i]) this.flame(planets[i]!, i, r, s, t);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(r * 1.15)}px ${FONT}`;
    for (let i = 0; i < n; i++) this.planet(planets[i]!, i, r, s);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.marks(planets, view.me, r, s, line);
    if (view.labels) this.labels(planets, view.labels, r, s);
  }

  private gradients(r: number): void {
    const ctx = this.ctx;
    this.gradientR = r;
    this.shade = ctx.createRadialGradient(-0.38 * r, -0.42 * r, 0.05 * r, 0, 0, 1.08 * r);
    this.shade.addColorStop(0, SHADE[0]);
    this.shade.addColorStop(0.45, SHADE[1]);
    this.shade.addColorStop(1, SHADE[2]);
    this.flameFill = ctx.createLinearGradient(-0.85 * r, 0, -1.95 * r, 0);
    this.flameFill.addColorStop(0, FLAME[0]);
    this.flameFill.addColorStop(0.45, FLAME[1]);
    this.flameFill.addColorStop(1, FLAME[2]);
  }

  /** A shaded sphere, its pip and its number, drawn about its centre. */
  private planet(p: DrawnPlanet, i: number, r: number, s: number): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, p.x * s, (1 - p.y) * s);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, 2 * Math.PI);
    ctx.fillStyle = planetColour(i + 1);
    ctx.fill();
    ctx.fillStyle = this.shade!;
    ctx.fill();
    // Canvas angles run clockwise (y down): the facing is −θ.
    ctx.beginPath();
    ctx.arc(Math.cos(p.theta) * PIP * r, -Math.sin(p.theta) * PIP * r, PIP_R * r, 0, 2 * Math.PI);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.fillText(String(i + 1), 0, r * 0.06);
  }

  /** Behind the planet, in coordinates where +x is its facing. */
  private flame(p: DrawnPlanet, i: number, r: number, s: number, t: number): void {
    const ctx = this.ctx;
    const c = Math.cos(p.theta), sn = -Math.sin(p.theta);
    ctx.setTransform(c, sn, -sn, c, p.x * s, (1 - p.y) * s);
    const flicker = 0.85 + 0.15 * Math.sin(t * 41 + i * 2.1) + 0.08 * Math.sin(t * 23 + i);
    const tip = -(1.55 + 0.4 * flicker) * r, w = 0.46 * r;
    ctx.beginPath();
    ctx.moveTo(-0.85 * r, w);
    ctx.quadraticCurveTo(tip, 0.2 * w, tip, 0);
    ctx.quadraticCurveTo(tip, -0.2 * w, -0.85 * r, -w);
    ctx.closePath();
    ctx.fillStyle = this.flameFill!;
    ctx.fill();
  }

  private marks(planets: readonly DrawnPlanet[], me: number, r: number, s: number, line: number): void {
    const n = planets.length;
    if (me < 0 || me >= n) return;
    const ctx = this.ctx;
    ctx.lineWidth = line;
    ctx.strokeStyle = MARK;
    this.ring(planets[me]!, MARK_R * r, s);
    if (n < 2) return;
    const q = planets[(me + 1) % n]!;
    const qx = q.x * s, qy = (1 - q.y) * s;
    ctx.strokeStyle = QUARRY;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = 0; k < 4; k++) { // four arcs, broken at the compass points
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      ctx.moveTo(qx + Math.cos(a - 0.5) * MARK_R * r, qy + Math.sin(a - 0.5) * MARK_R * r);
      ctx.arc(qx, qy, MARK_R * r, a - 0.5, a + 0.5);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
    if (n < 3) return; // with two planets the quarry is also the hunter
    ctx.strokeStyle = HUNTER;
    ctx.setLineDash([r * 0.3, r * 0.25]);
    this.ring(planets[(me + n - 1) % n]!, MARK_R * r, s);
    ctx.setLineDash([]);
  }

  /** Under each planet, or over it near the bottom wall. */
  private labels(planets: readonly DrawnPlanet[], labels: readonly string[], r: number, s: number): void {
    const ctx = this.ctx;
    const px = Math.max(9, Math.round(r * 0.85));
    ctx.font = `600 ${px}px ${FONT}`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, r * 0.24);
    ctx.strokeStyle = LABEL_OUTLINE;
    ctx.fillStyle = LABEL;
    for (let i = 0; i < planets.length; i++) {
      const name = labels[i];
      if (!name) continue;
      const p = planets[i]!;
      const x = p.x * s, y = (1 - p.y) * s;
      const below = y + LABEL_GAP * r + px <= s;
      ctx.textBaseline = below ? 'top' : 'bottom';
      const ly = below ? y + LABEL_GAP * r : y - LABEL_GAP * r;
      ctx.strokeText(name, x, ly);
      ctx.fillText(name, x, ly);
    }
  }

  private ring(p: DrawnPlanet, radius: number, s: number): void {
    this.ctx.beginPath();
    this.ctx.arc(p.x * s, (1 - p.y) * s, radius, 0, 2 * Math.PI);
    this.ctx.stroke();
  }
}
