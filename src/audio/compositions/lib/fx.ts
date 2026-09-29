import * as Tone from 'tone';

/** Réverb à convolution (IR générée de façon déterministe : Math.random est seedé au rendu). */
export async function reverb(decay: number, wet: number, preDelay = 0.02): Promise<Tone.Reverb> {
  const r = new Tone.Reverb({ decay, preDelay, wet });
  await r.generate();
  return r;
}

/** Passe-haut (-12 dB/oct) : nettoie le grave des couches qui n'en ont pas besoin. */
export function hp(frequency: number): Tone.Filter {
  return new Tone.Filter({ type: 'highpass', frequency, rolloff: -12, Q: 0.5 });
}

/** Relie les nœuds en série : a → b → c… */
export function chain(...nodes: Tone.ToneAudioNode[]): void {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
}

/**
 * Sidechain synchronisé sur le kick : le gain plonge de `depth` à chaque temps de kick puis
 * remonte en `releaseSec`. Piloté par les temps de la grille, il fonctionne en rendu solo.
 */
export function sidechainGain(
  kickTimes: readonly number[],
  depth: number,
  releaseSec: number,
): Tone.Gain {
  const g = new Tone.Gain(1);
  const attack = 0.004;
  for (let i = 0; i < kickTimes.length; i++) {
    const t = kickTimes[i];
    const next = kickTimes[i + 1] ?? Infinity;
    const dur = Math.min(releaseSec, next - t - 0.006);
    if (dur <= attack * 3) continue;
    g.gain.setValueCurveAtTime(duckCurve(depth, attack / dur), t, dur);
  }
  return g;
}

function duckCurve(depth: number, attackFrac: number): number[] {
  const n = 48;
  const curve: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    if (x <= attackFrac) curve.push(1 - depth * (x / attackFrac));
    else {
      const r = (x - attackFrac) / (1 - attackFrac);
      curve.push(1 - depth * (1 - r) ** 2);
    }
  }
  curve[n - 1] = 1;
  return curve;
}

/**
 * Porte déclenchée (gated reverb des années 80) : ouverte à chaque frappe pendant `holdSec`,
 * puis refermée en `fadeSec`. Les fenêtres qui se chevauchent sont fusionnées.
 */
export function triggeredGate(
  times: readonly number[],
  holdSec: number,
  fadeSec: number,
): Tone.Gain {
  const g = new Tone.Gain(0);
  const sorted = [...times].sort((a, b) => a - b);
  let i = 0;
  while (i < sorted.length) {
    const start = sorted[i];
    let end = start + holdSec;
    while (i + 1 < sorted.length && sorted[i + 1] <= end + fadeSec) {
      i++;
      end = Math.max(end, sorted[i] + holdSec);
    }
    g.gain.setValueAtTime(0, Math.max(0, start - 0.002));
    g.gain.linearRampToValueAtTime(1, start + 0.002);
    g.gain.setValueAtTime(1, end);
    g.gain.linearRampToValueAtTime(0, end + fadeSec);
    i++;
  }
  return g;
}

interface Automatable {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
}

/** Automation d'un paramètre entre deux temps (ouverture de filtre, fondu…). */
export function ramp(
  param: Automatable,
  from: number,
  to: number,
  t0: number,
  t1: number,
  curve: 'linear' | 'exp' = 'exp',
): void {
  param.setValueAtTime(from, t0);
  if (curve === 'exp' && from > 0 && to > 0) param.exponentialRampToValueAtTime(to, t1);
  else param.linearRampToValueAtTime(to, t1);
}

/**
 * Écrêtage doux : linéaire jusqu'à `threshold`, puis courbe tanh vers 1.
 * Réduit les transitoires (facteur de crête) sans pomper comme un compresseur.
 */
export function softClip(threshold = 0.5): Tone.WaveShaper {
  const shaper = new Tone.WaveShaper((x) => {
    const a = Math.abs(x);
    if (a <= threshold) return x;
    const over = (a - threshold) / (1 - threshold);
    return Math.sign(x) * (threshold + (1 - threshold) * Math.tanh(over));
  }, 8192);
  shaper.oversample = '4x';
  return shaper;
}

/** Saturation douce de type « bitcrush » sans worklet : quantification de l'amplitude. */
export function crusher(levels: number): Tone.WaveShaper {
  return new Tone.WaveShaper((x) => Math.round(x * levels) / levels, 4096);
}

/**
 * Réverb « shimmer » : réverb longue dont une partie repasse une octave plus haut (halo
 * cristallin). Entrée et sortie séparées pour s'insérer dans une chaîne.
 */
export async function shimmer(
  decay: number,
  wet: number,
  amount = 0.35,
): Promise<{ input: Tone.Gain; output: Tone.Gain }> {
  const input = new Tone.Gain(1);
  const output = new Tone.Gain(1);
  const dry = new Tone.Gain(1 - wet);
  const rev = await reverb(decay, 1, 0.03);
  const up = new Tone.PitchShift({ pitch: 12, windowSize: 0.12 });
  const upGain = new Tone.Gain(amount);
  const revGain = new Tone.Gain(wet);
  input.connect(dry);
  input.connect(rev);
  input.connect(up);
  chain(up, upGain, rev);
  chain(rev, revGain, output);
  dry.connect(output);
  return { input, output };
}
