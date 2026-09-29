/**
 * 16-17 — Cathédrale du vide (calme / intense). Ré mineur harmonique, 124 BPM. Gothique, épique.
 * Identité : orgue synthétique, chœurs à filtres formants, cloches ; choral qui cite le
 * leitmotiv Voidpulse (ré–fa–la–si♭…la). Intense : darksynth complet, lead scie massif,
 * blasts ponctuels.
 */
import * as Tone from 'tone';
import {
  arpBar,
  bassBar,
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
import {
  bassSynth,
  fmPoly,
  formantVoice,
  leadSynth,
  organ,
  seqSynth,
  superSawPad,
} from '../lib/instruments';
import { type NoteEvent, phrase } from '../lib/notation';
import { FILL_BARS, inRange, SECTION_BARS, stagePair, TOTAL_BARS } from '../lib/stage';
import { Grid, Humanizer } from '../lib/time';
import type { LayerContext } from '../lib/types';

const GRID = new Grid(124);
const BARS = range(0, TOTAL_BARS);

// prettier-ignore
const CHORDS = [
  'Dm', 'Bb', 'Gm', 'A7',
  'Dm', 'Bb', 'Gm', 'A7', 'Dm', 'F', 'Gm', 'A7',
  'Dm', 'Bb', 'Gm', 'A7', 'Bb', 'Gm', 'Edim', 'A7',
  'Gm', 'Dm', 'A7', 'Dm', 'Bb', 'F', 'Gm', 'A7',
  'Gm', 'Dm', 'Bb', 'A7', 'Dm', 'Bb', 'Gm6', 'A7',
];
const SLOTS = progression(CHORDS);

// Le leitmotiv (1–♭3–5–♭6–5, court-court-long) ouvre chaque période du choral.
const MOTIF = `D5:2 F5:2 A5:4 Bb5:6 A5:2-`;
const LEAD: NoteEvent[] = phrase(`
  _:16 | _:16 | _:16 | _:12 C#5:4 |
  ${MOTIF} | A5:6 F5:2 G5:4 A5:4 | Bb5:4 A5:2 G5:2 D5:8 | E5:4 C#5:4 E5:4 G5:4 |
  ${MOTIF} | A5:6 C6:2 F6:4 E6:4 | D6:4 Bb5:4 G5:6 A5:2 | C#6:12 _:4 |
  ${MOTIF} | A5:6 F5:2 G5:4 A5:4 | Bb5:4 A5:2 G5:2 D5:8 | E5:4 C#5:4 E5:4 G5:4 |
  D6:6 C6:2 Bb5:4 F5:4 | G5:6 A5:2 Bb5:4 D6:4 | Bb5:8 G5:4 E5:4 | C#5:8 E5:4 A5:4 |
  G5:8 Bb5:8 | A5:8 F5:8 | E5:6 F5:2 G5:8 | F5:12 _:4 |
  D6:8 Bb5:8 | C6:8 A5:8 | Bb5:6 C6:2 D6:8 | C#6:8 E6:8 |
  G6:8 F6:4 E6:2 D6:2 | F6:8 A5:8 | Bb5:4 C6:4 D6:4 F6:4 | E6:12 _:4 |
  ${MOTIF} | A5:8 D6:8 | E6:4 D6:4 Bb5:4 G5:4 | A5:8 _:4 C#5:4
`);
const barOf = (ev: NoteEvent): number => Math.floor(ev.step / 16);
const HARMONY = harmonizeBelow(
  LEAD.filter((ev) => inRange(barOf(ev), 20, 36)),
  SLOTS,
);

// --- Batterie ---------------------------------------------------------------------------------

function calmDrums(bar: number): DrumBar {
  if (bar < 4) return {};
  const p: DrumBar = {
    kick: 'x.......x.......',
    snare: '....x.......x...',
    hat: 'x.x.x.x.x.x.x.x.',
  };
  if (FILL_BARS.has(bar)) p.toms = '........1.2.3.44';
  return p;
}

/** Blasts ponctuels : dernière mesure de chaque demi-section en intense. */
const BLAST_BARS = new Set([19, 35]);

function intenseDrums(bar: number): DrumBar {
  if (bar < 2) return {};
  if (bar < 4)
    return { kick: 'x...x...x...x...', snare: bar === 3 ? '........xxxxXXXX' : undefined };
  const p: DrumBar = {
    kick: inRange(bar, 20, 28) ? 'x.x.x.x.x.x.x.x.' : 'x...x.x.x...x.x.',
    snare: '....X.......X...',
    hat: 'x.x.x.x.x.x.x.x.',
    openHat: '..x...x...x...x.',
  };
  if (SECTION_BARS.has(bar)) p.crash = 'X...............';
  if (FILL_BARS.has(bar)) {
    delete p.openHat;
    p.toms = '........11223344';
  }
  if (BLAST_BARS.has(bar)) {
    p.kick = 'xxxxxxxxxxxxxxxx';
    p.snare = 'x.x.x.x.x.x.XXXX';
    delete p.toms;
  }
  return p;
}

const CALM_KICKS = hitTimes(GRID, BARS, (b) => calmDrums(b).kick);
const INTENSE_KICKS = hitTimes(GRID, BARS, (b) =>
  BLAST_BARS.has(b) ? 'x...x...x...x...' : intenseDrums(b).kick,
);

// --- Couches ----------------------------------------------------------------------------------

/** Orgue et chœurs « aah » ; supersaw sombre en plus dans la version intense. */
async function pads({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 4, 0.04);
  const org = organ({ volume: -22, env: { attack: 0.06, release: 0.5 } });
  const choir = formantVoice({ volume: -18, vowel: 'a', count: 3, spread: 26 });
  const bus = new Tone.Gain(1);
  org.output.connect(bus);
  choir.output.connect(bus);
  // Grande nef : réverb très longue, pré-délai marqué.
  const nave = await reverb(8, intense ? 0.35 : 0.45, 0.05);
  const sc = sidechainGain(intense ? INTENSE_KICKS : CALM_KICKS, intense ? 0.28 : 0.08, 0.25);
  chain(bus, hp(80), nave, sc, out);
  const voiced = voicings(SLOTS, { low: 50, high: 76, center: 62, maxNotes: 4 });
  playChords(org, grid, SLOTS, voiced, { hum, vel: 0.62, overlap: 0.05 });
  playChords(
    choir,
    grid,
    SLOTS,
    voiced.map((v) => v.map((n) => n + 12)),
    { hum, vel: 0.6, overlap: 0.3, from: intense ? 0 : 4 },
  );
  if (intense) {
    const dark = superSawPad({ volume: -22, cutoff: 1800, count: 3, spread: 36 });
    dark.output.connect(bus);
    playChords(dark, grid, SLOTS, voiced, { hum, vel: 0.6, overlap: 0.1, from: 4 });
  }
}

/** Cloches du beffroi (calme) ; + arpège d'orgue en doubles croches (intense). */
async function arp({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 3, 0.08);
  const bells = fmPoly({
    volume: -17,
    harmonicity: 3.5,
    modulationIndex: 8,
    env: { decay: 2.4, release: 2 },
    modEnv: { decay: 1 },
  });
  const rev = await reverb(6, 0.45, 0.04);
  chain(bells.output, hp(180), rev, out);
  // Glas : tonique et quinte à chaque début de période, puis sur les temps en section B.
  for (const bar of BARS) {
    if (bar % 4 === 0) bells.play([62, 69], hum.time(grid.t(bar)), grid.dur(16), hum.vel(0.75));
    if (bar >= 20 && bar % 2 === 1)
      bells.play([74], hum.time(grid.t(bar, 8)), grid.dur(8), hum.vel(0.5));
  }
  if (intense) {
    const seq = seqSynth({ volume: -21, type: 'fatsquare', cutoff: 2800, q: 1.2 });
    const delay = new Tone.PingPongDelay({ delayTime: grid.beats(0.5), feedback: 0.2, wet: 0.18 });
    chain(seq.output, hp(200), delay, rev);
    for (const bar of range(4, 36)) {
      arpBar(seq, grid, SLOTS, bar, {
        low: 62,
        count: 6,
        pattern: [0, 2, 4, 5, 4, 2, 1, 3],
        rate: 1,
        gate: 0.6,
        vel: (s) => (s % 4 === 0 ? 0.85 : 0.55),
        hum,
      });
    }
  }
}

/** Basse d'orgue (pédalier) en blanches (calme) ; basse saturée en croches (intense). */
function bass({ grid, out, rng }: LayerContext, intense: boolean): void {
  const hum = new Humanizer(rng, 1.5, 0.05);
  const synth = bassSynth({
    volume: -12,
    type: intense ? 'fatsawtooth' : 'square',
    cutoff: intense ? 220 : 120,
    octaves: intense ? 3 : 1.3,
    decay: 0.25,
    q: 1.8,
    sub: -1,
  });
  const sc = sidechainGain(intense ? INTENSE_KICKS : CALM_KICKS, intense ? 0.42 : 0.12, 0.18);
  if (intense) {
    const drive = new Tone.Distortion({ distortion: 0.4, oversample: '2x', wet: 0.35 });
    chain(synth.output, drive, new Tone.Filter({ type: 'lowpass', frequency: 2600 }), sc, out);
  } else {
    chain(synth.output, sc, out);
  }
  for (const bar of BARS) {
    let pattern: string;
    if (!intense) pattern = bar < 4 ? 'L---------------' : 'L-------5-------';
    else if (bar < 4) pattern = 'L-L-L-L-L-L-L-L-';
    else if (BLAST_BARS.has(bar)) pattern = 'LLLLLLLLLLLLHHHH';
    else pattern = inRange(bar, 20, 28) ? 'L-L-H-L-L-L-H-L-' : 'L-L-L-H-L-L-5-H-';
    bassBar(synth, grid, SLOTS, bar, pattern, {
      low: 38,
      hum,
      vel: 0.8,
      accents: [0, 8],
      gate: intense ? 0.75 : 0.95,
    });
  }
}

/** Choral : orgue solo (calme) ; lead scie massif harmonisé à deux voix (intense). */
async function lead({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 5, 0.07);
  const rev = await reverb(5, intense ? 0.25 : 0.38, 0.04);
  if (!intense) {
    const solo = organ({
      volume: -12,
      partials: [1, 0.5, 0.6, 0.2, 0.3, 0.1],
      env: { release: 0.3 },
    });
    const leslie = new Tone.Tremolo({ frequency: 5.5, depth: 0.25, spread: 90 }).start(0);
    chain(solo.output, hp(200), leslie, rev, out);
    playPhrase(solo, grid, LEAD, 0, { hum, gate: 0.94 });
    return;
  }
  const opts = {
    type: 'fatsawtooth' as const,
    count: 3,
    spread: 24,
    cutoff: 1300,
    octaves: 3,
    q: 1.5,
    portamento: 0.015,
    env: { attack: 0.008, release: 0.25 },
  };
  const main = leadSynth({ ...opts, volume: -15 });
  const harm = leadSynth({ ...opts, volume: -21 });
  const bus = new Tone.Gain(1);
  main.output.connect(bus);
  harm.output.connect(bus);
  const drive = new Tone.Distortion({ distortion: 0.28, oversample: '2x', wet: 0.3 });
  const delay = new Tone.FeedbackDelay({ delayTime: grid.beats(0.75), feedback: 0.25, wet: 0.18 });
  chain(bus, hp(160), drive, delay, rev, out);
  playPhrase(main, grid, LEAD, 0, { hum, gate: 0.92 });
  playPhrase(harm, grid, HARMONY, 0, { hum, gate: 0.9, vel: 0.85 });
}

async function drums({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 2.5, 0.1);
  const kit = await DrumKit.create(out, {
    drive: intense ? 0.25 : 0.08,
    kickDecay: intense ? 0.3 : 0.42,
    kickPitch: 48,
    levels: intense ? { snare: -6, hat: -25 } : { kick: -5, snare: -9, hat: -25 },
    roomDecay: 2.6,
    roomWet: intense ? 0.2 : 0.3,
  });
  for (const bar of BARS)
    drumBar(kit, grid, bar, intense ? intenseDrums(bar) : calmDrums(bar), hum);
  if (intense) riser(out, grid.t(2), grid.t(4), -20);
}

export const [cathedraleCalm, cathedraleIntense] = stagePair({
  stage: 8,
  name: 'Cathédrale du vide',
  bpm: 124,
  key: 'Ré mineur harmonique',
  tailSeconds: 9,
  mixCalm: { drums: -7, bass: -6.5, lead: -5.5, pads: -7.5, arp: -10 },
  mixIntense: { drums: -4.5, bass: -6, lead: -6, pads: -8.5, arp: -10 },
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
