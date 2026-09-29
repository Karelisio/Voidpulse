/**
 * 12-13 — Toundra cristalline (calme / intense). Si mineur, 104 BPM. Froid, épuré.
 * Identité : cloches de cristal et célesta (FM), nappes sus2 dans une réverb « shimmer »,
 * lead sinus pur en notes isolées et espacées. Intense : caisse claire martiale, ostinato de
 * cordes synthétiques en staccato.
 */
import * as Tone from 'tone';
import {
  arpBar,
  bassBar,
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
import { chain, hp, reverb, shimmer, sidechainGain } from '../lib/fx';
import {
  bassSynth,
  filterPoly,
  fmPoly,
  leadSynth,
  noiseBed,
  superSawPad,
} from '../lib/instruments';
import { type NoteEvent, phrase } from '../lib/notation';
import { FILL_BARS, inRange, SECTION_BARS, stagePair, TOTAL_BARS } from '../lib/stage';
import { Grid, Humanizer } from '../lib/time';
import type { LayerContext } from '../lib/types';

const GRID = new Grid(104);
const BARS = range(0, TOTAL_BARS);

// prettier-ignore
const CHORDS = [
  'Bmadd9', 'Gmaj7', 'Dsus2', 'F#7sus4',
  'Bmadd9', 'Gmaj7', 'Dsus2', 'Asus2', 'Bmadd9', 'Gmaj7', 'Em9', 'F#7sus4',
  'Bmadd9', 'Gmaj7', 'Dsus2', 'Asus2', 'Gmaj7', 'Asus2', 'Bmadd9', 'F#m7',
  'Em9', 'Asus2', 'Dsus2', 'Gmaj7', 'Em9', 'Asus2', 'Bmadd9', 'F#7sus4',
  'Gmaj7', 'Asus2', 'Bmadd9', 'Dsus2', 'Em9', 'Gmaj7', 'F#7sus4', 'F#7sus4 F#7',
];
const SLOTS = progression(CHORDS);

// Notes isolées, silences comme partie de la phrase : le froid qui s'installe.
const STARS = `F#5:4 _:4 D6:4 _:4 | B5:8 _:8 | A5:4 _:4 E6:4 _:4 | C#6:8 _:8 |`;
const LEAD: NoteEvent[] = phrase(`
  _:16 | _:16 | _:16 | _:16 |
  ${STARS}
  F#5:4 _:4 D6:4 _:2 E6:2 | F#6:8 D6:8 | B5:4 _:4 G5:4 _:4 | B5:8 A5:8 |
  ${STARS}
  D6:4 _:4 F#6:4 _:4 | E6:8 B5:8 | C#6:8 D6:4 _:4 | A5:12 _:4 |
  G6:4 _:4 F#6:4 _:4 | E6:8 _:8 | E6:4 _:4 A6:4 _:4 | F#6:12 _:4 |
  B5:4 _:4 D6:4 E6:4 | B5:8 C#6:8 | D6:4 _:4 C#6:4 _:4 | B5:12 _:4 |
  B5:4 _:4 D6:4 _:4 | C#6:4 _:4 E6:8 | F#6:8 D6:8 | E6:12 _:4 |
  G6:4 F#6:4 E6:4 B5:4 | D6:8 _:8 | C#6:8 B5:8 | _:8 A#5:8
`);

// --- Batterie : balais feutrés (calme), caisse claire martiale (intense) ---------------------

function calmDrums(bar: number): DrumBar {
  if (bar < 4) return {};
  const p: DrumBar = {
    kick: 'x.........x.....',
    rim: '........x.......',
    shaker: 'x.x.x.x.x.x.x.x.',
  };
  if (FILL_BARS.has(bar)) p.rim = '........x...x.x.';
  return p;
}

function intenseDrums(bar: number): DrumBar {
  if (bar < 2) return {};
  if (bar < 4) return { snare: bar === 2 ? 'X..x..x.X.x.X...' : 'X..x..x.X.xxXxXX' };
  const p: DrumBar = {
    kick: inRange(bar, 20, 28) ? 'x.....x.x.......' : 'x.......x.......',
    snare: inRange(bar, 12, 20) || inRange(bar, 28, 36) ? 'X..o..o.X.oo..o.' : '....X.......X...',
    hat: 'x.x.x.x.x.x.x.x.',
  };
  if (SECTION_BARS.has(bar)) p.crash = 'X...............';
  if (FILL_BARS.has(bar)) p.snare = 'X..o..o.XoXoXXXX';
  return p;
}

const CALM_KICKS = hitTimes(GRID, BARS, (b) => calmDrums(b).kick);
const INTENSE_KICKS = hitTimes(GRID, BARS, (b) => intenseDrums(b).kick);

// --- Couches ----------------------------------------------------------------------------------

/** Nappes sus2 cristallines dans le shimmer ; vent glacé en fond. */
async function pads({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 5, 0.04);
  const pad = superSawPad({
    volume: -18,
    cutoff: intense ? 3600 : 2800,
    count: 3,
    spread: 16,
    env: { attack: 1.6, release: 3.5 },
  });
  const sh = await shimmer(8, 0.5, intense ? 0.25 : 0.35);
  const sc = sidechainGain(intense ? INTENSE_KICKS : CALM_KICKS, intense ? 0.22 : 0.06, 0.3);
  chain(pad.output, hp(140), sh.input);
  chain(sh.output, sc, out);
  const voiced = voicings(SLOTS, { low: 57, high: 83, center: 69, maxNotes: 4 });
  playChords(pad, grid, SLOTS, voiced, { hum, vel: 0.58, overlap: 0.35 });
  const wind = noiseBed({ volume: -34, type: 'white', center: 2200, octaves: 2, rate: 0.03, q: 2 });
  const rev = await reverb(5, 0.5);
  chain(wind.output, rev, out);
  wind.start(0, grid.t(TOTAL_BARS) + 1, 0.7);
}

/** Célesta et cloches de cristal : arpège lent en croches, notes aiguës et claires. */
async function arp({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 3, 0.1);
  const celesta = fmPoly({
    volume: -17,
    harmonicity: 7,
    modulationIndex: 2.5,
    env: { decay: 1.2, release: 1.2 },
    modEnv: { decay: 0.15 },
  });
  const crystal = fmPoly({
    volume: -23,
    harmonicity: 5.01,
    modulationIndex: 6,
    env: { decay: 2.4, release: 2 },
    modEnv: { decay: 0.9 },
  });
  const delay = new Tone.PingPongDelay({ delayTime: grid.beats(1.5), feedback: 0.3, wet: 0.25 });
  const rev = await reverb(6, 0.4);
  chain(celesta.output, hp(400), delay, rev, out);
  crystal.output.connect(rev);
  for (const bar of BARS) {
    arpBar(celesta, grid, SLOTS, bar, {
      low: 74,
      count: 4,
      pattern: [0, 2, 1, 3, 2, 1, 3, 0],
      rate: 2,
      gate: 0.9,
      vel: (s) => (s % 8 === 0 ? 0.7 : 0.45),
      hum,
      skip: (s) => !intense && bar < 4 && s % 4 !== 0,
    });
    if (bar % 2 === 0) {
      const top = 86 + (bar % 4 === 0 ? 0 : 2);
      crystal.play([top], hum.time(grid.t(bar, 4)), grid.dur(12), hum.vel(0.5));
    }
  }
}

/** Basse ronde en rondes (calme) ; + cordes en staccato, ostinato de croches (intense). */
async function bass({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 2, 0.05);
  const synth = bassSynth({
    volume: -12,
    type: 'square',
    cutoff: 130,
    octaves: 1.2,
    decay: 0.4,
    q: 0.7,
    sub: 1,
    env: { attack: 0.02 },
  });
  const sc = sidechainGain(intense ? INTENSE_KICKS : CALM_KICKS, intense ? 0.3 : 0.1, 0.25);
  chain(synth.output, sc, out);
  for (const bar of BARS) {
    const pattern = intense && bar >= 4 ? 'L-------L---5---' : 'L---------------';
    bassBar(synth, grid, SLOTS, bar, pattern, { low: 35, hum, vel: 0.75, gate: 0.96 });
  }
  if (intense) {
    const strings = filterPoly({
      volume: -18,
      type: 'sawtooth',
      cutoff: 900,
      octaves: 2.2,
      env: { attack: 0.005, decay: 0.12, sustain: 0.1, release: 0.08 },
      filterEnv: { decay: 0.1, sustain: 0.1 },
    });
    const rev = await reverb(2.5, 0.25);
    chain(strings.output, hp(160), rev, sc);
    for (const bar of range(4, 36)) {
      arpBar(strings, grid, SLOTS, bar, {
        low: 47,
        count: 4,
        pattern: [0, 0, 2, 0, 1, 0, 2, 3],
        rate: 2,
        gate: 0.35,
        vel: (s) => (s % 4 === 0 ? 0.85 : 0.6),
        hum,
      });
    }
  }
}

/** Sinus pur, vibrato lent ; doublé à l'octave par une cloche en intense. */
async function lead({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 6, 0.06);
  const pure = leadSynth({
    volume: -9,
    type: 'sine',
    cutoff: 4000,
    octaves: 0.5,
    portamento: 0.01,
    env: { attack: 0.04, decay: 0.4, sustain: 0.7, release: 1.2 },
  });
  const vibrato = new Tone.Vibrato({ frequency: 4.5, depth: 0.05 });
  const delay = new Tone.FeedbackDelay({ delayTime: grid.beats(1), feedback: 0.35, wet: 0.25 });
  const rev = await reverb(6, 0.42);
  chain(pure.output, vibrato, delay, rev, out);
  playPhrase(pure, grid, LEAD, 0, { hum, gate: 0.9 });
  if (intense) {
    const glass = fmPoly({
      volume: -20,
      harmonicity: 3.01,
      modulationIndex: 3,
      env: { decay: 1.2, release: 1 },
      modEnv: { decay: 0.4 },
    });
    glass.output.connect(delay);
    playPhrase(glass, grid, LEAD, 0, { hum, gate: 0.9, transpose: 12, vel: 0.7 });
  }
}

async function drums({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 3, 0.12);
  const kit = await DrumKit.create(out, {
    kickDecay: 0.5,
    kickPitch: 46,
    levels: intense ? { snare: -7, hat: -26 } : { kick: -7, rim: -17, shaker: -24 },
    roomDecay: intense ? 1.8 : 3,
    roomWet: intense ? 0.22 : 0.35,
  });
  for (const bar of BARS)
    drumBar(kit, grid, bar, intense ? intenseDrums(bar) : calmDrums(bar), hum);
  if (intense) riser(out, grid.t(3), grid.t(4), -24, 1200, 12000);
}

export const [toundraCalm, toundraIntense] = stagePair({
  stage: 6,
  name: 'Toundra cristalline',
  bpm: 104,
  key: 'Si mineur',
  tailSeconds: 10,
  mixCalm: { drums: -9, bass: -7, lead: -5.5, pads: -7, arp: -8.5 },
  mixIntense: { drums: -5.5, bass: -6, lead: -6, pads: -8, arp: -9 },
  build: (layer, ctx, intense) => {
    switch (layer) {
      case 'pads':
        return pads(ctx, intense);
      case 'arp':
        return arp(ctx, intense);
      case 'bass':
        return bass(ctx, intense);
      case 'lead':
        return lead(ctx, intense);
      case 'drums':
        return drums(ctx, intense);
    }
  },
});
