/**
 * 04-05 — Désert de verre (calme / intense). Ré phrygien dominant, 112 BPM.
 * Identité : seconde augmentée mi♭–fa# du lead serpentin (portamento), cloches de verre FM,
 * nappe « chaleur » passée au phaser. Intense : toms façon darbouka, basse reese saturée.
 */
import * as Tone from 'tone';
import {
  arpBar,
  bassBar,
  chordAt,
  chordTones,
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
import { chain, hp, reverb, sidechainGain } from '../lib/fx';
import { bassSynth, fmPoly, leadSynth, noiseBed, superSawPad } from '../lib/instruments';
import { type NoteEvent, phrase } from '../lib/notation';
import { FILL_BARS, inRange, SECTION_BARS, stagePair, TOTAL_BARS } from '../lib/stage';
import { Grid, Humanizer } from '../lib/time';
import type { LayerContext } from '../lib/types';

const GRID = new Grid(112);
const BARS = range(0, TOTAL_BARS);

// prettier-ignore
const CHORDS = [
  'D', 'Eb', 'D', 'Eb D',
  'D', 'Eb', 'D', 'Cm', 'Gm', 'Eb', 'Cm', 'D',
  'D', 'Eb', 'D', 'Cm', 'Gm', 'Bb', 'Eb', 'D',
  'Gm', 'Cm', 'D', 'Gm', 'Eb', 'Cm', 'Eb', 'D',
  'Gm', 'Cm', 'Bb', 'Eb', 'Cm', 'Eb', 'D', 'Eb D',
];
const SLOTS = progression(CHORDS);

const HOOK = `
  D5:2 Eb5:2 F#5:6 G5:2 F#5:4 | Eb5:6 G5:2 Bb5:4 G5:4 | F#5:2 G5:2 A5:4 Bb5:4 A5:4 | G5:4 Eb5:4 C5:6 D5:2 |`;
const LEAD: NoteEvent[] = phrase(`
  _:16 | _:16 | _:16 | _:12 A4:4 |
  ${HOOK}
  D5:2 Eb5:2 F#5:6 G5:2 A5:4 | Bb5:8 G5:4 Eb5:4 | Eb5:4 D5:2 C5:2 Eb5:4 F#5:4 | D5:12 _:4 |
  ${HOOK}
  D6:4 C6:2 Bb5:2 A5:4 G5:4 | F#5:6 G5:2 D5:8 | Eb5:4 G5:4 Bb5:4 G5:2 Eb5:2 | F#5:8 Eb5:4 D5:4 |
  G4:6 Bb4:2 D5:8 | Eb5:6 D5:2 C5:8 | D5:4 Eb5:4 F#5:4 A5:4 | G5:12 _:4 |
  G5:6 Bb5:2 Eb6:8 | D6:4 C6:4 Bb5:4 G5:4 | Bb5:6 G5:2 Eb5:4 F#5:4 | A5:8 _:8 |
  D6:6 Bb5:2 G5:8 | Eb6:6 D6:2 C6:8 | D6:4 C6:4 Bb5:4 F#5:4 | G5:8 Eb5:8 |
  C5:2 D5:2 Eb5:4 F#5:6 Eb5:2 | D5:4 Eb5:4 G5:8 | F#5:4 Eb5:2 D5:2 C5:4 Eb5:4 | D5:8 _:4 A4:4
`);
const barOf = (ev: NoteEvent): number => Math.floor(ev.step / 16);
const HARMONY = harmonizeBelow(
  LEAD.filter((ev) => inRange(barOf(ev), 28, 36)),
  SLOTS,
);

// --- Batterie : darbouka (dum = tom grave, tek = rim) ---------------------------------------

function calmDrums(bar: number): DrumBar {
  if (bar < 4) return bar < 2 ? {} : { rim: '....x.......x.x.' };
  const p: DrumBar = {
    kick: 'x.........x.....',
    rim: '...x..x....x.x..',
    shaker: 'x.xox.xox.xox.xo',
    toms: '4.........4.....',
  };
  if (FILL_BARS.has(bar)) p.rim = '...x..x..x.xxxxx';
  return p;
}

function intenseDrums(bar: number): DrumBar {
  if (bar < 2) return { toms: bar === 0 ? '4.....4...4.....' : '4.....4...4.4.44' };
  if (bar < 4)
    return { kick: 'x.....x...x.....', toms: '4..2..4.1.2.4.21', rim: '...x..x....x.x..' };
  const p: DrumBar = {
    kick: inRange(bar, 20, 28) ? 'x.....x...x...x.' : 'x.....x...x.....',
    snare: '....X.......X...',
    hat: 'x.xox.xox.xox.xo',
    toms: '4..2..4.1.2.4...',
    rim: '...x......x..x..',
  };
  if (SECTION_BARS.has(bar)) p.crash = 'X...............';
  if (FILL_BARS.has(bar)) {
    p.toms = '4..2..4.11221144';
    p.hat = 'x.xox.xo........';
  }
  return p;
}

const CALM_KICKS = hitTimes(GRID, BARS, (b) => calmDrums(b).kick);
const INTENSE_KICKS = hitTimes(GRID, BARS, (b) => intenseDrums(b).kick);

// --- Couches ----------------------------------------------------------------------------------

async function pads({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 5, 0.05);
  const pad = superSawPad({
    volume: -17,
    cutoff: intense ? 2800 : 2100,
    count: 3,
    spread: 30,
    env: { attack: intense ? 0.35 : 0.9, release: 2.4 },
  });
  // Chaleur : phaser lent, comme l'air qui tremble au-dessus du sable.
  const phaser = new Tone.Phaser({ frequency: 0.18, octaves: 3, baseFrequency: 420, wet: 0.6 });
  const rev = await reverb(4.5, intense ? 0.3 : 0.4);
  const sc = sidechainGain(intense ? INTENSE_KICKS : CALM_KICKS, intense ? 0.3 : 0.1, 0.25);
  chain(pad.output, hp(110), phaser, rev, sc, out);
  const voiced = voicings(SLOTS, { low: 53, high: 77, center: 64, maxNotes: 4 });
  playChords(pad, grid, SLOTS, voiced, { hum, vel: 0.66, overlap: 0.2 });
  // Vent de sable : bruit rose en passe-bande, souffle continu.
  const wind = noiseBed({ volume: intense ? -36 : -32, center: 1100, octaves: 2.5, rate: 0.05 });
  wind.output.connect(rev);
  wind.start(0, grid.t(TOTAL_BARS) + 1, 0.8);
}

/** Cloches de verre : motif répété sur les notes de l'accord, en contretemps (hémiole 3+3+2). */
async function arp({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 3, 0.1);
  const glass = fmPoly({
    volume: -18,
    harmonicity: 3.5,
    modulationIndex: 11,
    env: { decay: 0.9, release: 0.9 },
    modEnv: { decay: 0.25 },
  });
  const delay = new Tone.PingPongDelay({ delayTime: grid.beats(0.75), feedback: 0.35, wet: 0.3 });
  const rev = await reverb(3.5, 0.3);
  chain(glass.output, hp(300), delay, rev, out);
  for (const bar of BARS) {
    const steps = intense && bar >= 4 ? [0, 3, 6, 8, 10, 13] : [0, 3, 6, 10];
    const tones = (step: number): number[] => chordTones(chordAt(SLOTS, bar, step), 74, 4);
    steps.forEach((step, i) => {
      const t = tones(step);
      glass.play(
        [t[i % t.length]],
        hum.time(grid.t(bar, step)),
        grid.dur(3),
        hum.vel(i === 0 ? 0.8 : 0.6),
      );
    });
  }
  if (intense) {
    // Ostinato de cithare (pluck FM) en doubles croches dans la section B.
    const pluck = fmPoly({
      volume: -22,
      harmonicity: 2,
      modulationIndex: 6,
      env: { decay: 0.25, release: 0.2 },
      modEnv: { decay: 0.08 },
    });
    chain(pluck.output, hp(250), rev);
    for (const bar of range(20, 36)) {
      arpBar(pluck, grid, SLOTS, bar, {
        low: 62,
        count: 4,
        pattern: [0, 1, 2, 1, 3, 2, 1, 2],
        rate: 1,
        gate: 0.5,
        vel: (s) => (s % 4 === 0 ? 0.75 : 0.5),
        hum,
      });
    }
  }
}

/** Basse : ronde et pointée (calme) ; reese saturée en croches (intense). */
function bass({ grid, out, rng }: LayerContext, intense: boolean): void {
  const hum = new Humanizer(rng, 2, 0.05);
  const synth = intense
    ? bassSynth({
        volume: -13,
        type: 'fatsawtooth',
        cutoff: 240,
        octaves: 2.6,
        decay: 0.25,
        q: 1.6,
        sub: -2,
      })
    : bassSynth({ volume: -12, cutoff: 150, octaves: 1.8, decay: 0.3, q: 1, sub: 0 });
  const sc = sidechainGain(intense ? INTENSE_KICKS : CALM_KICKS, intense ? 0.4 : 0.15, 0.2);
  if (intense) {
    const drive = new Tone.Distortion({ distortion: 0.4, oversample: '2x', wet: 0.4 });
    chain(synth.output, drive, new Tone.Filter({ type: 'lowpass', frequency: 2400 }), sc, out);
  } else {
    chain(synth.output, sc, out);
  }
  for (const bar of BARS) {
    let pattern: string;
    if (bar < 2) pattern = 'L---------------';
    else if (!intense) pattern = bar < 4 ? 'L-----L---L-----' : 'L-----5---L---H-';
    else if (bar < 4) pattern = 'L-L-L-L-L-L-L-bL';
    else if (FILL_BARS.has(bar)) pattern = 'L-H-L-5-H-L-bLHL';
    else pattern = inRange(bar, 20, 28) ? 'L--L--H-L-L-5-H-' : 'L-L-H-L-L-L-5-bL';
    bassBar(synth, grid, SLOTS, bar, pattern, {
      low: 38,
      hum,
      vel: intense ? 0.82 : 0.72,
      accents: [0, 6, 10],
      gate: intense ? 0.75 : 0.9,
    });
  }
}

/** Lead serpentin : triangle doux au portamento (calme), scie + harmonie en B2 (intense). */
async function lead({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 7, 0.08);
  const main = leadSynth({
    volume: -13,
    type: intense ? 'fatsawtooth' : 'triangle',
    count: 2,
    spread: 12,
    cutoff: intense ? 1000 : 1600,
    octaves: intense ? 2.8 : 1.5,
    portamento: 0.06,
    env: { attack: 0.03, release: 0.3 },
  });
  const vibrato = new Tone.Vibrato({ frequency: 5.5, depth: 0.09 });
  const delay = new Tone.FeedbackDelay({ delayTime: grid.beats(0.75), feedback: 0.3, wet: 0.2 });
  const rev = await reverb(3.5, 0.3);
  chain(main.output, hp(180), vibrato, delay, rev, out);
  playPhrase(main, grid, LEAD, 0, { hum, gate: 0.97 });
  if (intense) {
    const harm = leadSynth({
      volume: -20,
      type: 'triangle',
      cutoff: 1400,
      octaves: 1.5,
      portamento: 0.06,
    });
    harm.output.connect(vibrato);
    playPhrase(harm, grid, HARMONY, 0, { hum, gate: 0.95 });
  }
}

async function drums({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 3, 0.1);
  const kit = await DrumKit.create(out, {
    drive: intense ? 0.12 : 0,
    kickDecay: 0.38,
    kickPitch: 50,
    levels: intense ? { tom: -9, rim: -15 } : { kick: -6, tom: -11, rim: -15, shaker: -22 },
    roomDecay: 1.6,
    roomWet: 0.22,
  });
  for (const bar of BARS)
    drumBar(kit, grid, bar, intense ? intenseDrums(bar) : calmDrums(bar), hum);
  if (intense) riser(out, grid.t(2), grid.t(4), -22);
}

export const [desertCalm, desertIntense] = stagePair({
  stage: 2,
  name: 'Désert de verre',
  bpm: 112,
  key: 'Ré phrygien dominant',
  tailSeconds: 6,
  mixCalm: { drums: -7, bass: -6.5, lead: -6, pads: -8, arp: -10 },
  mixIntense: { drums: -5, bass: -6, lead: -6, pads: -9, arp: -10.5 },
  build: (layer, ctx, intense) => {
    switch (layer) {
      case 'pads':
        return pads(ctx, intense);
      case 'arp':
        return arp(ctx, intense);
      case 'bass':
        bass(ctx, intense);
        return;
      case 'lead':
        return lead(ctx, intense);
      case 'drums':
        return drums(ctx, intense);
    }
  },
});
