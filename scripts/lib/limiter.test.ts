import { describe, expect, it } from 'vitest';
import { applyEnvelope, limiterEnvelope } from './limiter';
import type { PcmAudio } from './wav';

function tone(freq: number, amp: number, seconds: number, sr = 48000): Float32Array {
  const out = new Float32Array(Math.round(seconds * sr));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
  return out;
}

describe('limiterEnvelope', () => {
  it('ne touche pas un signal sous le plafond', () => {
    const mix: PcmAudio = { sampleRate: 48000, channels: [tone(220, 0.5, 0.5)] };
    const res = limiterEnvelope(mix, 0.8);
    expect(res.maxReductionDb).toBeCloseTo(0, 5);
    expect(res.activeRatio).toBe(0);
  });

  it('maintient la somme sous le plafond, sans discontinuité', () => {
    const sr = 48000;
    const base = tone(110, 0.4, 1, sr);
    // Transitoire de kick : 20 ms à forte amplitude au milieu.
    for (let i = 24000; i < 24960; i++)
      base[i] += 0.9 * Math.sin((2 * Math.PI * 60 * (i - 24000)) / sr);
    const mix: PcmAudio = { sampleRate: sr, channels: [base] };
    const ceiling = 0.85;
    const res = limiterEnvelope(mix, ceiling);
    const out = applyEnvelope(mix, res.gain).channels[0];
    let peak = 0;
    let maxStep = 0;
    for (let i = 0; i < out.length; i++) {
      peak = Math.max(peak, Math.abs(out[i]));
      if (i > 0) maxStep = Math.max(maxStep, Math.abs(res.gain[i] - res.gain[i - 1]));
    }
    expect(peak).toBeLessThanOrEqual(ceiling + 1e-6);
    expect(res.maxReductionDb).toBeGreaterThan(1);
    expect(maxStep).toBeLessThan(0.01);
  });

  it('applique la même enveloppe à chaque stem : la somme reste le mix limité', () => {
    const sr = 48000;
    const a = tone(100, 0.6, 0.3, sr);
    const b = tone(300, 0.6, 0.3, sr);
    const sum = a.map((v, i) => v + b[i]);
    const res = limiterEnvelope({ sampleRate: sr, channels: [sum] }, 0.9);
    const la = applyEnvelope({ sampleRate: sr, channels: [a] }, res.gain).channels[0];
    const lb = applyEnvelope({ sampleRate: sr, channels: [b] }, res.gain).channels[0];
    const ls = applyEnvelope({ sampleRate: sr, channels: [sum] }, res.gain).channels[0];
    for (let i = 0; i < ls.length; i += 97) expect(la[i] + lb[i]).toBeCloseTo(ls[i], 5);
  });
});
