import type { Rng } from '../../../engine/rng';

/** Grille temporelle d'une piste : mesures de 16 pas (4/4), swing optionnel sur les pas impairs. */
export class Grid {
  readonly stepSec: number;
  readonly barSec: number;

  constructor(
    readonly bpm: number,
    readonly stepsPerBar = 16,
    readonly swing = 0,
  ) {
    this.stepSec = 60 / bpm / 4;
    this.barSec = this.stepSec * stepsPerBar;
  }

  /** Temps (s) du pas `step` de la mesure `bar` (les deux peuvent déborder). */
  t(bar: number, step = 0): number {
    const abs = bar * this.stepsPerBar + step;
    const whole = Math.floor(abs);
    const swung = whole % 2 === 1 ? this.swing * this.stepSec : 0;
    return abs * this.stepSec + swung;
  }

  /** Durée (s) de `steps` pas. */
  dur(steps: number): number {
    return steps * this.stepSec;
  }

  /** Durée (s) de `beats` temps (noires). */
  beats(beats: number): number {
    return (beats * 60) / this.bpm;
  }
}

/** Humanisation : léger décalage temporel (ms) et variation de vélocité (±ratio). */
export class Humanizer {
  constructor(
    private readonly rng: Rng,
    private readonly timingMs = 6,
    private readonly velRatio = 0.08,
  ) {}

  time(t: number): number {
    if (this.timingMs <= 0) return t;
    return Math.max(0, t + (this.rng.next() * 2 - 1) * (this.timingMs / 1000));
  }

  vel(v: number): number {
    const out = v * (1 + (this.rng.next() * 2 - 1) * this.velRatio);
    return Math.min(1, Math.max(0.05, out));
  }
}
