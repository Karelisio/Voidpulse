import type { PcmAudio } from './wav';

export interface LimiterResult {
  /** Gain linéaire par échantillon (≤ 1). */
  gain: Float32Array;
  /** Réduction de gain maximale (dB, positive). */
  maxReductionDb: number;
  /** Proportion d'échantillons limités. */
  activeRatio: number;
}

/**
 * Enveloppe de gain d'un limiteur à anticipation calculée sur la SOMME des stems.
 * Appliquée à l'identique à chaque stem, elle garantit que leur somme reste le mix limité
 * (le gain est commun, donc la somme reste linéaire).
 *
 * 1. gain requis r(t) = min(1, plafond / |x(t)|) ;
 * 2. minimum glissant vers l'avant sur `lookahead` (le gain baisse avant la crête) ;
 * 3. moyenne glissante de même longueur (transitions sans clic) ;
 * 4. relâchement exponentiel (`releaseMs`).
 */
export function limiterEnvelope(
  mix: PcmAudio,
  ceiling: number,
  lookaheadMs = 5,
  releaseMs = 80,
): LimiterResult {
  const n = mix.channels[0]?.length ?? 0;
  const L = Math.max(1, Math.round((lookaheadMs / 1000) * mix.sampleRate));
  const req = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let peak = 0;
    for (const ch of mix.channels) peak = Math.max(peak, Math.abs(ch[i]));
    req[i] = peak > ceiling ? ceiling / peak : 1;
  }

  // Minimum glissant avant (file monotone).
  const minFwd = new Float32Array(n);
  const deque = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (tail > head && req[deque[tail - 1]] >= req[i]) tail--;
    deque[tail++] = i;
    while (deque[head] > i + L) head++;
    minFwd[i] = req[deque[head]]!;
  }

  // Moyenne glissante centrée sur la fenêtre d'anticipation.
  const smooth = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += minFwd[i];
    if (i >= L) acc -= minFwd[i - L];
    smooth[i] = acc / Math.min(i + 1, L);
  }
  // Chaque minFwd[j] de la fenêtre [i-L+1, i] couvre l'échantillon i : la moyenne reste ≤ req[i].
  const k = 1 - Math.exp(-1 / ((releaseMs / 1000) * mix.sampleRate));
  const gain = new Float32Array(n);
  let g = 1;
  let maxRed = 1;
  let active = 0;
  for (let i = 0; i < n; i++) {
    const target = smooth[i];
    g = target < g ? target : g + (target - g) * k;
    gain[i] = g;
    if (g < maxRed) maxRed = g;
    if (g < 0.999) active++;
  }
  return { gain, maxReductionDb: -20 * Math.log10(maxRed), activeRatio: n > 0 ? active / n : 0 };
}

/**
 * Enveloppe périodique pour une boucle : calculée sur trois périodes concaténées, on garde celle
 * du milieu. Le gain est ainsi continu au bouclage (fin de période → début de période).
 */
export function periodicLimiterEnvelope(
  loop: PcmAudio,
  ceiling: number,
  lookaheadMs = 5,
  releaseMs = 80,
): LimiterResult {
  const n = loop.channels[0]?.length ?? 0;
  const tripled: PcmAudio = {
    sampleRate: loop.sampleRate,
    channels: loop.channels.map((ch) => {
      const out = new Float32Array(n * 3);
      out.set(ch, 0);
      out.set(ch, n);
      out.set(ch, 2 * n);
      return out;
    }),
  };
  const res = limiterEnvelope(tripled, ceiling, lookaheadMs, releaseMs);
  const gain = res.gain.slice(n, 2 * n);
  let minGain = 1;
  let active = 0;
  for (let i = 0; i < n; i++) {
    minGain = Math.min(minGain, gain[i]);
    if (gain[i] < 0.999) active++;
  }
  return { gain, maxReductionDb: -20 * Math.log10(minGain), activeRatio: n > 0 ? active / n : 0 };
}

export function applyEnvelope(audio: PcmAudio, gain: Float32Array, scalar = 1): PcmAudio {
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((ch) => {
      const out = new Float32Array(ch.length);
      for (let i = 0; i < ch.length; i++) out[i] = ch[i] * (gain[i] ?? 1) * scalar;
      return out;
    }),
  };
}
