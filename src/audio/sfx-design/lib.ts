/**
 * Petite grammaire de design sonore (Tone.js, rendu hors ligne uniquement) : oscillateurs et
 * bruits enveloppés avec balayage de hauteur / de filtre, FM, effets. Chaque son de
 * `sounds.ts` est une fonction `build` qui programme ces primitives à partir de t = 0.
 */
import * as Tone from 'tone';
import type { Rng } from '../../engine/rng';

export type Bus = 'sfx' | 'ui' | 'ambience';

export interface SfxCtx {
  /** Entrée de la chaîne de sortie du son. */
  out: Tone.ToneAudioNode;
  rng: Rng;
  /** Index de la variante (0…variants-1). */
  v: number;
}

export interface SfxDesign {
  /** Durée rendue (s), queue comprise ; le silence final est rogné. */
  duration: number;
  variants: number;
  stereo?: boolean;
  bus?: Bus;
  /** Niveau relatif dans le mix (dB, appliqué au jeu). */
  gainDb: number;
  pitchVar?: number;
  volVar?: number;
  maxVoices?: number;
  priority?: number;
  cooldownMs?: number;
  build(c: SfxCtx): void | Promise<void>;
}

type Dest = Tone.InputNode;

export interface Shape {
  /** Départ (s). */
  t?: number;
  /** Durée jusqu'au silence (s). */
  dur: number;
  /** Attaque (s). */
  a?: number;
  /** Maintien au sommet avant la décroissance (s). */
  hold?: number;
  gain?: number;
  /** Décroissance linéaire plutôt qu'exponentielle. */
  linear?: boolean;
  pan?: number;
  to?: Dest;
}

function envelope(c: SfxCtx, s: Shape): Tone.Gain {
  const t = s.t ?? 0;
  const a = Math.max(0.001, s.a ?? 0.003);
  const peak = s.gain ?? 1;
  const g = new Tone.Gain(0);
  const p = g.gain;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  const h = t + a + (s.hold ?? 0);
  p.setValueAtTime(peak, h);
  if (s.linear) p.linearRampToValueAtTime(0, t + s.dur);
  else {
    p.exponentialRampToValueAtTime(Math.max(1e-4, peak * 1e-4), t + s.dur);
    p.setValueAtTime(0, t + s.dur + 0.001);
  }
  const dest = s.to ?? c.out;
  if (s.pan !== undefined && s.pan !== 0) {
    const pan = new Tone.Panner(s.pan);
    g.connect(pan);
    pan.connect(dest);
  } else g.connect(dest);
  return g;
}

export interface OscShape extends Shape {
  type?: 'sine' | 'square' | 'sawtooth' | 'triangle';
  f0: number;
  /** Fréquence finale du balayage. */
  f1?: number;
  /** Durée du balayage (défaut : dur). */
  sweep?: number;
  detune?: number;
  /** Vibrato : [vitesse Hz, profondeur en demi-tons]. */
  vibrato?: [number, number];
}

export function osc(c: SfxCtx, s: OscShape): void {
  const t = s.t ?? 0;
  const o = new Tone.Oscillator({ type: s.type ?? 'sine', frequency: s.f0, detune: s.detune ?? 0 });
  const g = envelope(c, s);
  o.connect(g);
  if (s.f1 !== undefined) {
    o.frequency.setValueAtTime(s.f0, t);
    o.frequency.exponentialRampToValueAtTime(s.f1, t + (s.sweep ?? s.dur));
  }
  if (s.vibrato) {
    const lfo = new Tone.LFO(s.vibrato[0], -s.vibrato[1] * 100, s.vibrato[1] * 100);
    lfo.connect(o.detune);
    lfo.start(t);
    lfo.stop(t + s.dur + 0.02);
  }
  o.start(t);
  o.stop(t + s.dur + 0.02);
}

export interface FmShape extends OscShape {
  harmonicity: number;
  index: number;
  /** Indice final (balayage du timbre). */
  index1?: number;
}

export function fm(c: SfxCtx, s: FmShape): void {
  const t = s.t ?? 0;
  const o = new Tone.FMOscillator({
    frequency: s.f0,
    type: s.type ?? 'sine',
    modulationType: 'sine',
    harmonicity: s.harmonicity,
    modulationIndex: s.index,
  });
  const g = envelope(c, s);
  o.connect(g);
  if (s.f1 !== undefined) {
    o.frequency.setValueAtTime(s.f0, t);
    o.frequency.exponentialRampToValueAtTime(s.f1, t + (s.sweep ?? s.dur));
  }
  if (s.index1 !== undefined) {
    o.modulationIndex.setValueAtTime(s.index, t);
    o.modulationIndex.linearRampToValueAtTime(s.index1, t + s.dur);
  }
  o.start(t);
  o.stop(t + s.dur + 0.02);
}

export interface NoiseShape extends Shape {
  color?: 'white' | 'pink' | 'brown';
  filter?: BiquadFilterType;
  /** Fréquence du filtre au départ / à la fin. */
  q0?: number;
  q1?: number;
  Q?: number;
  sweep?: number;
}

export function noise(c: SfxCtx, s: NoiseShape): void {
  const t = s.t ?? 0;
  const n = new Tone.Noise(s.color ?? 'white');
  const g = envelope(c, s);
  if (s.filter) {
    const f = new Tone.Filter({
      type: s.filter,
      frequency: s.q0 ?? 1000,
      Q: s.Q ?? 1,
      rolloff: -24,
    });
    if (s.q1 !== undefined) {
      f.frequency.setValueAtTime(s.q0 ?? 1000, t);
      f.frequency.exponentialRampToValueAtTime(s.q1, t + (s.sweep ?? s.dur));
    }
    n.connect(f);
    f.connect(g);
  } else n.connect(g);
  n.start(t);
  n.stop(t + s.dur + 0.02);
}

/** Série de clics secs (crépitement électrique, glace qui craque). */
export function crackle(
  c: SfxCtx,
  s: { t?: number; dur: number; count: number; freq: number; gain?: number; to?: Dest },
): void {
  const t0 = s.t ?? 0;
  for (let i = 0; i < s.count; i++) {
    const t = t0 + c.rng.range(0, s.dur);
    noise(c, {
      t,
      dur: c.rng.range(0.004, 0.018),
      a: 0.0005,
      gain: (s.gain ?? 0.5) * c.rng.range(0.4, 1),
      filter: 'bandpass',
      q0: s.freq * c.rng.range(0.6, 1.6),
      Q: 2,
      to: s.to,
    });
  }
}

/** Réverbération (sortie vers c.out) ; renvoie son entrée. */
export async function reverb(
  c: SfxCtx,
  decay: number,
  wet: number,
  preDelay = 0.01,
): Promise<Tone.ToneAudioNode> {
  const r = new Tone.Reverb({ decay, preDelay, wet });
  await r.ready;
  r.connect(c.out);
  return r;
}

/** Distorsion (sortie vers `to`) ; renvoie son entrée. */
export function drive(amount: number, to: Dest): Tone.ToneAudioNode {
  const d = new Tone.Distortion({ distortion: amount, oversample: '2x' });
  d.connect(to);
  return d;
}

/** Écho (sortie vers `to`) ; renvoie son entrée. */
export function echo(time: number, feedback: number, wet: number, to: Dest): Tone.ToneAudioNode {
  const d = new Tone.FeedbackDelay({ delayTime: time, feedback, wet });
  d.connect(to);
  return d;
}

/** Filtre (sortie vers `to`) ; renvoie son entrée. */
export function lowpass(freq: number, to: Dest, q = 0.7): Tone.Filter {
  const f = new Tone.Filter({ type: 'lowpass', frequency: freq, Q: q });
  f.connect(to);
  return f;
}

/** Hauteur d'une note MIDI. */
export const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);

/** Variation déterministe ±amount autour de 1 selon la variante. */
export function vary(c: SfxCtx, amount: number): number {
  return 1 + c.rng.range(-amount, amount);
}
