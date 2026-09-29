/**
 * 06-07 — Cité engloutie (calme / intense). Do# mineur, 90 BPM en demi-temps.
 * Identité : lead « chant de baleine » (sinus, glissandos lents, grands intervalles), arpège
 * « bulles » (FM aigu, notes montantes), nappes au filtre ondulant comme la houle.
 * Intense : breakbeat, charleys en doubles croches, basse plus mordante.
 */
import * as Tone from 'tone';
import {
  arpBar,
  bassBar,
  chordAt,
  chordTones,
  drumBar,
  type DrumBar,
  hitTimes,
  playChords,
  playPhrase,
  progression,
  range,
  voicings,
} from '../lib/arrange';
import { DrumKit, riser } from '../lib/drums';
import { chain, hp, reverb, sidechainGain } from '../lib/fx';
import { bassSynth, fmPoly, leadSynth, noiseBed, seqSynth, superSawPad } from '../lib/instruments';
import { type NoteEvent, phrase } from '../lib/notation';
import { FILL_BARS, inRange, SECTION_BARS, stagePair, TOTAL_BARS } from '../lib/stage';
import { Grid, Humanizer } from '../lib/time';
import type { LayerContext } from '../lib/types';

const GRID = new Grid(90);
const BARS = range(0, TOTAL_BARS);

// prettier-ignore
const CHORDS = [
  'C#m9', 'Amaj7', 'F#m9', 'G#7sus4 G#7',
  'C#m9', 'Amaj7', 'Emaj7', 'B', 'C#m9', 'Amaj7', 'F#m9', 'G#7sus4 G#7',
  'C#m9', 'Amaj7', 'Emaj7', 'B', 'Amaj7', 'B', 'C#m9', 'G#7',
  'Amaj7', 'B', 'G#m7', 'C#m9', 'F#m9', 'B', 'Emaj7', 'G#7',
  'Amaj7', 'B', 'G#m7', 'C#m9', 'F#m9', 'Amaj7', 'G#7sus4', 'G#7',
];
const SLOTS = progression(CHORDS);

const OPEN = `C#5:4 G#5:8 E5:4 | E5:8 C#6:8 | B5:8 G#5:4 D#5:4 | F#5:16 |`;
const LEAD: NoteEvent[] = phrase(`
  _:16 | _:16 | _:16 | _:8 G#4:8 |
  ${OPEN}
  C#5:4 G#5:8 B5:4 | A5:8 E5:4 C#5:4 | F#5:6 A5:2 C#6:8 | C#6:8 B#5:8 |
  ${OPEN}
  E6:8 C#6:4 G#5:4 | F#5:8 D#5:4 B4:4 | E5:4 G#5:4 D#6:8 | B#5:12 _:4 |
  C#6:6 B5:2 G#5:8 | F#5:4 D#6:8 B5:4 | B5:8 F#5:8 | G#5:16 |
  A5:4 C#6:4 G#6:8 | F#6:8 D#6:8 | E6:6 D#6:2 B5:8 | B#5:8 G#5:8 |
  G#5:4 E6:8 C#6:4 | D#6:8 F#5:8 | B5:6 A#5:2 F#5:8 | E5:4 C#6:8 G#5:4 |
  A5:8 G#5:4 F#5:4 | E5:8 C#5:8 | C#5:16 | B#4:8 _:4 G#4:4
`);

// --- Batterie : demi-temps (calme), breakbeat (intense) --------------------------------------

function calmDrums(bar: number): DrumBar {
  if (bar < 4) return {};
  const p: DrumBar = {
    kick: inRange(bar, 20, 36) ? 'x.........x.....' : 'x...............',
    snare: '........x.......',
    hat: 'x.x.x.x.x.x.x.x.',
  };
  if (FILL_BARS.has(bar)) p.snare = '........x.....oo';
  return p;
}

function intenseDrums(bar: number): DrumBar {
  if (bar < 3) return bar < 2 ? {} : { hat: 'xoxoxoxoxoxoxoxo' };
  if (bar === 3) return { hat: 'xoxoxoxo........', snare: '........x.x.XxXX' };
  const p: DrumBar = {
    kick: inRange(bar, 20, 28) ? 'x.x.......x..x..' : 'x.x.......x.....',
    snare: '....X..o.o..X..o',
    hat: 'xoxoxoxoxoxoxoxo',
  };
  if (inRange(bar, 12, 20) || inRange(bar, 28, 36)) p.openHat = '......x.......x.';
  if (SECTION_BARS.has(bar)) p.crash = 'X...............';
  if (FILL_BARS.has(bar)) {
    p.snare = '....X..o.oxoXxXX';
    p.hat = 'xoxoxoxo........';
  }
  return p;
}

const CALM_KICKS = hitTimes(GRID, BARS, (b) => calmDrums(b).kick);
const INTENSE_KICKS = hitTimes(GRID, BARS, (b) => intenseDrums(b).kick);

// --- Couches ----------------------------------------------------------------------------------

/** Nappes sous-marines : filtre qui ondule comme la houle, chorus large, brume de fond. */
async function pads({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 5, 0.05);
  const pad = superSawPad({
    volume: -17,
    cutoff: intense ? 2400 : 1700,
    count: 3,
    spread: 26,
    env: { attack: 1.2, release: 3 },
  });
  const swell = new Tone.AutoFilter({
    frequency: grid.bpm / 60 / 4, // une vague par mesure
    baseFrequency: 350,
    octaves: 2.6,
    depth: 0.7,
    wet: 1,
    filter: { type: 'lowpass', rolloff: -12, Q: 1.2 },
  }).start(0);
  const chorus = new Tone.Chorus({ frequency: 0.3, delayTime: 5, depth: 0.8, wet: 0.5 }).start(0);
  const rev = await reverb(7, 0.45);
  const sc = sidechainGain(intense ? INTENSE_KICKS : CALM_KICKS, intense ? 0.25 : 0.08, 0.3);
  chain(pad.output, hp(90), swell, chorus, rev, sc, out);
  const voiced = voicings(SLOTS, { low: 52, high: 78, center: 63, maxNotes: 4 });
  playChords(pad, grid, SLOTS, voiced, { hum, vel: 0.64, overlap: 0.3 });
  const deep = noiseBed({ volume: -34, type: 'brown', center: 260, octaves: 2, rate: 0.04 });
  deep.output.connect(rev);
  deep.start(0, grid.t(TOTAL_BARS) + 1, 0.9);
}

/** Bulles : notes FM courtes qui montent par grappes (calme) ; + séquence en croches (intense). */
async function arp({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 4, 0.12);
  const bubble = fmPoly({
    volume: -18,
    harmonicity: 1.5,
    modulationIndex: 4,
    env: { decay: 0.18, release: 0.2 },
    modEnv: { decay: 0.05 },
  });
  const delay = new Tone.PingPongDelay({ delayTime: grid.beats(0.5), feedback: 0.3, wet: 0.3 });
  const rev = await reverb(5, 0.4);
  chain(bubble.output, hp(400), delay, rev, out);
  for (const bar of BARS) {
    const clusters = intense ? 3 : 2;
    for (let c = 0; c < clusters; c++) {
      const start = rng.int(12);
      const tones = chordTones(chordAt(SLOTS, bar, start), 79, 5);
      const n = 3 + rng.int(2);
      for (let i = 0; i < n; i++) {
        bubble.play(
          [tones[Math.min(i, tones.length - 1)]],
          hum.time(grid.t(bar, start + i * 0.5)),
          grid.dur(0.5),
          hum.vel(0.4 + i * 0.12),
        );
      }
    }
  }
  if (intense) {
    const seq = seqSynth({ volume: -21, type: 'triangle', cutoff: 2600 });
    chain(seq.output, hp(200), delay);
    for (const bar of range(4, 36)) {
      arpBar(seq, grid, SLOTS, bar, {
        low: 61,
        count: 5,
        pattern: [0, 2, 4, 2, 1, 3, 4, 3],
        rate: 2,
        gate: 0.6,
        vel: (s) => (s % 8 === 0 ? 0.8 : 0.55),
        hum,
      });
    }
  }
}

/** Basse profonde et tenue (calme), syncopée et plus sale (intense). */
function bass({ grid, out, rng }: LayerContext, intense: boolean): void {
  const hum = new Humanizer(rng, 2, 0.05);
  const synth = bassSynth({
    volume: -12,
    type: intense ? 'sawtooth' : 'square',
    cutoff: intense ? 200 : 120,
    octaves: intense ? 2.8 : 1.2,
    decay: 0.35,
    q: intense ? 2 : 0.8,
    sub: -1,
    env: { attack: intense ? 0.005 : 0.03 },
  });
  chain(
    synth.output,
    sidechainGain(intense ? INTENSE_KICKS : CALM_KICKS, intense ? 0.4 : 0.12, 0.25),
    out,
  );
  for (const bar of BARS) {
    let pattern: string;
    if (!intense) pattern = bar < 4 ? 'L---------------' : 'L---------5-----';
    else if (bar < 4) pattern = 'L---------------';
    else if (FILL_BARS.has(bar)) pattern = 'L-L-------5-H-5-';
    else pattern = 'L-L-------L--H--';
    bassBar(synth, grid, SLOTS, bar, pattern, {
      low: 33,
      hum,
      vel: 0.78,
      accents: [0],
      gate: 0.92,
    });
  }
}

/** Chant de baleine : sinus + triangle, glissandos lents, vibrato large, réverb profonde. */
async function lead({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 8, 0.08);
  const whale = leadSynth({
    volume: -12,
    type: 'triangle',
    cutoff: 1800,
    octaves: 1,
    portamento: 0.22,
    env: { attack: 0.12, release: 0.8 },
  });
  const vibrato = new Tone.Vibrato({ frequency: 3.5, depth: 0.14 });
  const delay = new Tone.FeedbackDelay({ delayTime: grid.beats(1.5), feedback: 0.35, wet: 0.25 });
  const rev = await reverb(6, 0.45);
  chain(whale.output, hp(150), vibrato, delay, rev, out);
  playPhrase(whale, grid, LEAD, 0, { hum, gate: 0.98 });
  if (intense) {
    // Octave inférieure en scie filtrée : le chant prend du corps.
    const body = leadSynth({
      volume: -20,
      type: 'fatsawtooth',
      count: 2,
      spread: 14,
      cutoff: 600,
      octaves: 1.6,
      portamento: 0.22,
      env: { attack: 0.1, release: 0.6 },
    });
    body.output.connect(vibrato);
    playPhrase(
      body,
      grid,
      LEAD.filter((ev) => ev.step >= 4 * 16),
      0,
      { hum, gate: 0.98, transpose: -12, vel: 0.85 },
    );
  }
}

async function drums({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 4, 0.12);
  const kit = await DrumKit.create(out, {
    drive: intense ? 0.14 : 0,
    kickDecay: 0.5,
    kickPitch: 46,
    levels: intense ? { hat: -24 } : { kick: -5, snare: -10, hat: -26 },
    roomDecay: 2.4,
    roomWet: intense ? 0.2 : 0.32,
  });
  for (const bar of BARS)
    drumBar(kit, grid, bar, intense ? intenseDrums(bar) : calmDrums(bar), hum);
  if (intense) riser(out, grid.t(3), grid.t(4), -22, 300, 6000);
}

export const [citeCalm, citeIntense] = stagePair({
  stage: 3,
  name: 'Cité engloutie',
  bpm: 90,
  key: 'Do# mineur',
  tailSeconds: 9,
  mixCalm: { drums: -8, bass: -6, lead: -5.5, pads: -7.5, arp: -10 },
  mixIntense: { drums: -5, bass: -6, lead: -6, pads: -8.5, arp: -10 },
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
