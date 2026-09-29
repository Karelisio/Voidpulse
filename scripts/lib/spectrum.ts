import type { PcmAudio } from './wav';

/** FFT radix-2 en place (réel + imaginaire). */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const a = i + k;
        const b = a + half;
        const vr = re[b] * wr - im[b] * wi;
        const vi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] = re[a] + vr;
        im[a] = im[a] + vi;
      }
    }
  }
}

export const OCTAVE_BANDS = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

/**
 * Énergie moyenne (dB relatifs) par bande d'octave, par moyennage de Welch sur tout le signal.
 * Sert au contrôle d'équilibre spectral des stems (plus fiable qu'une lecture de spectrogramme).
 */
export function octaveBands(audio: PcmAudio, size = 8192): number[] {
  const { sampleRate } = audio;
  const ch = audio.channels;
  const frames = ch[0]?.length ?? 0;
  const window = new Float64Array(size);
  for (let i = 0; i < size; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  const power = new Float64Array(size / 2);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  let count = 0;
  for (let start = 0; start + size <= frames; start += size) {
    for (let i = 0; i < size; i++) {
      let v = 0;
      for (const c of ch) v += c[start + i];
      re[i] = (v / ch.length) * window[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < size / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
    count++;
  }
  return OCTAVE_BANDS.map((center) => {
    const lo = center / Math.SQRT2;
    const hi = center * Math.SQRT2;
    let sum = 0;
    for (let k = 1; k < size / 2; k++) {
      const f = (k * sampleRate) / size;
      if (f >= lo && f < hi) sum += power[k];
    }
    return count > 0 ? 10 * Math.log10(sum / count + 1e-20) : -200;
  });
}

export function formatBands(bands: readonly number[], reference: number): string {
  return OCTAVE_BANDS.map((f, i) => {
    const label = f >= 1000 ? `${f / 1000}k` : String(f);
    return `${label}:${Math.round(bands[i] - reference)}`;
  }).join(' ');
}
