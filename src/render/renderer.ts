// The arena on one canvas (D-21, PLAN §12): planets with their numbers and
// a nose showing which way they face; your planet, quarry and hunter
// marked by shape (solid ring, target ticks, dashed ring), so the marks
// don't depend on colour. The walls are the canvas edge, drawn by CSS.

import type { DrawnPlanet } from './interpolate';
import { ARENA, INK, MARK, planetColour, RING_GUIDE } from './palette';

export interface ArenaView {
  me: number; // index of this browser's planet, or −1
  ring: boolean; // draw the pre-start ring's guide
  ringRadius: number; // arena sides
  r: number; // planet radius, arena sides
  cx: number;
  cy: number;
}

const NOSE = 1.6; // tip distance, in radii
const NOSE_HALF_WIDTH = 0.55; // radians either side of the facing

export class ArenaRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private size = 0;
  private cssSize = 0;
  private readonly observer: ResizeObserver;

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
    ctx.fillStyle = ARENA;
    ctx.fillRect(0, 0, s, s);
    if (s === 0) return;
    const r = view.r * s;
    const line = Math.max(1.5, r * 0.14);

    if (view.ring) {
      ctx.strokeStyle = RING_GUIDE;
      ctx.lineWidth = line;
      ctx.beginPath();
      ctx.arc(view.cx * s, (1 - view.cy) * s, view.ringRadius * s, 0, 2 * Math.PI);
      ctx.stroke();
    }

    const n = planets.length;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(r * 1.15)}px system-ui, sans-serif`;
    for (let i = 0; i < n; i++) {
      const p = planets[i]!;
      const x = p.x * s;
      const y = (1 - p.y) * s;
      const c = Math.cos(p.theta);
      const sn = Math.sin(p.theta);
      ctx.fillStyle = planetColour(i + 1);
      ctx.beginPath();
      ctx.moveTo(x + c * NOSE * r, y - sn * NOSE * r);
      // Canvas angles run clockwise (y down): the facing is −θ. From the
      // tip, round the back of the planet from one side of the nose to the other.
      ctx.arc(x, y, r, -p.theta + NOSE_HALF_WIDTH, -p.theta - NOSE_HALF_WIDTH + 2 * Math.PI, false);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.fillText(String(i + 1), x, y + r * 0.06);
    }

    if (view.me < 0 || view.me >= n) return;
    ctx.strokeStyle = MARK;
    ctx.lineWidth = line;
    this.ring(planets[view.me]!, 1.9 * r, s);
    if (n < 2) return;
    const quarry = planets[(view.me + 1) % n]!;
    this.ring(quarry, 2.0 * r, s);
    const qx = quarry.x * s;
    const qy = (1 - quarry.y) * s;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      ctx.moveTo(qx + Math.cos(a) * 2.0 * r, qy + Math.sin(a) * 2.0 * r);
      ctx.lineTo(qx + Math.cos(a) * 2.7 * r, qy + Math.sin(a) * 2.7 * r);
    }
    ctx.stroke();
    if (n < 3) return; // with two planets the quarry is also the hunter
    ctx.setLineDash([r * 0.5, r * 0.4]);
    this.ring(planets[(view.me + n - 1) % n]!, 2.0 * r, s);
    ctx.setLineDash([]);
  }

  private ring(p: DrawnPlanet, radius: number, s: number): void {
    this.ctx.beginPath();
    this.ctx.arc(p.x * s, (1 - p.y) * s, radius, 0, 2 * Math.PI);
    this.ctx.stroke();
  }
}
