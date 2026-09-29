import { DT } from './constants';

export interface LoopHooks {
  /** Un tick de simulation (DT fixe). */
  step(): void;
  /** Rendu interpolé : alpha ∈ [0, 1[ entre l'avant-dernier et le dernier tick. */
  render(alpha: number, frameDt: number): void;
}

export interface LoopClock {
  now(): number;
  request(cb: (t: number) => void): number;
  cancel(id: number): void;
}

const browserClock: LoopClock = {
  now: () => performance.now(),
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => {
    cancelAnimationFrame(id);
  },
};

/**
 * Boucle à tick fixe découplée du rendu : accumulateur, plafond anti-spirale, rendu
 * interpolé, hit stop (ticks gelés, le rendu continue), accélération (debug) et plafond
 * d'images (30/60 fps).
 */
export class FixedLoop {
  timeScale = 1;
  paused = false;
  fpsCap: 30 | 60 = 60;
  /** Nombre maximal de ticks par frame (×timeScale), au-delà le retard est abandonné. */
  maxSteps = 4;
  /** Statistiques de la dernière frame (debug, bench). */
  readonly stats = { steps: 0, simMs: 0, renderMs: 0, frameMs: 0 };

  private acc = 0;
  private last = -1;
  private lastRender = -1;
  private hitStop = 0;
  private raf = 0;
  private running = false;
  private readonly onFrame = (t: number): void => {
    this.frame(t);
  };

  constructor(
    private readonly hooks: LoopHooks,
    private readonly clock: LoopClock = browserClock,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = -1;
    this.raf = this.clock.request(this.onFrame);
  }

  stop(): void {
    this.running = false;
    this.clock.cancel(this.raf);
  }

  /** Gèle la simulation pendant `ticks` ticks (le temps de rendu continue). */
  hitStopFor(ticks: number): void {
    if (ticks > this.hitStop) this.hitStop = ticks;
  }

  /** Une frame (appelée par requestAnimationFrame ou par un test). */
  frame(t: number): void {
    if (this.running) this.raf = this.clock.request(this.onFrame);
    if (this.fpsCap === 30 && this.lastRender >= 0 && t - this.lastRender < 1000 / 30 - 3) return;
    const frameDt = this.last < 0 ? DT : Math.min(0.25, (t - this.last) / 1000);
    this.last = t;
    this.lastRender = t;

    const t0 = this.clock.now();
    let steps = 0;
    if (!this.paused) {
      this.acc += frameDt * this.timeScale;
      const max = this.maxSteps * Math.max(1, Math.ceil(this.timeScale));
      while (this.acc >= DT && steps < max) {
        if (this.hitStop > 0) this.hitStop--;
        else this.hooks.step();
        this.acc -= DT;
        steps++;
      }
      if (steps >= max) this.acc = 0; // retard abandonné plutôt que spirale
    }
    const t1 = this.clock.now();
    this.hooks.render(this.paused ? 1 : this.acc / DT, frameDt);
    const t2 = this.clock.now();
    this.stats.steps = steps;
    this.stats.simMs = t1 - t0;
    this.stats.renderMs = t2 - t1;
    this.stats.frameMs = frameDt * 1000;
  }
}
