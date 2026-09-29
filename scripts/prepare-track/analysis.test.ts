import { describe, expect, it } from 'vitest';
import type { PcmAudio } from '../lib/wav';
import { defaultEnterAt, detectBpm, snapBpmToLoop, suggestLoop } from './analysis';

/** Clics de 20 ms (bruit décroissant) à `bpm`, accent sur le premier temps de chaque mesure. */
function clicks(bpm: number, seconds: number, rate = 48000): PcmAudio {
  const out = new Float32Array(Math.round(seconds * rate));
  const beat = (60 / bpm) * rate;
  let seed = 1;
  for (let b = 0; b * beat < out.length; b++) {
    const start = Math.round(b * beat);
    const amp = b % 4 === 0 ? 0.9 : 0.5;
    for (let i = 0; i < 960 && start + i < out.length; i++) {
      seed = (seed * 16807) % 2147483647;
      out[start + i] = amp * (seed / 2147483647 - 0.5) * Math.exp(-i / 200);
    }
  }
  return { sampleRate: rate, channels: [out, out] };
}

describe('analyse des pistes importées', () => {
  it('détecte le tempo d’une piste rythmique', () => {
    for (const bpm of [92, 120, 140]) {
      const found = detectBpm(clicks(bpm, 20));
      expect(found).not.toBeNull();
      expect(Math.abs((found ?? 0) - bpm)).toBeLessThan(1.5);
    }
  });

  it('recale le tempo pour un nombre entier de mesures dans la boucle', () => {
    // 16 mesures à 120 BPM = 32 s ; une détection approximative est recalée.
    expect(snapBpmToLoop(119.4, 32)).toEqual({ bpm: 120, bars: 16 });
  });

  it('suggère une boucle en puissance de deux mesures, finissant avant la queue', () => {
    // 120 BPM : mesure de 2 s ; 38,5 s de contenu = 19 mesures pleines → boucle de 16 mesures.
    const s = suggestLoop(38.5, 120, 4, 2);
    expect(s).toEqual({ loopStart: 6, loopEnd: 38, bars: 16 });
  });

  it('attribue un palier d’intensité selon le nom de la couche', () => {
    expect(defaultEnterAt('Pads')).toBe(0);
    expect(defaultEnterAt('drums')).toBe(1);
    expect(defaultEnterAt('lead')).toBe(2);
    expect(defaultEnterAt('fx')).toBe(3);
  });
});
