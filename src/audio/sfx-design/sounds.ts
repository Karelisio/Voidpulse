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
  type NoiseShape,
  type SfxCtx,
  type SfxDesign,
  type Shape,
} from './lib';

type Out = Shape['to'];

/**
 * Niveau efficace (dBFS) d'un bruit de gain 1 une fois filtré, à la fréquence moyenne `f`
 * (modèle ajusté sur des mesures de rendu, ±3 dB ; un sinus de gain 1 vaut -3 dBFS).
 */
function noiseDb(s: Pick<NoiseShape, 'color' | 'filter' | 'Q'>, f: number): number {
  const color = s.color ?? 'white';
  const q = s.Q ?? 1;
  switch (s.filter) {
    case 'bandpass':
      if (color === 'white') {
        const warp = Math.cos((Math.PI * f) / 48000) ** 2;
        return -7.6 + 10 * Math.log10((0.93 * (f / q) * warp) / 24000);
      }
      if (color === 'pink') return -26.9 + 10 * Math.log10(0.8 / q) - 0.35 * Math.log2(f / 300);
      return -22.7 - 3.5 * Math.log2(f / 300) - 3.3 * Math.log2(q / 1.5);
    case 'lowpass':
      if (color === 'white') {
        return -7.6 + 10 * Math.log10(Math.min(1, (2.3 * Math.max(f, 300)) / 24000));
      }
      return color === 'pink' ? -16.5 : -15;
    case 'highpass':
      if (color === 'white') return -7.2;
      return (
        (color === 'pink' ? -19.4 : -21.5) -
        (color === 'pink' ? 1.1 : 3) * Math.log2(Math.max(f, 500) / 500)
      );
    default:
      if (color === 'white') return -7.6;
      return color === 'pink' ? -17.2 : -16.8;
  }
}

/**
 * Bruit filtré dont `gain` s'exprime comme pour un oscillateur : à gain égal, même niveau
 * efficace qu'un sinus (un bruit filtré est sinon 15 à 25 dB plus faible).
 */
function air(c: SfxCtx, s: NoiseShape): void {
  const q0 = s.q0 ?? 1000;
  const f = s.q1 === undefined ? q0 : Math.sqrt(q0 * s.q1);
  noise(c, { ...s, gain: (s.gain ?? 1) * 10 ** ((-3 - noiseDb(s, f)) / 20) });
}

/** Crépitement calibré comme `air` (clics de bande étroite autour de `freq`). */
function sparks(c: SfxCtx, s: Parameters<typeof crackle>[1]): void {
  const trim = 10 ** ((-3 - noiseDb({ filter: 'bandpass', Q: 2 }, s.freq)) / 20);
  crackle(c, { ...s, gain: (s.gain ?? 0.5) * trim });
}

/** Bulle de poison : petit glissando ascendant qui éclate. */
function bubble(c: SfxCtx, t: number, f: number, gain: number, to?: Out): void {
  osc(c, { t, f0: f, f1: f * 2.4, sweep: 0.045, dur: 0.075, a: 0.003, gain, to });
}

/** Choc grave : sinus qui plonge (poids, impulsion). */
function thump(
  c: SfxCtx,
  t: number,
  f0: number,
  f1: number,
  dur: number,
  gain: number,
  to?: Out,
): void {
  osc(c, { t, f0, f1, sweep: dur * 0.75, dur, gain, to });
}

/** Cloche FM inharmonique dont le timbre s'adoucit (cristal, arcane). */
function bell(
  c: SfxCtx,
  t: number,
  f: number,
  dur: number,
  gain: number,
  ratio = 3.01,
  index = 3,
  to?: Out,
): void {
  fm(c, { t, f0: f, harmonicity: ratio, index, index1: 0.2, dur, gain, to });
}

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

  // ─── Armes : feu ───────────────────────────────────────────────────────────────────────
  'fire.flamewheel': {
    duration: 0.36,
    variants: 3,
    gainDb: -18,
    pitchVar: 0.05,
    maxVoices: 2,
    cooldownMs: 120,
    priority: 1,
    build(c) {
      const k = vary(c, 0.06);
      // Frôlement : une flamme passe (souffle chaud qui monte puis s'éloigne), braises.
      air(c, {
        color: 'pink',
        a: 0.09,
        dur: 0.16,
        gain: 0.3,
        filter: 'bandpass',
        q0: 500 * k,
        q1: 1700 * k,
        Q: 1.2,
        sweep: 0.14,
      });
      air(c, {
        color: 'pink',
        t: 0.09,
        a: 0.02,
        dur: 0.24,
        gain: 0.26,
        filter: 'bandpass',
        q0: 1700 * k,
        q1: 550 * k,
        Q: 1.2,
      });
      osc(c, { type: 'triangle', f0: 300 * k, f1: 210, a: 0.06, dur: 0.24, gain: 0.2 });
      sparks(c, { t: 0.04, dur: 0.22, count: 7, freq: 2200, gain: 0.4 });
    },
  },
  'fire.brazier': {
    duration: 0.42,
    variants: 3,
    gainDb: -19,
    pitchVar: 0.04,
    maxVoices: 2,
    cooldownMs: 150,
    priority: 1,
    build(c) {
      const k = vary(c, 0.06);
      // Souffle doux d'un brasier : la chaleur monte, quelques braises pétillent.
      air(c, {
        color: 'pink',
        a: 0.14,
        dur: 0.38,
        gain: 0.3,
        filter: 'lowpass',
        q0: 700 * k,
        q1: 2000 * k,
        sweep: 0.2,
      });
      osc(c, { f0: 110 * k, f1: 70, a: 0.08, dur: 0.3, gain: 0.12 });
      sparks(c, { t: 0.08, dur: 0.26, count: 6, freq: 1700, gain: 0.32 });
    },
  },
  'fire.firemine': {
    duration: 0.34,
    variants: 3,
    gainDb: -16,
    pitchVar: 0.05,
    maxVoices: 3,
    cooldownMs: 90,
    priority: 1,
    build(c) {
      const k = vary(c, 0.06);
      // Pose : clic métallique, choc sourd au sol, puis mèche qui siffle et crépite.
      air(c, { dur: 0.012, a: 0.0005, gain: 0.5, filter: 'bandpass', q0: 3600 * k, Q: 3 });
      osc(c, { type: 'square', f0: 1500 * k, f1: 900, dur: 0.02, gain: 0.2 });
      thump(c, 0.015, 250 * k, 95, 0.12, 0.28);
      air(c, {
        color: 'pink',
        t: 0.05,
        a: 0.02,
        dur: 0.24,
        gain: 0.16,
        filter: 'highpass',
        q0: 2600,
      });
      sparks(c, { t: 0.06, dur: 0.22, count: 9, freq: 3200, gain: 0.28 });
    },
  },
  'fire.phoenix': {
    duration: 0.45,
    variants: 3,
    gainDb: -15,
    pitchVar: 0.05,
    maxVoices: 2,
    cooldownMs: 100,
    priority: 1,
    build(c) {
      const k = vary(c, 0.06);
      // Envol : souffle chaud qui grimpe, cri de braise qui monte, étincelles.
      air(c, {
        color: 'pink',
        a: 0.03,
        dur: 0.34,
        gain: 0.3,
        filter: 'bandpass',
        q0: 450 * k,
        q1: 3000 * k,
        Q: 1.2,
        sweep: 0.28,
      });
      osc(c, {
        type: 'triangle',
        f0: 520 * k,
        f1: 1650 * k,
        sweep: 0.2,
        a: 0.02,
        dur: 0.3,
        gain: 0.25,
        vibrato: [11, 0.6],
      });
      thump(c, 0, 200 * k, 80, 0.12, 0.2);
      sparks(c, { dur: 0.3, count: 8, freq: 2800, gain: 0.25 });
    },
  },

  // ─── Armes : givre ─────────────────────────────────────────────────────────────────────
  'fire.icelance': {
    duration: 0.34,
    variants: 4,
    gainDb: -16,
    pitchVar: 0.04,
    maxVoices: 3,
    cooldownMs: 60,
    priority: 1,
    build(c) {
      const k = vary(c, 0.05);
      // Lance : trait aigu qui plonge, éclat de glace, brève résonance de cristal.
      osc(c, { f0: 4600 * k, f1: 1500 * k, sweep: 0.07, dur: 0.1, gain: 0.2 });
      air(c, {
        a: 0.002,
        dur: 0.09,
        gain: 0.22,
        filter: 'bandpass',
        q0: 3500,
        q1: 8000,
        Q: 1.5,
        sweep: 0.08,
      });
      thump(c, 0, 300 * k, 120, 0.07, 0.18);
      bell(c, 0.02, mtof(96) * k, 0.24, 0.18);
    },
  },
  'fire.glacialwave': {
    duration: 0.5,
    variants: 3,
    gainDb: -14,
    pitchVar: 0.04,
    maxVoices: 2,
    cooldownMs: 140,
    priority: 1,
    build(c) {
      const k = vary(c, 0.05);
      // Onde : choc glacial sourd, anneau de givre qui s'élargit, éclats en cascade.
      thump(c, 0, 200 * k, 55, 0.3, 0.18);
      air(c, {
        a: 0.04,
        dur: 0.3,
        gain: 0.2,
        filter: 'bandpass',
        q0: 900,
        q1: 7000,
        Q: 1.6,
        sweep: 0.22,
      });
      [84, 88, 91, 96].forEach((m, i) => {
        bell(c, 0.05 + i * 0.045, mtof(m) * k, 0.22, 0.15);
      });
      sparks(c, { t: 0.02, dur: 0.25, count: 10, freq: 6500, gain: 0.2 });
    },
  },
  'fire.blizzard': {
    duration: 0.5,
    variants: 3,
    gainDb: -17,
    pitchVar: 0.04,
    maxVoices: 2,
    cooldownMs: 120,
    priority: 1,
    build(c) {
      const k = vary(c, 0.06);
      // Rafale : vent glacé chargé de cristaux, éclats de givre épars.
      air(c, {
        a: 0.14,
        dur: 0.44,
        gain: 0.28,
        filter: 'bandpass',
        q0: 1300 * k,
        q1: 4200 * k,
        Q: 1.3,
        sweep: 0.3,
      });
      air(c, { t: 0.05, a: 0.1, dur: 0.36, gain: 0.2, filter: 'highpass', q0: 6000 });
      air(c, { color: 'brown', a: 0.1, dur: 0.4, gain: 0.16, filter: 'lowpass', q0: 350 });
      sparks(c, { t: 0.05, dur: 0.35, count: 12, freq: 7000, gain: 0.5 });
      [100, 103].forEach((m) => {
        osc(c, { t: c.rng.range(0.05, 0.25), f0: mtof(m) * k, dur: 0.12, gain: 0.2 });
      });
    },
  },
  'fire.frostblade': {
    duration: 0.42,
    variants: 3,
    gainDb: -16,
    pitchVar: 0.05,
    maxVoices: 2,
    cooldownMs: 100,
    priority: 1,
    build(c) {
      const k = vary(c, 0.05);
      // Lame lancée : sifflement aller-retour (la hauteur monte puis revient), air tranché.
      osc(c, { f0: 1800 * k, a: 0.06, hold: 0.1, dur: 0.34, gain: 0.2, vibrato: [1 / 0.68, 5] });
      air(c, {
        a: 0.1,
        dur: 0.34,
        gain: 0.18,
        filter: 'bandpass',
        q0: 3000 * k,
        q1: 5200 * k,
        Q: 2.5,
        sweep: 0.2,
      });
      bell(c, 0, mtof(100) * k, 0.16, 0.22);
    },
  },

  // ─── Armes : foudre ────────────────────────────────────────────────────────────────────
  'fire.railgun': {
    duration: 0.42,
    variants: 3,
    gainDb: -14,
    pitchVar: 0.04,
    maxVoices: 2,
    cooldownMs: 120,
    priority: 1,
    build(c) {
      const k = vary(c, 0.05);
      const d = drive(0.7, lowpass(6500, c.out));
      // Décharge de rail : claquement d'amorçage, puis faisceau soutenu qui grésille.
      thump(c, 0, 170 * k, 60, 0.1, 0.25);
      air(c, { dur: 0.03, a: 0.0005, gain: 0.8, filter: 'highpass', q0: 3000 });
      osc(c, {
        type: 'sawtooth',
        f0: 260 * k,
        f1: 880 * k,
        sweep: 0.05,
        a: 0.01,
        hold: 0.2,
        dur: 0.34,
        gain: 0.2,
        vibrato: [42, 1.5],
        to: d,
      });
      osc(c, {
        type: 'sawtooth',
        f0: 262 * k,
        f1: 890 * k,
        sweep: 0.05,
        a: 0.01,
        hold: 0.2,
        dur: 0.34,
        gain: 0.14,
        detune: 14,
        to: d,
      });
      sparks(c, { t: 0.03, dur: 0.3, count: 16, freq: 5200, gain: 0.75 });
    },
  },
  'fire.voltdisc': {
    duration: 0.42,
    variants: 3,
    gainDb: -15,
    pitchVar: 0.05,
    maxVoices: 2,
    cooldownMs: 100,
    priority: 1,
    build(c) {
      const k = vary(c, 0.06);
      const d = drive(0.5, lowpass(6500, c.out));
      // Disque : toupie électrique qui file aller-retour, ronflement rapide et grésillement.
      osc(c, {
        type: 'sawtooth',
        f0: 660 * k,
        f1: 820 * k,
        a: 0.04,
        hold: 0.14,
        dur: 0.34,
        gain: 0.2,
        vibrato: [40, 2.2],
        to: d,
      });
      osc(c, { f0: 1300 * k, a: 0.05, hold: 0.1, dur: 0.34, gain: 0.1, vibrato: [1 / 0.68, 7] });
      air(c, { a: 0.1, dur: 0.3, gain: 0.18, filter: 'bandpass', q0: 3000, Q: 2 });
      sparks(c, { t: 0.02, dur: 0.3, count: 12, freq: 5600, gain: 0.6 });
    },
  },
  'fire.discharge': {
    duration: 0.42,
    variants: 3,
    gainDb: -13,
    pitchVar: 0.04,
    maxVoices: 2,
    cooldownMs: 140,
    priority: 1,
    build(c) {
      const k = vary(c, 0.06);
      const d = drive(0.6, lowpass(7000, c.out));
      // Décharge : choc grave, arc qui s'élargit (balayage montant), grêle de crépitements.
      thump(c, 0, 190 * k, 50, 0.28, 0.2);
      osc(c, {
        type: 'sawtooth',
        f0: 240 * k,
        f1: 4200 * k,
        sweep: 0.13,
        a: 0.005,
        dur: 0.2,
        gain: 0.18,
        to: d,
      });
      air(c, {
        a: 0.02,
        dur: 0.22,
        gain: 0.22,
        filter: 'bandpass',
        q0: 1200,
        q1: 6500,
        Q: 1.4,
        sweep: 0.15,
      });
      sparks(c, { t: 0.02, dur: 0.28, count: 18, freq: 4800, gain: 0.35 });
    },
  },
  'fire.storm': {
    duration: 0.46,
    variants: 3,
    gainDb: -13,
    pitchVar: 0.05,
    maxVoices: 3,
    cooldownMs: 80,
    priority: 1,
    build(c) {
      const k = vary(c, 0.08);
      const d = drive(0.55, lowpass(8000, c.out));
      // Foudre au sol : claquement sec, zip descendant, grondement court.
      air(c, { dur: 0.05, a: 0.0005, gain: 0.8, filter: 'highpass', q0: 1800, to: d });
      osc(c, {
        type: 'square',
        f0: 2400 * k,
        f1: 260,
        sweep: 0.08,
        dur: 0.1,
        gain: 0.09,
        to: d,
      });
      air(c, {
        color: 'brown',
        t: 0.01,
        a: 0.005,
        dur: 0.4,
        gain: 0.3,
        filter: 'lowpass',
        q0: 1200,
        q1: 110,
      });
      thump(c, 0, 110 * k, 40, 0.25, 0.25);
      sparks(c, { t: 0.03, dur: 0.3, count: 12, freq: 5000, gain: 0.3 });
    },
  },

  // ─── Armes : poison ────────────────────────────────────────────────────────────────────
  'fire.acidpool': {
    duration: 0.45,
    variants: 4,
    gainDb: -16,
    pitchVar: 0.06,
    maxVoices: 3,
    cooldownMs: 80,
    priority: 1,
    build(c) {
      const k = vary(c, 0.08);
      // Flaque : clapotis gras, bulles qui éclatent, grésillement d'acide.
      air(c, {
        a: 0.01,
        dur: 0.24,
        gain: 0.3,
        filter: 'bandpass',
        q0: 1000 * k,
        q1: 300,
        Q: 1,
      });
      thump(c, 0, 140 * k, 65, 0.16, 0.2);
      for (let i = 0; i < 4; i++) {
        bubble(c, 0.02 + i * 0.06 + c.rng.range(0, 0.04), c.rng.range(230, 430) * k, 0.25);
      }
      air(c, { t: 0.04, a: 0.03, dur: 0.32, gain: 0.08, filter: 'highpass', q0: 5500 });
      sparks(c, { t: 0.05, dur: 0.3, count: 14, freq: 6500, gain: 0.12 });
    },
  },
  'fire.miasma': {
    duration: 0.5,
    variants: 3,
    gainDb: -19,
    pitchVar: 0.05,
    maxVoices: 2,
    cooldownMs: 150,
    priority: 1,
    build(c) {
      const k = vary(c, 0.06);
      // Miasme : souffle gras et tiède, bulles lointaines, lente glissade vers le grave.
      air(c, {
        color: 'pink',
        a: 0.16,
        dur: 0.42,
        gain: 0.3,
        filter: 'bandpass',
        q0: 450 * k,
        q1: 1200 * k,
        Q: 0.8,
        sweep: 0.25,
      });
      osc(c, {
        type: 'triangle',
        f0: 330 * k,
        f1: 150,
        a: 0.1,
        dur: 0.4,
        gain: 0.13,
        vibrato: [7, 0.8],
      });
      bubble(c, 0.12 + c.rng.range(0, 0.06), 300 * k, 0.2);
      bubble(c, 0.26 + c.rng.range(0, 0.06), 210 * k, 0.17);
    },
  },
  'fire.wasps': {
    duration: 0.42,
    variants: 4,
    gainDb: -16,
    pitchVar: 0.06,
    maxVoices: 3,
    cooldownMs: 70,
    priority: 1,
    build(c) {
      const k = vary(c, 0.07);
      const buzz = lowpass(3200, c.out, 1);
      // Essaim : bourdonnement qui décolle, bulle de venin, glissade toxique vers le grave.
      osc(c, {
        type: 'sawtooth',
        f0: 210 * k,
        f1: 520 * k,
        sweep: 0.16,
        a: 0.01,
        dur: 0.3,
        gain: 0.2,
        vibrato: [46, 1.6],
        to: buzz,
      });
      osc(c, {
        type: 'sawtooth',
        f0: 216 * k,
        f1: 540 * k,
        sweep: 0.16,
        a: 0.01,
        dur: 0.3,
        gain: 0.15,
        detune: 25,
        vibrato: [52, 1.4],
        to: buzz,
      });
      air(c, { a: 0.02, dur: 0.28, gain: 0.16, filter: 'bandpass', q0: 1700 * k, Q: 3 });
      bubble(c, 0, 320 * k, 0.3);
      osc(c, { t: 0.1, f0: 800 * k, f1: 200, dur: 0.24, gain: 0.12, vibrato: [14, 1.5] });
    },
  },
  'fire.venomscythe': {
    duration: 0.46,
    variants: 3,
    gainDb: -16,
    pitchVar: 0.05,
    maxVoices: 2,
    cooldownMs: 100,
    priority: 1,
    build(c) {
      const k = vary(c, 0.06);
      // Faux : sifflement gras aller-retour, traînée gluante qui glisse vers le grave.
      osc(c, {
        type: 'triangle',
        f0: 520 * k,
        a: 0.07,
        hold: 0.12,
        dur: 0.38,
        gain: 0.25,
        vibrato: [1 / 0.76, 6],
      });
      air(c, {
        color: 'pink',
        a: 0.12,
        dur: 0.36,
        gain: 0.25,
        filter: 'bandpass',
        q0: 1300 * k,
        q1: 700,
        Q: 1.4,
      });
      osc(c, { t: 0.05, f0: 380 * k, f1: 130, dur: 0.3, gain: 0.22, vibrato: [11, 1.5] });
      bubble(c, 0.02, 260 * k, 0.4);
    },
  },
  'fire.parasite': {
    duration: 0.34,
    variants: 4,
    gainDb: -15,
    pitchVar: 0.06,
    maxVoices: 3,
    cooldownMs: 60,
    priority: 1,
    build(c) {
      const k = vary(c, 0.08);
      // Lien : trois bulles qui filent de proie en proie, succion visqueuse descendante.
      [0, 0.045, 0.09].forEach((t, i) => {
        bubble(c, t, 340 * k * 1.3 ** i, 0.3);
      });
      osc(c, {
        f0: 950 * k,
        f1: 210,
        t: 0.02,
        sweep: 0.24,
        dur: 0.28,
        gain: 0.2,
        vibrato: [15, 3],
      });
      air(c, {
        color: 'pink',
        t: 0.02,
        dur: 0.22,
        gain: 0.22,
        filter: 'bandpass',
        q0: 2000 * k,
        q1: 400,
        Q: 1.2,
      });
      thump(c, 0, 150 * k, 70, 0.1, 0.18);
    },
  },

  // ─── Armes : arcane ────────────────────────────────────────────────────────────────────
  'fire.runes': {
    duration: 0.4,
    variants: 3,
    gainDb: -18,
    pitchVar: 0.04,
    maxVoices: 2,
    cooldownMs: 120,
    priority: 1,
    build(c) {
      const base = mtof(c.rng.pick([76, 79, 81]));
      // Sphères runiques : carillon chaud (FM douce), frôlement d'air, scintillement.
      fm(c, { f0: base, harmonicity: 2, index: 2.5, index1: 0, dur: 0.34, gain: 0.28 });
      fm(c, {
        t: 0.06,
        f0: base * 1.5,
        harmonicity: 2,
        index: 2,
        index1: 0,
        dur: 0.26,
        gain: 0.18,
      });
      osc(c, { t: 0.1, f0: base * 4, dur: 0.16, gain: 0.1, vibrato: [14, 0.8] });
      air(c, { a: 0.05, dur: 0.16, gain: 0.1, filter: 'bandpass', q0: 1500, q1: 3200, Q: 2 });
    },
  },
  'fire.prismray': {
    duration: 0.48,
    variants: 3,
    gainDb: -16,
    pitchVar: 0.04,
    maxVoices: 2,
    cooldownMs: 110,
    priority: 1,
    build(c) {
      const f = mtof(c.rng.pick([69, 72, 74]) + 12);
      // Rayon prismatique : un son qui se scinde en trois (réfraction), sustain court.
      [2 / 3, 1, 3 / 2].forEach((r, i) => {
        fm(c, {
          f0: f,
          f1: f * r,
          sweep: 0.3,
          harmonicity: 2,
          index: 2,
          index1: 1,
          a: 0.01,
          hold: 0.22,
          dur: 0.38,
          gain: 0.2,
          detune: (i - 1) * 6,
        });
      });
      osc(c, { f0: 500, f1: 2400, sweep: 0.05, dur: 0.07, gain: 0.3 });
      air(c, { a: 0.1, dur: 0.3, gain: 0.12, filter: 'highpass', q0: 7000 });
    },
  },
  'fire.missiles': {
    duration: 0.36,
    variants: 4,
    gainDb: -15,
    pitchVar: 0.05,
    maxVoices: 3,
    cooldownMs: 60,
    priority: 1,
    build(c) {
      const k = vary(c, 0.07);
      // Missiles : deux traits FM qui s'envolent, traînée de poussière d'étoiles.
      fm(c, {
        f0: 420 * k,
        f1: 1900 * k,
        sweep: 0.09,
        harmonicity: 1.5,
        index: 3,
        index1: 0.5,
        dur: 0.14,
        gain: 0.28,
      });
      fm(c, {
        t: 0.06,
        f0: 560 * k,
        f1: 2400 * k,
        sweep: 0.09,
        harmonicity: 1.5,
        index: 3,
        index1: 0.5,
        dur: 0.14,
        gain: 0.22,
      });
      air(c, {
        a: 0.03,
        dur: 0.2,
        gain: 0.14,
        filter: 'bandpass',
        q0: 800,
        q1: 4200,
        Q: 1.5,
        sweep: 0.18,
      });
      osc(c, { t: 0.08, f0: mtof(96) * k, dur: 0.2, gain: 0.08, vibrato: [13, 1] });
      thump(c, 0, 180 * k, 90, 0.06, 0.2);
    },
  },
  'fire.sigil': {
    duration: 0.6,
    variants: 3,
    gainDb: -14,
    pitchVar: 0.04,
    maxVoices: 2,
    cooldownMs: 140,
    priority: 1,
    build(c) {
      const root = mtof(c.rng.pick([60, 62, 64]) + 12);
      // Sceau : impulsion sourde, accord de cloches FM qui s'ouvre, anneau lumineux.
      thump(c, 0, 150, 60, 0.2, 0.25);
      [1, 1.5, 2].forEach((r, i) => {
        bell(c, i * 0.02, root * r, 0.42, 0.18, 2, 3);
      });
      air(c, {
        a: 0.05,
        dur: 0.3,
        gain: 0.18,
        filter: 'bandpass',
        q0: 700,
        q1: 5200,
        Q: 1.5,
        sweep: 0.25,
      });
      bell(c, 0.04, mtof(96), 0.3, 0.08, 3.5, 4);
    },
  },
  'fire.glyphs': {
    duration: 0.34,
    variants: 3,
    gainDb: -16,
    pitchVar: 0.04,
    maxVoices: 3,
    cooldownMs: 90,
    priority: 1,
    build(c) {
      const k = vary(c, 0.04);
      // Glyphes : clic de pose, choc mat, deux notes de cristal montantes (activation).
      air(c, { dur: 0.01, a: 0.0005, gain: 0.55, filter: 'bandpass', q0: 3000, Q: 2 });
      thump(c, 0.005, 260 * k, 120, 0.07, 0.22);
      bell(c, 0.03, mtof(79) * k, 0.2, 0.22, 3.5, 3);
      bell(c, 0.09, mtof(86) * k, 0.22, 0.22, 3.5, 3);
    },
  },

  // ─── Armes : vide ──────────────────────────────────────────────────────────────────────
  'fire.voidshard': {
    duration: 0.4,
    variants: 4,
    gainDb: -14,
    pitchVar: 0.05,
    maxVoices: 3,
    cooldownMs: 50,
    priority: 1,
    build(c) {
      const k = vary(c, 0.06);
      const d = drive(0.4, lowpass(2200, c.out));
      // Éclat du vide : chute vers le grave, souffle sombre aspiré, choc sourd.
      osc(c, { type: 'sawtooth', f0: 720 * k, f1: 70, sweep: 0.25, dur: 0.3, gain: 0.2, to: d });
      thump(c, 0, 160 * k, 45, 0.28, 0.15, drive(0.35, c.out));
      air(c, {
        color: 'brown',
        a: 0.02,
        dur: 0.24,
        gain: 0.3,
        filter: 'lowpass',
        q0: 1800 * k,
        q1: 200,
      });
    },
  },
  'fire.singularity': {
    duration: 0.42,
    variants: 3,
    gainDb: -16,
    pitchVar: 0.04,
    maxVoices: 3,
    cooldownMs: 90,
    priority: 1,
    build(c) {
      const k = vary(c, 0.06);
      // Singularité : bulle sous-marine qui s'enfonce, souffle inversé qui aspire.
      osc(c, { f0: 420 * k, f1: 120, sweep: 0.05, dur: 0.05, gain: 0.4 });
      thump(c, 0.01, 190 * k, 46, 0.3, 0.18, drive(0.3, c.out));
      air(c, {
        color: 'brown',
        t: 0.05,
        a: 0.22,
        dur: 0.24,
        gain: 0.3,
        filter: 'bandpass',
        q0: 250,
        q1: 1400,
        Q: 1.2,
        sweep: 0.22,
      });
    },
  },
  'fire.horizon': {
    duration: 0.46,
    variants: 3,
    gainDb: -18,
    pitchVar: 0.04,
    maxVoices: 2,
    cooldownMs: 150,
    priority: 1,
    build(c) {
      const k = vary(c, 0.05);
      // Horizon : inspiration creuse (souffle inversé dans un tunnel), pulsation grave dessous.
      air(c, {
        a: 0.26,
        dur: 0.29,
        gain: 0.3,
        filter: 'bandpass',
        q0: 300 * k,
        q1: 1000 * k,
        Q: 1.1,
        sweep: 0.26,
      });
      osc(c, {
        f0: 66 * k,
        f1: 48,
        a: 0.16,
        hold: 0.1,
        dur: 0.38,
        gain: 0.1,
        to: drive(0.35, c.out),
      });
      osc(c, {
        type: 'triangle',
        f0: 150 * k,
        f1: 90,
        a: 0.18,
        dur: 0.36,
        gain: 0.15,
        vibrato: [5, 0.8],
      });
    },
  },
  'fire.entropyray': {
    duration: 0.48,
    variants: 3,
    gainDb: -15,
    pitchVar: 0.04,
    maxVoices: 2,
    cooldownMs: 110,
    priority: 1,
    build(c) {
      const k = vary(c, 0.05);
      const lp = lowpass(1600, drive(0.5, c.out), 3);
      lp.frequency.setValueAtTime(3200, 0);
      lp.frequency.exponentialRampToValueAtTime(300, 0.4);
      // Rayon d'entropie : faisceau grave (quinte sombre) qui se désagrège, le filtre se ferme.
      [
        [110, 0.22],
        [165, 0.16],
      ].forEach(([f, gain], i) => {
        osc(c, {
          type: 'sawtooth',
          f0: f * k,
          a: 0.01,
          hold: 0.2,
          dur: 0.4,
          gain,
          detune: i * 12,
          vibrato: [9, 0.8],
          to: lp,
        });
      });
      osc(c, { f0: 55 * k, f1: 44, a: 0.01, hold: 0.2, dur: 0.4, gain: 0.1 });
      air(c, {
        color: 'brown',
        a: 0.02,
        dur: 0.38,
        gain: 0.15,
        filter: 'lowpass',
        q0: 900,
        q1: 150,
      });
      osc(c, { f0: 1400 * k, f1: 220, dur: 0.3, gain: 0.06 });
    },
  },
  'fire.voidlink': {
    duration: 0.36,
    variants: 4,
    gainDb: -15,
    pitchVar: 0.06,
    maxVoices: 3,
    cooldownMs: 60,
    priority: 1,
    build(c) {
      const k = vary(c, 0.08);
      // Lien du néant : élastique sombre qui se tend, claquement sec, glissando sous-marin.
      fm(c, {
        f0: 340 * k,
        f1: 65,
        sweep: 0.26,
        harmonicity: 0.5,
        index: 6,
        index1: 1,
        dur: 0.3,
        gain: 0.3,
      });
      air(c, { dur: 0.012, gain: 0.45, filter: 'bandpass', q0: 1500, Q: 2 });
      air(c, {
        color: 'brown',
        a: 0.02,
        dur: 0.26,
        gain: 0.3,
        filter: 'lowpass',
        q0: 700,
        q1: 120,
      });
    },
  },

  // ─── Impacts ───────────────────────────────────────────────────────────────────────────
  hit: {
    duration: 0.12,
    variants: 4,
    gainDb: -17,
    pitchVar: 0.08,
    maxVoices: 4,
    cooldownMs: 40,
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
    cooldownMs: 40,
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
    cooldownMs: 40,
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
    cooldownMs: 40,
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
