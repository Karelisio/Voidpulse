/** Crayon néon partagé par l'atlas et les icônes (tracés Canvas2D avec halo pré-calculé). */
import { css, mix } from './palette';

export type Ctx = CanvasRenderingContext2D;

/** Crayon néon : en mode « blanc », toutes les couleurs deviennent blanches (flash de coup). */
export class Pen {
  constructor(
    readonly ctx: Ctx,
    readonly white: boolean,
  ) {}

  col(color: number, alpha = 1): string {
    return this.white ? `rgba(255,255,255,${Math.min(1, alpha * 1.6)})` : css(color, alpha);
  }

  /** Trait néon : halo coloré + cœur clair. */
  stroke(color: number, width: number, glow: number, path: (c: Ctx) => void): void {
    const c = this.ctx;
    c.save();
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.shadowColor = this.col(color);
    c.shadowBlur = glow;
    c.strokeStyle = this.col(color);
    c.lineWidth = width;
    c.beginPath();
    path(c);
    c.stroke();
    c.shadowBlur = 0;
    c.strokeStyle = this.col(mix(color, 0xffffff, 0.55));
    c.lineWidth = width * 0.4;
    c.beginPath();
    path(c);
    c.stroke();
    c.restore();
  }

  fill(color: number, alpha: number, path: (c: Ctx) => void, glow = 0): void {
    const c = this.ctx;
    c.save();
    if (glow > 0) {
      c.shadowColor = this.col(color);
      c.shadowBlur = glow;
    }
    // Flash : remplissage éclairci mais translucide (le contour blanc porte le flash).
    c.fillStyle = this.col(color, this.white ? Math.min(0.75, alpha * 1.8) : alpha);
    c.beginPath();
    path(c);
    c.fill();
    c.restore();
  }

  radial(color: number, r: number, inner: number, outer: number): void {
    const c = this.ctx;
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, this.col(color, inner));
    g.addColorStop(1, this.col(color, outer));
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
  }
}

export const poly = (c: Ctx, n: number, r: number, rot = 0): void => {
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath();
};

export const circle = (c: Ctx, r: number, x = 0, y = 0): void => {
  c.moveTo(x + r, y);
  c.arc(x, y, r, 0, Math.PI * 2);
};
