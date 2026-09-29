/**
 * Analyse d'une piste importée : tempo (autocorrélation de l'enveloppe d'attaques), tempo
 * recalé sur la durée de la boucle, grille des mesures et points de boucle suggérés.
 */
import { frameCount, type PcmAudio } from '../lib/wav';

const HOP = 512;

/** Enveloppe d'attaques : hausses d'énergie par fenêtre de HOP échantillons (mono). */
export function onsetEnvelope(audio: PcmAudio): Float32Array {
  const n = Math.floor(frameCount(audio) / HOP);
  const energy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (const ch of audio.channels) {
      for (let j = i * HOP; j < (i + 1) * HOP; j++) e += ch[j] * ch[j];
    }
    energy[i] = Math.log1p(e * 1000);
  }
  const flux = new Float32Array(n);
  for (let i = 1; i < n; i++) flux[i] = Math.max(0, energy[i] - energy[i - 1]);
  return flux;
}

/**
 * Tempo le plus probable entre `min` et `max` BPM (autocorrélation de l'enveloppe, renforcée
 * par la double période pour départager les demi et double tempos). Null si rien ne ressort.
 */
export function detectBpm(audio: PcmAudio, min = 70, max = 180): number | null {
  const env = onsetEnvelope(audio);
  const rate = audio.sampleRate / HOP;
  const mean = env.reduce((s, v) => s + v, 0) / Math.max(1, env.length);
  for (let i = 0; i < env.length; i++) env[i] -= mean;
  const ac = (lag: number): number => {
    let s = 0;
    for (let i = lag; i < env.length; i++) s += env[i] * env[i - lag];
    return s / (env.length - lag);
  };
  let best = 0;
  let bestScore = 0;
  for (let bpm = min; bpm <= max; bpm += 0.25) {
    const lag = (60 / bpm) * rate;
    const l = Math.round(lag);
    const l2 = Math.round(lag * 2);
    if (l2 >= env.length / 2) continue;
    const score = ac(l) + 0.5 * ac(l2);
    if (score > bestScore) {
      bestScore = score;
      best = bpm;
    }
  }
  return best > 0 ? best : null;
}

/**
 * Tempo exact tel que la boucle (en secondes) compte un nombre entier de mesures, au plus près
 * de `bpm` : renvoie { bpm, bars }.
 */
export function snapBpmToLoop(
  bpm: number,
  loopSeconds: number,
  beatsPerBar = 4,
): { bpm: number; bars: number } {
  const bars = Math.max(1, Math.round((loopSeconds * bpm) / (60 * beatsPerBar)));
  return { bpm: (bars * 60 * beatsPerBar) / loopSeconds, bars };
}

/**
 * Points de boucle suggérés pour un fichier complet (intro + boucle + queue) : la boucle finit
 * sur la dernière mesure pleine avant la queue et dure la plus grande puissance de deux de
 * mesures qui laisse une intro d'au moins `minIntroBars` mesures (sinon démarre à 0).
 */
export function suggestLoop(
  contentSeconds: number,
  bpm: number,
  beatsPerBar = 4,
  minIntroBars = 0,
): { loopStart: number; loopEnd: number; bars: number } {
  const bar = (60 * beatsPerBar) / bpm;
  const total = Math.floor(contentSeconds / bar + 1e-6);
  if (total < 1) throw new Error('Piste plus courte qu’une mesure');
  let bars = 1;
  while (bars * 2 <= total - minIntroBars) bars *= 2;
  const endBar = total;
  const startBar = Math.max(0, endBar - bars);
  return { loopStart: startBar * bar, loopEnd: endBar * bar, bars };
}

/** Palier d'intensité par défaut d'une couche d'après son nom. */
export function defaultEnterAt(layer: string): number {
  const l = layer.toLowerCase();
  if (/pad|amb|atmo|drone|chord/.test(l)) return 0;
  if (/bass|drum|kick|beat/.test(l)) return 1;
  if (/lead|arp|melod|synth|perc|hat/.test(l)) return 2;
  if (/fx|riser|choir|extra/.test(l)) return 3;
  return 1;
}
