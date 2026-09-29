/**
 * Effets sonores originaux de Voidpulse (néon, arcade, synthèse soustractive / FM).
 * Identifiants = ceux joués par src/audio/bridge.ts. Rendu : `npm run sfx:render`.
 */
import {
  crackle,
  drive,
  echo,
  fm,
  lowpass,
  mtof,
  noise,
  osc,
  reverb,
  vary,
  type SfxDesign,
} from './lib';

export const SOUNDS: Record<string, SfxDesign> = {
  // ─── Armes ─────────────────────────────────────────────────────────────────────────────
  'fire.ember': {
    duration: 0.3,
    variants: 4,
    gainDb: -13,
    pitchVar: 0.05,
    maxVoices: 3,
    cooldownMs: 45,
    priority: 1,
    build(c) {
      const k = vary(c, 0.06);
      noise(c, {
        dur: 0.18,
        a: 0.004,
        gain: 0.5,
        filter: 'bandpass',
        q0: 2400 * k,
        q1: 700,
        Q: 1.4,
      });
      osc(c, { type: 'triangle', f0: 980 * k, f1: 260, dur: 0.16, gain: 0.55 });
      osc(c, { type: 'sine', f0: 180 * k, f1: 90, dur: 0.12, gain: 0.35 });
    },
  },
  'fire.arc': {
    duration: 0.35,
    variants: 4,
    gainDb: -12,
    pitchVar: 0.06,
    maxVoices: 3,
    cooldownMs: 60,
    priority: 1,
    build(c) {
      const k = vary(c, 0.08);
      const d = drive(0.6, lowpass(7000, c.out));
      osc(c, {
        type: 'sawtooth',
        f0: 2600 * k,
        f1: 380,
        dur: 0.22,
        gain: 0.35,
        to: d,
        vibrato: [55, 2],
      });
      osc(c, { type: 'square', f0: 1300 * k, f1: 190, dur: 0.18, gain: 0.2, to: d });
      crackle(c, { dur: 0.2, count: 14, freq: 5200, gain: 0.55 });
    },
  },
  'fire.frost': {
    duration: 0.4,
    variants: 3,
    gainDb: -15,
    pitchVar: 0.04,
    maxVoices: 2,
    cooldownMs: 90,
    priority: 1,
    build(c) {
      const base = mtof(c.rng.pick([88, 91, 93]));
      osc(c, { f0: base, dur: 0.32, gain: 0.45 });
      osc(c, { f0: base * 1.5, dur: 0.22, gain: 0.25, t: 0.01 });
      fm(c, { f0: base * 2, harmonicity: 3.01, index: 4, index1: 0.5, dur: 0.18, gain: 0.18 });
    },
  },

  // ─── Impacts ───────────────────────────────────────────────────────────────────────────
  hit: {
    duration: 0.12,
    variants: 4,
    gainDb: -17,
    pitchVar: 0.08,
    maxVoices: 4,
    cooldownMs: 28,
    build(c) {
      const k = vary(c, 0.15);
      noise(c, { dur: 0.07, gain: 0.7, filter: 'bandpass', q0: 1100 * k, q1: 500, Q: 1.2 });
      osc(c, { f0: 220 * k, f1: 110, dur: 0.06, gain: 0.5 });
    },
  },
  'hit.fire': {
    duration: 0.16,
    variants: 4,
    gainDb: -17,
    pitchVar: 0.08,
    maxVoices: 4,
    cooldownMs: 28,
    build(c) {
      const k = vary(c, 0.12);
      noise(c, {
        dur: 0.12,
        gain: 0.7,
        filter: 'bandpass',
        q0: 1500 * k,
        q1: 480,
        Q: 0.9,
        color: 'pink',
      });
      osc(c, { f0: 190 * k, f1: 85, dur: 0.08, gain: 0.55 });
      crackle(c, { dur: 0.1, count: 4, freq: 3000, gain: 0.25 });
    },
  },
  'hit.frost': {
    duration: 0.14,
    variants: 4,
    gainDb: -18,
    pitchVar: 0.06,
    maxVoices: 4,
    cooldownMs: 28,
    build(c) {
      const k = vary(c, 0.1);
      osc(c, { f0: 3100 * k, f1: 2100 * k, dur: 0.06, gain: 0.35 });
      noise(c, { dur: 0.05, gain: 0.5, filter: 'highpass', q0: 4200, Q: 0.7 });
      osc(c, { f0: 260 * k, f1: 130, dur: 0.05, gain: 0.35 });
    },
  },
  'hit.lightning': {
    duration: 0.13,
    variants: 4,
    gainDb: -18,
    pitchVar: 0.08,
    maxVoices: 4,
    cooldownMs: 28,
    build(c) {
      const k = vary(c, 0.12);
      osc(c, { type: 'square', f0: 1900 * k, f1: 800, dur: 0.06, gain: 0.25 });
      crackle(c, { dur: 0.08, count: 6, freq: 6000, gain: 0.5 });
      osc(c, { f0: 200 * k, f1: 100, dur: 0.05, gain: 0.4 });
    },
  },
  'hit.crit': {
    duration: 0.3,
    variants: 3,
    gainDb: -13,
    pitchVar: 0.04,
    maxVoices: 3,
    cooldownMs: 50,
    priority: 1,
    build(c) {
      const k = vary(c, 0.05);
      fm(c, { f0: 1250 * k, harmonicity: 3.5, index: 6, index1: 1, dur: 0.24, gain: 0.35 });
      noise(c, { dur: 0.06, gain: 0.6, filter: 'bandpass', q0: 2500, Q: 1 });
      osc(c, { f0: 160, f1: 70, dur: 0.1, gain: 0.6 });
    },
  },

  // ─── Éliminations ──────────────────────────────────────────────────────────────────────
  kill: {
    duration: 0.3,
    variants: 4,
    gainDb: -15,
    pitchVar: 0.07,
    maxVoices: 4,
    cooldownMs: 35,
    build(c) {
      const k = vary(c, 0.12);
      osc(c, { f0: 720 * k, f1: 130, dur: 0.12, gain: 0.5, sweep: 0.08 });
      noise(c, { dur: 0.2, gain: 0.45, filter: 'lowpass', q0: 5000, q1: 400, color: 'pink' });
    },
  },
  'kill.big': {
    duration: 0.7,
    variants: 3,
    gainDb: -10,
    pitchVar: 0.05,
    maxVoices: 3,
    cooldownMs: 60,
    priority: 1,
    build(c) {
      const k = vary(c, 0.08);
      const d = drive(0.45, c.out);
      osc(c, { f0: 380 * k, f1: 55, dur: 0.35, gain: 0.7, sweep: 0.2, to: d });
      noise(c, {
        dur: 0.5,
        gain: 0.55,
        filter: 'lowpass',
        q0: 3500,
        q1: 160,
        color: 'brown',
        to: d,
      });
      crackle(c, { t: 0.02, dur: 0.25, count: 10, freq: 2200, gain: 0.35 });
    },
  },

  // ─── Joueur ────────────────────────────────────────────────────────────────────────────
  'player.hurt': {
    duration: 0.4,
    variants: 3,
    gainDb: -8,
    pitchVar: 0.03,
    maxVoices: 1,
    cooldownMs: 120,
    priority: 3,
    build(c) {
      const d = drive(0.7, lowpass(3500, c.out));
      osc(c, { type: 'square', f0: 240 * vary(c, 0.05), f1: 90, dur: 0.28, gain: 0.45, to: d });
      noise(c, { dur: 0.18, gain: 0.5, filter: 'bandpass', q0: 900, Q: 0.8, to: d });
    },
  },
  'player.death': {
    duration: 2.6,
    variants: 1,
    stereo: true,
    gainDb: -5,
    maxVoices: 1,
    priority: 5,
    async build(c) {
      const rv = await reverb(c, 2.4, 0.4);
      const lp = lowpass(5000, rv, 1);
      lp.frequency.setValueAtTime(5000, 0);
      lp.frequency.exponentialRampToValueAtTime(200, 1.8);
      for (const [m, pan] of [
        [57, -0.4],
        [60, 0.4],
        [64, 0],
        [45, 0],
      ] as const) {
        osc(c, {
          type: 'sawtooth',
          f0: mtof(m),
          f1: mtof(m - 24),
          dur: 1.8,
          a: 0.01,
          gain: 0.22,
          pan,
          to: lp,
          detune: 7 * pan,
        });
      }
      noise(c, {
        dur: 1.2,
        gain: 0.5,
        filter: 'lowpass',
        q0: 3000,
        q1: 100,
        color: 'brown',
        to: rv,
      });
      osc(c, { f0: 110, f1: 30, dur: 0.9, gain: 0.8, to: rv });
    },
  },
  dash: {
    duration: 0.35,
    variants: 3,
    gainDb: -13,
    pitchVar: 0.05,
    maxVoices: 2,
    cooldownMs: 80,
    priority: 2,
    build(c) {
      const k = vary(c, 0.06);
      noise(c, {
        dur: 0.26,
        a: 0.03,
        gain: 0.7,
        filter: 'bandpass',
        q0: 500 * k,
        q1: 3800 * k,
        Q: 2.2,
        sweep: 0.2,
      });
      osc(c, { type: 'triangle', f0: 300 * k, f1: 900 * k, dur: 0.14, gain: 0.25 });
    },
  },
  xp: {
    duration: 0.1,
    variants: 3,
    gainDb: -20,
    pitchVar: 0.02,
    maxVoices: 3,
    cooldownMs: 22,
    build(c) {
      const f = mtof(c.rng.pick([88, 90, 92]));
      osc(c, { f0: f, dur: 0.07, gain: 0.5 });
      osc(c, { f0: f * 2, dur: 0.04, gain: 0.15 });
    },
  },
  levelup: {
    duration: 1.4,
    variants: 1,
    stereo: true,
    gainDb: -7,
    maxVoices: 1,
    priority: 4,
    async build(c) {
      const rv = await reverb(c, 1.6, 0.3);
      const e = echo(0.12, 0.3, 0.25, rv);
      [69, 72, 76, 81, 84].forEach((m, i) => {
        osc(c, {
          type: 'square',
          f0: mtof(m),
          t: i * 0.065,
          dur: 0.28,
          gain: 0.16,
          pan: (i - 2) * 0.25,
          to: e,
        });
        osc(c, { type: 'triangle', f0: mtof(m + 12), t: i * 0.065, dur: 0.2, gain: 0.12, to: e });
      });
      fm(c, {
        f0: mtof(93),
        t: 0.33,
        harmonicity: 2,
        index: 3,
        index1: 0,
        dur: 0.9,
        gain: 0.14,
        to: rv,
      });
      noise(c, { t: 0.3, dur: 0.6, gain: 0.12, filter: 'highpass', q0: 7000, to: rv });
    },
  },

  // ─── Résonance ─────────────────────────────────────────────────────────────────────────
  reaction: {
    duration: 0.6,
    variants: 2,
    gainDb: -11,
    pitchVar: 0.05,
    maxVoices: 3,
    cooldownMs: 70,
    priority: 2,
    build(c) {
      fm(c, {
        f0: 440 * vary(c, 0.05),
        f1: 220,
        harmonicity: 1.5,
        index: 5,
        index1: 0.5,
        dur: 0.45,
        gain: 0.35,
      });
      noise(c, { dur: 0.3, gain: 0.35, filter: 'bandpass', q0: 1800, q1: 600, Q: 1 });
    },
  },
  'reaction.vapor': {
    duration: 1.1,
    variants: 3,
    gainDb: -10,
    pitchVar: 0.05,
    maxVoices: 3,
    cooldownMs: 90,
    priority: 2,
    build(c) {
      const k = vary(c, 0.08);
      noise(c, {
        dur: 0.95,
        a: 0.06,
        gain: 0.55,
        filter: 'bandpass',
        q0: 3600 * k,
        q1: 1400,
        Q: 0.9,
      });
      noise(c, { dur: 0.5, a: 0.002, gain: 0.35, filter: 'highpass', q0: 6500 });
      crackle(c, { dur: 0.7, count: 18, freq: 4500, gain: 0.25 });
      osc(c, { f0: 150 * k, f1: 80, dur: 0.4, gain: 0.35 });
    },
  },
  'reaction.overload': {
    duration: 1.0,
    variants: 3,
    gainDb: -8,
    pitchVar: 0.05,
    maxVoices: 3,
    cooldownMs: 90,
    priority: 3,
    build(c) {
      const k = vary(c, 0.08);
      const d = drive(0.8, lowpass(6000, c.out));
      noise(c, {
        dur: 0.7,
        gain: 0.8,
        filter: 'lowpass',
        q0: 4000,
        q1: 180,
        color: 'brown',
        to: d,
      });
      osc(c, { f0: 140 * k, f1: 38, dur: 0.55, gain: 0.9, sweep: 0.35, to: d });
      osc(c, {
        type: 'sawtooth',
        f0: 1800 * k,
        f1: 200,
        dur: 0.18,
        gain: 0.25,
        vibrato: [70, 3],
        to: d,
      });
      crackle(c, { dur: 0.45, count: 16, freq: 5000, gain: 0.45 });
    },
  },
  'reaction.superconduct': {
    duration: 1.2,
    variants: 3,
    gainDb: -10,
    pitchVar: 0.04,
    maxVoices: 3,
    cooldownMs: 90,
    priority: 3,
    async build(c) {
      const rv = await reverb(c, 1.2, 0.35);
      const k = vary(c, 0.05);
      [0, 7, 14].forEach((st, i) => {
        fm(c, {
          f0: 880 * k * 2 ** (st / 12),
          t: i * 0.02,
          harmonicity: 3.02,
          index: 5,
          index1: 0.3,
          dur: 0.8,
          gain: 0.16,
          to: rv,
        });
      });
      osc(c, {
        type: 'sawtooth',
        f0: 300,
        f1: 3200 * k,
        dur: 0.25,
        gain: 0.18,
        vibrato: [60, 2],
        to: rv,
      });
      crackle(c, { dur: 0.3, count: 12, freq: 7000, gain: 0.4 });
      osc(c, { f0: 120, f1: 60, dur: 0.25, gain: 0.5 });
    },
  },
  'eveil.start': {
    duration: 2.4,
    variants: 1,
    stereo: true,
    gainDb: -5,
    maxVoices: 1,
    priority: 5,
    async build(c) {
      const rv = await reverb(c, 2.5, 0.35);
      const lp = lowpass(300, rv, 2);
      lp.frequency.setValueAtTime(300, 0);
      lp.frequency.exponentialRampToValueAtTime(9000, 1.1);
      for (const [m, pan] of [
        [57, -0.6],
        [64, 0.6],
        [69, 0],
        [72, -0.3],
        [76, 0.3],
      ] as const) {
        osc(c, {
          type: 'sawtooth',
          f0: mtof(m - 12),
          f1: mtof(m),
          sweep: 1.1,
          a: 0.9,
          hold: 0.3,
          dur: 2.2,
          gain: 0.12,
          pan,
          detune: 9 * pan,
          to: lp,
        });
      }
      noise(c, {
        a: 1,
        dur: 1.25,
        linear: true,
        gain: 0.35,
        filter: 'highpass',
        q0: 800,
        q1: 9000,
        sweep: 1.1,
        to: rv,
      });
      osc(c, { t: 1.1, f0: 90, f1: 40, dur: 0.8, gain: 0.9 });
      noise(c, { t: 1.1, dur: 0.6, gain: 0.5, filter: 'lowpass', q0: 6000, q1: 300, to: rv });
    },
  },
  'eveil.end': {
    duration: 1.4,
    variants: 1,
    stereo: true,
    gainDb: -9,
    maxVoices: 1,
    priority: 3,
    async build(c) {
      const rv = await reverb(c, 1.8, 0.4);
      osc(c, {
        type: 'triangle',
        f0: mtof(81),
        f1: mtof(57),
        dur: 1.1,
        a: 0.02,
        gain: 0.25,
        pan: -0.3,
        to: rv,
      });
      osc(c, {
        type: 'triangle',
        f0: mtof(76),
        f1: mtof(52),
        dur: 1.1,
        a: 0.02,
        gain: 0.2,
        pan: 0.3,
        to: rv,
      });
      noise(c, { dur: 0.9, gain: 0.25, filter: 'bandpass', q0: 6000, q1: 400, Q: 1.5, to: rv });
    },
  },
  'eveil.nova': {
    duration: 0.8,
    variants: 3,
    gainDb: -11,
    pitchVar: 0.04,
    maxVoices: 2,
    cooldownMs: 150,
    priority: 2,
    build(c) {
      const k = vary(c, 0.06);
      osc(c, { f0: 210 * k, f1: 48, dur: 0.5, gain: 0.8, sweep: 0.3 });
      fm(c, { f0: 660 * k, harmonicity: 2.5, index: 4, index1: 0, dur: 0.6, gain: 0.2 });
      noise(c, { dur: 0.4, gain: 0.35, filter: 'bandpass', q0: 3000, q1: 700, Q: 1 });
    },
  },
  freeze: {
    duration: 0.6,
    variants: 3,
    gainDb: -14,
    pitchVar: 0.05,
    maxVoices: 2,
    cooldownMs: 80,
    priority: 1,
    build(c) {
      const k = vary(c, 0.06);
      crackle(c, { dur: 0.25, count: 16, freq: 6500, gain: 0.55 });
      [96, 99, 103].forEach((m, i) => {
        osc(c, { f0: mtof(m) * k, t: i * 0.015, dur: 0.4, gain: 0.12 });
      });
      noise(c, { dur: 0.3, gain: 0.25, filter: 'highpass', q0: 5000 });
    },
  },

  // ─── Ennemis ───────────────────────────────────────────────────────────────────────────
  'enemy.shot': {
    duration: 0.22,
    variants: 3,
    gainDb: -16,
    pitchVar: 0.06,
    maxVoices: 3,
    cooldownMs: 60,
    build(c) {
      const k = vary(c, 0.08);
      osc(c, { type: 'square', f0: 950 * k, f1: 320, dur: 0.16, gain: 0.3 });
      osc(c, { f0: 475 * k, f1: 160, dur: 0.12, gain: 0.3 });
    },
  },
  'boss.shot': {
    duration: 0.4,
    variants: 3,
    gainDb: -12,
    pitchVar: 0.04,
    maxVoices: 2,
    cooldownMs: 90,
    priority: 2,
    build(c) {
      const k = vary(c, 0.05);
      const d = drive(0.5, c.out);
      osc(c, { type: 'sawtooth', f0: 420 * k, f1: 110, dur: 0.3, gain: 0.35, to: d });
      osc(c, { f0: 140 * k, f1: 60, dur: 0.25, gain: 0.5 });
      noise(c, { dur: 0.15, gain: 0.3, filter: 'bandpass', q0: 1500, Q: 1 });
    },
  },
  explosion: {
    duration: 0.9,
    variants: 3,
    gainDb: -8,
    pitchVar: 0.05,
    maxVoices: 3,
    cooldownMs: 70,
    priority: 3,
    build(c) {
      const k = vary(c, 0.08);
      const d = drive(0.6, c.out);
      noise(c, {
        dur: 0.75,
        gain: 0.9,
        filter: 'lowpass',
        q0: 5000,
        q1: 150,
        color: 'brown',
        to: d,
      });
      osc(c, { f0: 120 * k, f1: 35, dur: 0.5, gain: 0.9, to: d });
      crackle(c, { t: 0.03, dur: 0.4, count: 12, freq: 2500, gain: 0.3 });
    },
  },
  mine: {
    duration: 0.8,
    variants: 3,
    gainDb: -9,
    pitchVar: 0.05,
    maxVoices: 3,
    cooldownMs: 60,
    priority: 3,
    build(c) {
      const k = vary(c, 0.06);
      fm(c, { f0: 520 * k, harmonicity: 1.41, index: 8, index1: 0, dur: 0.3, gain: 0.3 });
      noise(c, { dur: 0.6, gain: 0.8, filter: 'lowpass', q0: 7000, q1: 250, color: 'pink' });
      osc(c, { f0: 150 * k, f1: 40, dur: 0.4, gain: 0.8 });
    },
  },
  blink: {
    duration: 0.45,
    variants: 3,
    gainDb: -14,
    pitchVar: 0.05,
    maxVoices: 2,
    cooldownMs: 80,
    build(c) {
      const k = vary(c, 0.08);
      osc(c, { f0: 280 * k, f1: 1700 * k, dur: 0.3, a: 0.12, gain: 0.3, vibrato: [18, 1.5] });
      noise(c, { dur: 0.32, a: 0.15, gain: 0.25, filter: 'bandpass', q0: 700, q1: 5000, Q: 3 });
    },
  },
  'telegraph.fuse': {
    duration: 0.55,
    variants: 2,
    gainDb: -15,
    maxVoices: 3,
    cooldownMs: 120,
    priority: 2,
    build(c) {
      const f = c.v === 0 ? 1760 : 1568;
      [0, 0.18, 0.31, 0.4].forEach((t) => {
        osc(c, { type: 'square', t, f0: f, dur: 0.05, gain: 0.25 });
      });
    },
  },
  'telegraph.charge': {
    duration: 0.4,
    variants: 2,
    gainDb: -20,
    maxVoices: 2,
    cooldownMs: 150,
    build(c) {
      osc(c, { f0: 420 * vary(c, 0.05), f1: 1250, dur: 0.35, a: 0.25, gain: 0.3, linear: true });
    },
  },
  'telegraph.boss': {
    duration: 0.9,
    variants: 2,
    gainDb: -10,
    maxVoices: 1,
    cooldownMs: 250,
    priority: 4,
    build(c) {
      const lp = lowpass(1400, c.out, 3);
      const m = c.v === 0 ? 45 : 44;
      osc(c, {
        type: 'sawtooth',
        f0: mtof(m),
        dur: 0.7,
        a: 0.05,
        hold: 0.35,
        gain: 0.35,
        vibrato: [7, 0.3],
        to: lp,
      });
      osc(c, {
        type: 'sawtooth',
        f0: mtof(m + 7),
        dur: 0.7,
        a: 0.05,
        hold: 0.35,
        gain: 0.22,
        detune: 8,
        to: lp,
      });
      osc(c, { type: 'square', f0: mtof(m + 36), t: 0, dur: 0.08, gain: 0.12 });
      osc(c, { type: 'square', f0: mtof(m + 36), t: 0.16, dur: 0.08, gain: 0.12 });
    },
  },

  // ─── Boss ──────────────────────────────────────────────────────────────────────────────
  'boss.spawn': {
    duration: 3.2,
    variants: 1,
    stereo: true,
    gainDb: -4,
    maxVoices: 1,
    priority: 5,
    async build(c) {
      const rv = await reverb(c, 3, 0.35);
      const d = drive(0.35, lowpass(2200, rv, 2));
      for (const [m, pan] of [
        [33, 0],
        [40, -0.5],
        [45, 0.5],
        [36, 0],
      ] as const) {
        osc(c, {
          type: 'sawtooth',
          f0: mtof(m),
          a: 0.4,
          hold: 1.2,
          dur: 2.8,
          gain: 0.2,
          pan,
          vibrato: [5, 0.15],
          detune: 10 * pan,
          to: d,
        });
      }
      osc(c, { f0: 70, f1: 28, dur: 1.4, gain: 1 });
      noise(c, {
        dur: 1.2,
        gain: 0.6,
        filter: 'lowpass',
        q0: 3000,
        q1: 80,
        color: 'brown',
        to: rv,
      });
      noise(c, {
        t: 0.4,
        a: 0.8,
        dur: 2.2,
        gain: 0.15,
        filter: 'bandpass',
        q0: 300,
        q1: 2400,
        Q: 4,
        to: rv,
      });
    },
  },
  'boss.phase': {
    duration: 1.4,
    variants: 1,
    stereo: true,
    gainDb: -6,
    maxVoices: 1,
    priority: 4,
    async build(c) {
      const rv = await reverb(c, 1.6, 0.3);
      noise(c, {
        a: 0.5,
        dur: 0.6,
        linear: true,
        gain: 0.35,
        filter: 'bandpass',
        q0: 400,
        q1: 4000,
        Q: 2,
        to: rv,
      });
      osc(c, { t: 0.55, f0: 100, f1: 34, dur: 0.7, gain: 1 });
      noise(c, { t: 0.55, dur: 0.6, gain: 0.6, filter: 'lowpass', q0: 4000, q1: 150, to: rv });
    },
  },
  'boss.rage': {
    duration: 1.8,
    variants: 1,
    stereo: true,
    gainDb: -5,
    maxVoices: 1,
    priority: 5,
    async build(c) {
      const rv = await reverb(c, 1.5, 0.25);
      const d = drive(0.9, lowpass(3000, rv));
      for (const [m, pan] of [
        [38, -0.4],
        [39, 0.4],
        [45, 0],
      ] as const) {
        osc(c, {
          type: 'sawtooth',
          f0: mtof(m),
          f1: mtof(m - 5),
          a: 0.05,
          hold: 0.6,
          dur: 1.5,
          gain: 0.25,
          pan,
          vibrato: [9, 0.8],
          to: d,
        });
      }
      noise(c, {
        dur: 1.2,
        a: 0.05,
        gain: 0.35,
        filter: 'bandpass',
        q0: 800,
        q1: 300,
        Q: 1,
        to: d,
      });
    },
  },
  'boss.death': {
    duration: 3.5,
    variants: 1,
    stereo: true,
    gainDb: -3,
    maxVoices: 1,
    priority: 5,
    async build(c) {
      const rv = await reverb(c, 3.2, 0.4);
      const d = drive(0.7, rv);
      noise(c, { dur: 2.2, gain: 0.9, filter: 'lowpass', q0: 6000, q1: 90, color: 'brown', to: d });
      osc(c, { f0: 90, f1: 22, dur: 2, gain: 1, to: d });
      for (let i = 0; i < 5; i++) {
        noise(c, {
          t: 0.15 + i * 0.22 + c.rng.range(0, 0.08),
          dur: 0.35,
          gain: 0.5,
          filter: 'lowpass',
          q0: 3000,
          q1: 200,
          pan: c.rng.range(-0.8, 0.8),
          to: rv,
        });
      }
      [69, 64, 60, 57].forEach((m, i) => {
        osc(c, {
          type: 'triangle',
          t: 0.6 + i * 0.05,
          f0: mtof(m),
          f1: mtof(m - 12),
          dur: 2.4,
          a: 0.05,
          gain: 0.12,
          pan: (i - 1.5) * 0.4,
          to: rv,
        });
      });
    },
  },
  'boss.slam': {
    duration: 0.9,
    variants: 2,
    gainDb: -6,
    maxVoices: 1,
    cooldownMs: 200,
    priority: 4,
    build(c) {
      const d = drive(0.5, c.out);
      osc(c, { f0: 85, f1: 30, dur: 0.6, gain: 1, to: d });
      noise(c, {
        dur: 0.7,
        gain: 0.7,
        filter: 'lowpass',
        q0: 2500,
        q1: 120,
        color: 'brown',
        to: d,
      });
      crackle(c, { t: 0.05, dur: 0.5, count: 14, freq: 1800, gain: 0.35 });
    },
  },

  // ─── Fin de partie ─────────────────────────────────────────────────────────────────────
  'run.victory': {
    duration: 3,
    variants: 1,
    stereo: true,
    gainDb: -6,
    maxVoices: 1,
    priority: 5,
    async build(c) {
      const rv = await reverb(c, 2.2, 0.3);
      const notes = [69, 73, 76, 81, 85, 88];
      notes.forEach((m, i) => {
        osc(c, {
          type: 'square',
          f0: mtof(m),
          t: i * 0.09,
          dur: 0.5,
          gain: 0.12,
          pan: (i - 2.5) * 0.2,
          to: rv,
        });
      });
      for (const [m, pan] of [
        [69, -0.4],
        [73, 0.4],
        [76, 0],
        [81, 0],
      ] as const) {
        osc(c, {
          type: 'sawtooth',
          f0: mtof(m),
          t: 0.6,
          a: 0.05,
          hold: 0.8,
          dur: 2.2,
          gain: 0.09,
          pan,
          detune: 8 * pan,
          to: lowpass(4000, rv),
        });
      }
      noise(c, { t: 0.55, dur: 1.4, gain: 0.1, filter: 'highpass', q0: 8000, to: rv });
    },
  },
  'run.defeat': {
    duration: 2.8,
    variants: 1,
    stereo: true,
    gainDb: -7,
    maxVoices: 1,
    priority: 5,
    async build(c) {
      const rv = await reverb(c, 2.5, 0.4);
      [76, 72, 69, 64].forEach((m, i) => {
        osc(c, {
          type: 'triangle',
          f0: mtof(m),
          t: i * 0.28,
          dur: 0.9,
          gain: 0.25,
          pan: (1.5 - i) * 0.3,
          to: rv,
        });
      });
      osc(c, {
        type: 'sawtooth',
        f0: mtof(45),
        f1: mtof(40),
        t: 1.1,
        dur: 1.5,
        a: 0.2,
        gain: 0.15,
        to: lowpass(900, rv),
      });
    },
  },

  // ─── Interface ─────────────────────────────────────────────────────────────────────────
  'ui.click': {
    duration: 0.07,
    variants: 2,
    bus: 'ui',
    gainDb: -12,
    maxVoices: 2,
    cooldownMs: 30,
    build(c) {
      osc(c, { f0: c.v === 0 ? 2100 : 1900, f1: 1400, dur: 0.035, gain: 0.5 });
    },
  },
  'ui.card': {
    duration: 0.2,
    variants: 3,
    bus: 'ui',
    gainDb: -12,
    pitchVar: 0.04,
    maxVoices: 3,
    cooldownMs: 40,
    build(c) {
      noise(c, { dur: 0.12, a: 0.02, gain: 0.35, filter: 'bandpass', q0: 1200, q1: 3500, Q: 2 });
      osc(c, { f0: mtof(c.rng.pick([81, 84, 88])), dur: 0.1, t: 0.03, gain: 0.25 });
    },
  },
  'ui.confirm': {
    duration: 0.4,
    variants: 1,
    bus: 'ui',
    gainDb: -10,
    maxVoices: 1,
    cooldownMs: 60,
    build(c) {
      osc(c, { type: 'triangle', f0: mtof(81), dur: 0.12, gain: 0.4 });
      osc(c, { type: 'triangle', f0: mtof(88), t: 0.08, dur: 0.25, gain: 0.4 });
      osc(c, { f0: mtof(100), t: 0.08, dur: 0.2, gain: 0.1 });
    },
  },
  'ui.back': {
    duration: 0.3,
    variants: 1,
    bus: 'ui',
    gainDb: -11,
    maxVoices: 1,
    cooldownMs: 60,
    build(c) {
      osc(c, { type: 'triangle', f0: mtof(84), dur: 0.1, gain: 0.4 });
      osc(c, { type: 'triangle', f0: mtof(77), t: 0.07, dur: 0.18, gain: 0.35 });
    },
  },
};
