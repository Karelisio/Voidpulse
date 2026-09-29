/**
 * 02-03 — Forêt brumeuse (calme / intense). Mi dorien, 100 BPM.
 * Identité : sixte dorienne (do#) mise en valeur par la flûte, gouttes d'eau en plucks FM,
 * nappes « mousse » et brume de bruit rose. Les deux versions partagent grille, mélodie
 * et points de boucle : elles tournent en phase et se croisent par simple jeu de gains.
 */
import * as Tone from 'tone';
import {
  arpBar,
  bassBar,
  chordTones,
  chordAt,
  drumBar,
  type DrumBar,
  harmonizeBelow,
  hitTimes,
  playChords,
  playPhrase,
  progression,
  range,
  voicings,
} from '../lib/arrange';
import { DrumKit, riser } from '../lib/drums';
import { chain, hp, ramp, reverb, sidechainGain } from '../lib/fx';
import {
  bassSynth,
  flute,
  fmPoly,
  leadSynth,
  noiseBed,
  seqSynth,
  superSawPad,
} from '../lib/instruments';
import { type NoteEvent, phrase } from '../lib/notation';
import { Grid, Humanizer } from '../lib/time';
import type { LayerContext, TrackDef } from '../lib/types';

const GRID = new Grid(100);
const BARS = range(0, 36);
const inRange = (bar: number, from: number, to: number): boolean => bar >= from && bar < to;

// prettier-ignore
const CHORDS = [
  // Intro (se termine comme la boucle, sur la dominante)
  'Em9', 'A/E', 'Cmaj7', 'B7sus4 B7',
  // A1 : dorien, la sixte (do#) portée par A/E
  'Em9', 'A/E', 'G', 'D/F#', 'Em9', 'A/E', 'G', 'D/F#',
  // A2
  'Em9', 'A/E', 'G', 'D/F#', 'Cmaj7', 'D', 'Em9', 'A/E',
  // B1 : couleur éolienne (do naturel), plus sombre
  'Cmaj7', 'D', 'Bm7', 'Em9', 'Cmaj7', 'D', 'Em9', 'Em9',
  // B2 : retour vers la dominante
  'Cmaj7', 'D', 'Bm7', 'Em9', 'Am9', 'D', 'Cmaj7', 'B7sus4 B7',
];
const SLOTS = progression(CHORDS);

// Flûte : thème de la forêt (une ligne par mesure).
const MELODY: NoteEvent[] = phrase(`
  _:16 | _:16 | _:16 | _:8 D#5:8 |
  B4:4 E5:2 F#5:2 G5:4 F#5:2 E5:2 | C#5:8 B4:4 A4:4 | B4:6 D5:2 E5:8 | F#5:4 E5:4 D5:4 C#5:4 |
  B4:4 E5:2 F#5:2 G5:4 A5:2 B5:2 | C#6:8 B5:4 A5:4 | B5:6 A5:2 G5:4 D5:4 | F#5:6 E5:2 D5:4 C#5:4 |
  B4:4 E5:2 F#5:2 G5:4 F#5:2 E5:2 | C#5:6 B4:2 C#5:4 E5:4 | D5:6 E5:2 G5:8 | F#5:8 A5:4 F#5:4 |
  G5:8 E5:4 B4:4 | A4:4 D5:4 F#5:8 | G5:4 F#5:2 E5:2 B4:8 | C#5:12 _:4 |
  E5:6 D5:2 E5:4 G5:4 | F#5:8 E5:4 D5:4 | D5:6 C#5:2 B4:8 | B4:4 E5:4 G5:4 F#5:4 |
  E5:6 D5:2 E5:4 B5:4 | A5:8 F#5:4 D5:4 | G5:6 F#5:2 E5:8 | B4:8 _:8 |
  E5:6 D5:2 E5:4 G5:4 | F#5:8 A5:4 F#5:4 | B5:6 A5:2 F#5:8 | G5:4 F#5:4 E5:8 |
  C5:6 B4:2 C5:4 E5:4 | F#5:6 E5:2 D5:4 A4:4 | E5:8 G5:4 B5:4 | A5:6 F#5:2 D#5:8
`);

const barOf = (ev: NoteEvent): number => Math.floor(ev.step / 16);
/** Seconde voix (notes de l'accord sous la flûte) en B2 dans la version intense. */
const HARMONY = harmonizeBelow(
  MELODY.filter((ev) => inRange(barOf(ev), 28, 32)),
  SLOTS,
);

// --- Batterie -----------------------------------------------------------------------------

const FILL_BARS = new Set([11, 19, 27, 35]);

function calmDrums(bar: number): DrumBar {
  if (bar < 4) return {};
  const b = inRange(bar, 20, 36);
  const p: DrumBar = {
    kick: b ? 'x.......x.......' : 'x...............',
    rim: '....x.......x...',
    shaker: 'xoxoxoxoxoxoxoxo',
  };
  if (FILL_BARS.has(bar)) p.rim = '....x.......x.xx';
  return p;
}

function intenseDrums(bar: number): DrumBar {
  if (bar < 3) return {};
  if (bar === 3) return { toms: '........1.2.3.44', snare: '............X.XX' };
  const b1 = inRange(bar, 20, 28);
  const p: DrumBar = {
    kick: b1 ? 'x.....x.x.....x.' : 'x.....x.x.......',
    snare: '....X.......X...',
    hat: 'xoxoxoxoxoxoxoxo',
    shaker: '..x...x...x...x.',
  };
  if (inRange(bar, 12, 20) || inRange(bar, 28, 36)) p.openHat = '..............x.';
  if ([4, 12, 20, 28].includes(bar)) p.crash = 'X...............';
  if (FILL_BARS.has(bar)) {
    p.hat = 'xoxoxoxo........';
    p.toms = bar === 19 || bar === 35 ? '........11223344' : '..........2.3.44';
    if (bar === 35) p.snare = '....X...........';
  }
  return p;
}

const CALM_KICKS = hitTimes(GRID, BARS, (b) => calmDrums(b).kick);
const INTENSE_KICKS = hitTimes(GRID, BARS, (b) => intenseDrums(b).kick);
const INTENSE_SNARES = hitTimes(GRID, BARS, (b) => intenseDrums(b).snare);

// --- Couches partagées ----------------------------------------------------------------------

/** Nappes « mousse » : scies filtrées au filtre lentement ondulant, brume de bruit rose. */
async function pads({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 5, 0.05);
  const pad = superSawPad({
    volume: -17,
    cutoff: intense ? 2600 : 1900,
    count: 3,
    spread: intense ? 34 : 24,
    env: { attack: intense ? 0.4 : 1.1, release: 2.8 },
  });
  const auto = new Tone.AutoFilter({
    frequency: grid.bpm / 60 / 8, // un cycle toutes les deux mesures
    baseFrequency: intense ? 900 : 500,
    octaves: 2,
    depth: 0.6,
    wet: 1,
    filter: { type: 'lowpass', rolloff: -12, Q: 0.8 },
  }).start(0);
  const chorus = new Tone.Chorus({
    frequency: 0.5,
    delayTime: 4,
    depth: 0.7,
    spread: 180,
    wet: 0.5,
  }).start(0);
  const rev = await reverb(6, intense ? 0.38 : 0.48);
  const sc = sidechainGain(intense ? INTENSE_KICKS : CALM_KICKS, intense ? 0.32 : 0.12, 0.28);
  chain(pad.output, hp(100), auto, chorus, rev, sc, out);
  const voiced = voicings(SLOTS, { low: 52, high: 79, center: 64, maxNotes: 4 });
  playChords(pad, grid, SLOTS, voiced, { hum, vel: 0.66, overlap: 0.2 });
  if (intense) {
    // Doublure aiguë (cordes synthétiques) pour l'élan.
    const air = superSawPad({
      volume: -25,
      cutoff: 5200,
      count: 2,
      spread: 18,
      env: { attack: 0.5, release: 2 },
    });
    air.output.connect(chorus);
    playChords(
      air,
      grid,
      SLOTS,
      voiced.map((v) => v.map((n) => n + 12)),
      { hum, vel: 0.55, overlap: 0.2, from: 4 },
    );
  }
  // Brume : bruit rose en passe-bande mouvant, du début à la fin.
  const mist = noiseBed({
    volume: intense ? -38 : -33,
    center: 700,
    octaves: 3,
    rate: 0.03,
    q: 1.5,
  });
  mist.output.connect(rev);
  mist.start(0, grid.t(36) + 1, 0.8);
}

/** Gouttes d'eau : plucks FM épars (calme) ou arpège continu + gouttes (intense). */
async function arp({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 3, 0.12);
  const drops = fmPoly({
    volume: -17,
    harmonicity: 3,
    modulationIndex: 9,
    env: { decay: 0.5, release: 0.5 },
    modEnv: { decay: 0.12 },
  });
  const delay = new Tone.PingPongDelay({ delayTime: grid.beats(0.75), feedback: 0.38, wet: 0.35 });
  const rev = await reverb(4, 0.35);
  chain(drops.output, hp(220), delay, rev, out);

  // Positions des gouttes : semi-aléatoires mais seedées, plus denses dans la version intense.
  for (const bar of BARS) {
    const count = bar < 4 ? 3 : intense ? 5 : 4;
    const used = new Set<number>();
    for (let i = 0; i < count; i++) {
      let step = rng.int(16);
      while (used.has(step)) step = (step + 3) % 16;
      used.add(step);
      const tones = chordTones(chordAt(SLOTS, bar, step), 76, 6);
      const note = tones[rng.int(tones.length)];
      drops.play(
        [note],
        hum.time(grid.t(bar, step)),
        grid.dur(2),
        hum.vel(0.55 + rng.next() * 0.35),
      );
    }
  }

  if (intense) {
    const seq = seqSynth({
      volume: -20,
      type: 'triangle',
      cutoff: 3200,
      env: { decay: 0.12, sustain: 0.1 },
    });
    const seqDelay = new Tone.FeedbackDelay({
      delayTime: grid.beats(0.5),
      feedback: 0.25,
      wet: 0.2,
    });
    chain(seq.output, hp(180), seqDelay, rev);
    ramp(seq.filter.frequency, 800, 3200, grid.t(3), grid.t(4));
    for (const bar of range(4, 36)) {
      arpBar(seq, grid, SLOTS, bar, {
        low: 64,
        count: 5,
        pattern: [0, 2, 1, 3, 2, 4, 3, 1],
        rate: 1,
        gate: 0.6,
        vel: (s) => (s % 4 === 0 ? 0.8 : s % 2 === 0 ? 0.6 : 0.45),
        hum,
      });
    }
  }
}

/** Basse ronde (calme) ou basse outrun en croches (intense). */
function bass({ grid, out, rng }: LayerContext, intense: boolean): void {
  const hum = new Humanizer(rng, 2, 0.05);
  const synth = intense
    ? bassSynth({ volume: -12, cutoff: 190, octaves: 3.2, decay: 0.17, q: 2.2, sub: -3 })
    : bassSynth({
        volume: -12,
        type: 'square',
        cutoff: 140,
        octaves: 1.4,
        decay: 0.3,
        q: 0.8,
        sub: 0,
        env: { attack: 0.02 },
      });
  chain(
    synth.output,
    sidechainGain(intense ? INTENSE_KICKS : CALM_KICKS, intense ? 0.45 : 0.15, 0.2),
    out,
  );
  for (const bar of BARS) {
    let pattern: string;
    if (!intense) pattern = bar < 4 ? 'L---------------' : 'L-------5-------';
    else if (bar < 3) pattern = 'L---------------';
    else if (bar === 3) pattern = 'L-------L-H-L-H-';
    else if (FILL_BARS.has(bar)) pattern = 'L-H-L-H-L-5-H-5-';
    else pattern = inRange(bar, 20, 28) ? 'L--L--H-L--L--H-' : 'L-H-L-H-L-H-L-H-';
    bassBar(synth, grid, SLOTS, bar, pattern, {
      low: 35,
      hum,
      vel: intense ? 0.8 : 0.7,
      accents: [0, 8],
      gate: intense ? 0.8 : 0.95,
    });
  }
}

/** Flûte (calme) ; doublée d'un lead scie à l'octave inférieure et harmonisée en B2 (intense). */
async function lead({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 7, 0.08);
  const fl = flute({ volume: -12, breath: intense ? -22 : -18 });
  const vibrato = new Tone.Vibrato({ frequency: 5, depth: 0.08 });
  const delay = new Tone.FeedbackDelay({ delayTime: grid.beats(0.75), feedback: 0.3, wet: 0.2 });
  const rev = await reverb(4.5, intense ? 0.3 : 0.38);
  chain(fl.output, hp(180), vibrato, delay, rev, out);
  playPhrase(fl, grid, MELODY, 0, { hum, gate: 0.96 });
  if (intense) {
    const saw = leadSynth({
      volume: -21,
      type: 'fatsawtooth',
      count: 2,
      spread: 10,
      cutoff: 700,
      octaves: 2.4,
      portamento: 0.02,
    });
    saw.output.connect(delay);
    playPhrase(
      saw,
      grid,
      MELODY.filter((ev) => barOf(ev) >= 4),
      0,
      { hum, gate: 0.92, transpose: -12, vel: 0.85 },
    );
    const harm = flute({ volume: -19, breath: -24 });
    harm.output.connect(vibrato);
    playPhrase(harm, grid, HARMONY, 0, { hum, gate: 0.94 });
  }
}

async function drums({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 3, 0.1);
  const kit = await DrumKit.create(out, {
    gatedHold: intense ? 0.24 : 0,
    snareTimes: INTENSE_SNARES,
    drive: intense ? 0.1 : 0,
    kickDecay: intense ? 0.42 : 0.35,
    kickPitch: intense ? 50 : 55,
    levels: intense ? {} : { kick: -6, shaker: -21, rim: -14 },
    clipDrive: intense ? 4 : 8,
    roomDecay: intense ? 1.4 : 2.2,
    roomWet: intense ? 0.18 : 0.3,
  });
  for (const bar of BARS)
    drumBar(kit, grid, bar, intense ? intenseDrums(bar) : calmDrums(bar), hum);
  if (intense) riser(out, grid.t(2), grid.t(4), -22);
}

const MIX = { drums: -5.5, bass: -6.5, lead: -6, pads: -8, arp: -10.5 };

export const foretCalm: TrackDef = {
  id: 'stage1-calm',
  title: 'Forêt brumeuse — calme',
  bpm: 100,
  key: 'Mi dorien',
  introBars: 4,
  loopBars: 32,
  tailSeconds: 7,
  group: 'stage1',
  mix: { ...MIX, drums: -7 },
  layers: {
    pads: { enterAt: 0, build: (ctx) => pads(ctx, false) },
    bass: {
      enterAt: 0,
      build: (ctx) => {
        bass(ctx, false);
      },
    },
    arp: { enterAt: 0, build: (ctx) => arp(ctx, false) },
    drums: { enterAt: 1, build: (ctx) => drums(ctx, false) },
    lead: { enterAt: 2, build: (ctx) => lead(ctx, false) },
  },
};

export const foretIntense: TrackDef = {
  ...foretCalm,
  id: 'stage1-intense',
  title: 'Forêt brumeuse — intense',
  mix: { ...MIX, drums: -5, pads: -9 },
  layers: {
    pads: { enterAt: 0, build: (ctx) => pads(ctx, true) },
    bass: {
      enterAt: 0,
      build: (ctx) => {
        bass(ctx, true);
      },
    },
    arp: { enterAt: 0, build: (ctx) => arp(ctx, true) },
    drums: { enterAt: 0, build: (ctx) => drums(ctx, true) },
    lead: { enterAt: 0, build: (ctx) => lead(ctx, true) },
  },
};
