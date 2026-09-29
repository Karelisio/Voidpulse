/**
 * 14-15 — Marais toxique (calme / intense). Sol# phrygien, 98 BPM swingué. Poisseux, bancal.
 * Identité : basse acid façon 303 (résonance, accents, glissés), nappes aigres (désaccord
 * large), lead aux pitch bends, motif chromatique rampant. Intense : acid hurlante (filtre
 * grand ouvert, saturation), roulements de toms.
 */
import * as Tone from 'tone';
import {
  chordAt,
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
import { chain, hp, ramp, reverb, sidechainGain } from '../lib/fx';
import { fmPoly, leadSynth, noiseBed, superSawPad } from '../lib/instruments';
import { type NoteEvent, phrase } from '../lib/notation';
import { clipToWindow, inWindow } from '../lib/section';
import { FILL_BARS, inRange, SECTION_BARS, stagePair, TOTAL_BARS } from '../lib/stage';
import { bassNote, midiToFreq } from '../lib/theory';
import { Grid, Humanizer } from '../lib/time';
import type { LayerContext } from '../lib/types';

const SWING = 0.3;
const GRID = new Grid(98, 16, SWING);
const BARS = range(0, TOTAL_BARS);

// prettier-ignore
const CHORDS = [
  'G#m', 'A', 'G#m', 'A',
  'G#m', 'A', 'G#m', 'F#m', 'E', 'A', 'C#m', 'A',
  'G#m', 'A', 'G#m', 'F#m', 'C#m', 'E', 'F#m', 'A',
  'E', 'F#m', 'G#m', 'G#m', 'E', 'F#m', 'A', 'A',
  'C#m', 'E', 'F#m', 'G#m', 'C#m', 'A', 'F#m', 'A',
];
const SLOTS = progression(CHORDS);

const CRAWL = `G#4:2 A4:2 A#4:2 B4:6 A4:4 | C#5:4 C5:2 B4:2 A4:8 | G#4:2 A4:2 A#4:2 B4:2 D#5:4 D5:4 | C#5:8 A4:8 |`;
const LEAD: NoteEvent[] = phrase(`
  _:16 | _:16 | _:16 | _:12 G4:4 |
  ${CRAWL}
  B4:2 C5:2 C#5:2 E5:6 D#5:4 | E5:4 D#5:2 D5:2 C#5:8 | G#5:6 G5:2 F#5:4 E5:4 | A4:12 _:4 |
  ${CRAWL}
  E5:4 G#5:4 C#6:8 | B5:4 A#5:2 A5:2 G#5:8 | A5:4 G#5:4 F#5:4 C#5:4 | E5:4 D#5:2 D5:2 C#5:4 B4:4 |
  B5:8 G#5:4 E5:4 | A5:6 G#5:2 F#5:8 | D#5:4 E5:4 D#5:4 B4:4 | G#4:12 _:4 |
  E5:2 F5:2 F#5:2 G#5:6 B5:4 | C#6:8 B5:4 A5:4 | G#5:4 A5:4 E5:4 C#5:4 | A4:8 _:8 |
  C#5:2 D5:2 D#5:2 E5:6 G#5:4 | B5:8 A#5:4 A5:4 | G#5:4 F#5:4 C#5:8 | D#5:8 B4:8 |
  E5:4 D#5:4 D5:4 C#5:4 | C5:4 B4:4 A4:8 | A4:4 C#5:4 F#5:8 | E5:8 C#5:4 G4:4
`);

// --- Batterie swinguée ------------------------------------------------------------------------

function calmDrums(bar: number): DrumBar {
  if (bar < 4) return {};
  const p: DrumBar = {
    kick: 'x......x..x.....',
    rim: '....x.......x...',
    hat: 'x.xox.xox.xox.xo',
  };
  if (FILL_BARS.has(bar)) p.rim = '....x.......x.xx';
  return p;
}

function intenseDrums(bar: number): DrumBar {
  if (bar < 2) return {};
  if (bar < 4)
    return { kick: 'x......x..x.....', toms: bar === 3 ? '........1.2.3344' : undefined };
  const p: DrumBar = {
    kick: inRange(bar, 20, 28) ? 'x..x...x..x..x..' : 'x......x..x.....',
    snare: '....X.......X...',
    clap: '....x.......x..o',
    hat: 'xoxoxoxoxoxoxoxo',
  };
  if (SECTION_BARS.has(bar)) p.crash = 'X...............';
  if (FILL_BARS.has(bar) || bar === 15 || bar === 31) {
    p.toms = FILL_BARS.has(bar) ? '....112233443344' : '............4444';
    p.hat = 'xoxoxoxo........';
  }
  return p;
}

const CALM_KICKS = hitTimes(GRID, BARS, (b) => calmDrums(b).kick);
const INTENSE_KICKS = hitTimes(GRID, BARS, (b) => intenseDrums(b).kick);

// --- Couches ----------------------------------------------------------------------------------

/** Nappes aigres : supersaw très désaccordée, chorus lent ; bulles de gaz (bruit brun). */
async function pads({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 6, 0.05);
  const pad = superSawPad({
    volume: -18,
    cutoff: intense ? 2200 : 1500,
    count: 4,
    spread: 55,
    env: { attack: 0.8, release: 2.2 },
  });
  const chorus = new Tone.Chorus({ frequency: 0.25, delayTime: 6, depth: 0.9, wet: 0.55 }).start(0);
  const rev = await reverb(4, 0.35);
  const sc = sidechainGain(intense ? INTENSE_KICKS : CALM_KICKS, intense ? 0.3 : 0.1, 0.25);
  chain(pad.output, hp(120), chorus, rev, sc, out);
  const voiced = voicings(SLOTS, { low: 54, high: 76, center: 64, maxNotes: 4 });
  playChords(pad, grid, SLOTS, voiced, { hum, vel: 0.62, overlap: 0.15 });
  const bog = noiseBed({ volume: -33, type: 'brown', center: 320, octaves: 2.5, rate: 0.09, q: 3 });
  bog.output.connect(rev);
  bog.start(0, grid.t(TOTAL_BARS) + 1, 0.8);
}

/** Gouttes de poison : pluck FM en contretemps, marimba boueux. */
async function arp({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 5, 0.12);
  const drip = fmPoly({
    volume: -17,
    harmonicity: 1.01,
    modulationIndex: 3,
    env: { decay: 0.3, release: 0.3 },
    modEnv: { decay: 0.1 },
    modType: 'square',
  });
  const delay = new Tone.FeedbackDelay({ delayTime: grid.beats(0.75), feedback: 0.35, wet: 0.3 });
  const rev = await reverb(3, 0.3);
  chain(drip.output, hp(250), delay, rev, out);
  const pattern = intense ? [2, 3, 6, 10, 11, 14] : [3, 6, 11, 14];
  for (const bar of BARS) {
    const chord = chordAt(SLOTS, bar, 0);
    const root = bassNote(chord, 67);
    const shape = chord.intervals;
    pattern.forEach((step, i) => {
      const iv = shape[(i + bar) % shape.length];
      drip.play(
        [root + iv],
        hum.time(grid.t(bar, step)),
        grid.dur(1),
        hum.vel(i % 2 ? 0.55 : 0.75),
      );
    });
  }
}

/**
 * Acid 303 : scie résonante, enveloppe de filtre à chaque note, accents (filtre plus ouvert)
 * et glissés (portamento sur les notes liées). Motif de 16 pas : `0` fondamentale, `o` octave,
 * `b` seconde mineure, `5` quinte, `3` tierce mineure ; majuscule = accent ; `~` glissé vers
 * la note suivante ; `.` silence.
 */
const ACID = {
  calm: '0...0.o...0..b..',
  main: '0.0o.03.0b.0o.5~3',
  scream: 'O.0o~b0.O.o0~3.5.0',
} as const;

function acidBass({ grid, out, rng }: LayerContext, intense: boolean): void {
  const hum = new Humanizer(rng, 2, 0.05);
  const mono = new Tone.MonoSynth({
    oscillator: { type: 'sawtooth' },
    portamento: 0,
    filter: { type: 'lowpass', rolloff: -24, Q: intense ? 11 : 8 },
    envelope: { attack: 0.003, decay: 0.2, sustain: 0.6, release: 0.05 },
    filterEnvelope: {
      attack: 0.002,
      decay: 0.18,
      sustain: 0.1,
      release: 0.08,
      baseFrequency: intense ? 260 : 180,
      octaves: intense ? 4.2 : 3,
    },
  });
  mono.volume.value = -14;
  const sub = new Tone.MonoSynth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.003, decay: 0.2, sustain: 0.9, release: 0.05 },
    filterEnvelope: { baseFrequency: 300, octaves: 0 },
  });
  sub.volume.value = -16;
  const bus = new Tone.Gain(1);
  mono.connect(bus);
  sub.connect(bus);
  const sc = sidechainGain(intense ? INTENSE_KICKS : CALM_KICKS, intense ? 0.35 : 0.12, 0.18);
  if (intense) {
    const drive = new Tone.Distortion({ distortion: 0.6, oversample: '2x', wet: 0.45 });
    chain(bus, drive, new Tone.Filter({ type: 'lowpass', frequency: 5000 }), sc, out);
  } else {
    chain(bus, sc, out);
  }
  const offsets: Record<string, number> = { '0': 0, o: 12, b: 1, '5': 7, '3': 3 };
  for (const bar of BARS) {
    const src =
      bar < 4
        ? intense && bar >= 2
          ? ACID.main
          : ACID.calm
        : !intense
          ? ACID.calm
          : inRange(bar, 20, 28) || FILL_BARS.has(bar)
            ? ACID.scream
            : ACID.main;
    // Retire les `~` pour indexer les pas ; ils marquent un glissé sur la note précédente.
    const steps: { ch: string; slide: boolean }[] = [];
    for (const ch of src) {
      if (ch === '~') {
        const last = steps.at(-1);
        if (last) last.slide = true;
      } else steps.push({ ch, slide: false });
    }
    if (steps.length !== 16) throw new Error(`Motif acid de ${String(steps.length)} pas : ${src}`);
    const root = bassNote(chordAt(SLOTS, bar, 0), 32);
    let glide = false;
    steps.forEach(({ ch, slide }, step) => {
      if (ch === '.') {
        glide = false;
        return;
      }
      const t = hum.time(grid.t(bar, step));
      if (!inWindow(t)) return;
      const accent = ch === 'O';
      const note = root + offsets[ch.toLowerCase()];
      const f = midiToFreq(note);
      const dur = grid.dur(slide ? 1.6 : 0.7);
      // Glissé : la note précédente marquée `~` rejoint celle-ci en portamento.
      mono.portamento = glide ? 0.06 : 0;
      glide = slide;
      mono.triggerAttackRelease(f, dur, t, accent ? 1 : 0.7);
      sub.triggerAttackRelease(f, dur, t, 0.8);
    });
  }
}

/** Lead aux pitch bends : scie filtrée, portamento, vibrato large et bends programmés. */
async function lead({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 9, 0.1);
  const main = leadSynth({
    volume: -14,
    type: intense ? 'fatsawtooth' : 'fatsquare',
    count: 2,
    spread: 18,
    cutoff: intense ? 1100 : 800,
    octaves: 2.2,
    q: 2,
    portamento: 0.05,
    env: { attack: 0.02, release: 0.25 },
  });
  const vibrato = new Tone.Vibrato({ frequency: 4, depth: 0.12 });
  const delay = new Tone.FeedbackDelay({ delayTime: grid.beats(0.75), feedback: 0.3, wet: 0.22 });
  const rev = await reverb(3, 0.28);
  chain(main.output, hp(170), vibrato, delay, rev, out);
  playPhrase(main, grid, LEAD, 0, { hum, gate: 0.95 });
  // Bends : chaque note longue (≥ 6 pas) s'affaisse d'un demi-ton puis remonte.
  const detune = main.synth.detune;
  for (const ev of LEAD) {
    if (ev.len < 6) continue;
    const t0 = grid.t(0, ev.step + 2);
    const t1 = grid.t(0, ev.step + ev.len - 1);
    const w = clipToWindow(t0, t1);
    if (!w) continue;
    ramp(detune, 0, -100, w[0], (w[0] + w[1]) / 2, 'linear');
    ramp(detune, -100, 0, (w[0] + w[1]) / 2, w[1], 'linear');
  }
}

async function drums({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 4, 0.12);
  const kit = await DrumKit.create(out, {
    drive: intense ? 0.16 : 0.05,
    kickDecay: 0.4,
    kickPitch: 50,
    levels: intense ? { tom: -7, clap: -10 } : { kick: -6, rim: -13, hat: -24 },
    roomDecay: 1.6,
    roomWet: 0.22,
  });
  for (const bar of BARS)
    drumBar(kit, grid, bar, intense ? intenseDrums(bar) : calmDrums(bar), hum);
  if (intense) riser(out, grid.t(2), grid.t(4), -22, 200, 5000);
}

export const [maraisCalm, maraisIntense] = stagePair({
  stage: 7,
  name: 'Marais toxique',
  bpm: 98,
  key: 'Sol# phrygien',
  swing: SWING,
  tailSeconds: 6,
  mixCalm: { drums: -7, bass: -5.5, lead: -6, pads: -8.5, arp: -10 },
  mixIntense: { drums: -5, bass: -5, lead: -6.5, pads: -9, arp: -10.5 },
  build: (layer, ctx, intense) => {
    switch (layer) {
      case 'pads':
        return pads(ctx, intense);
      case 'arp':
        return arp(ctx, intense);
      case 'bass':
        acidBass(ctx, intense);
        return;
      case 'lead':
        return lead(ctx, intense);
      case 'drums':
        return drums(ctx, intense);
    }
  },
});
