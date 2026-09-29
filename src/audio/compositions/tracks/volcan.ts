/**
 * 08-09 — Volcan (calme / intense). Fa phrygien, 128 BPM. Darksynth industriel.
 * Identité : riff de basse reese martelé sur la seconde mineure (fa–fa–sol♭–fa), stabs
 * cuivrés, percussions métalliques (enclume). Intense : double pédale, stabs bitcrushés,
 * montées de bruit « lave ».
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
import { chain, crusher, hp, reverb, sidechainGain } from '../lib/fx';
import {
  bassSynth,
  filterPoly,
  leadSynth,
  metalPerc,
  noiseBed,
  superSawPad,
} from '../lib/instruments';
import { hits, type NoteEvent, phrase } from '../lib/notation';
import { FILL_BARS, inRange, SECTION_BARS, stagePair, TOTAL_BARS } from '../lib/stage';
import { bassNote } from '../lib/theory';
import { Grid, Humanizer } from '../lib/time';
import type { LayerContext } from '../lib/types';

const GRID = new Grid(128);
const BARS = range(0, TOTAL_BARS);

// prettier-ignore
const CHORDS = [
  'Fm', 'Fm', 'Gb', 'Fm',
  'Fm', 'Gb', 'Fm', 'Gb', 'Bbm', 'Gb', 'Ebm', 'Gb',
  'Fm', 'Gb', 'Fm', 'Gb', 'Bbm', 'Db', 'Ebm', 'Gb',
  'Db', 'Ebm', 'Fm', 'Fm', 'Db', 'Ebm', 'Gb', 'Gb',
  'Bbm', 'Db', 'Ebm', 'Fm', 'Bbm', 'Gb', 'Ebm', 'Gb',
];
const SLOTS = progression(CHORDS);

const HOOK = `F5:2 F5:2 Gb5:4 F5:4 C5:4 | Db5:4 Eb5:4 Gb5:6 F5:2 | F5:2 F5:2 Gb5:4 Ab5:4 C6:4 | Bb5:6 Ab5:2 Gb5:8 |`;
const LEAD: NoteEvent[] = phrase(`
  _:16 | _:16 | _:16 | _:8 C5:2 Db5:2 Eb5:2 E5:2 |
  ${HOOK}
  F5:4 Db6:4 C6:4 Bb5:4 | Ab5:6 Gb5:2 F5:8 | Eb5:4 Gb5:4 Bb5:4 Db6:4 | C6:8 Db6:4 C6:4 |
  ${HOOK}
  Db6:4 C6:4 Bb5:4 F5:4 | Ab5:8 F5:4 Db5:4 | Gb5:6 F5:2 Eb5:4 Bb4:4 | C5:4 Db5:4 Eb5:4 Gb5:4 |
  F6:8 Eb6:4 Db6:4 | Gb6:8 F6:4 Eb6:4 | F6:6 C6:2 Ab5:8 | F5:4 Ab5:4 C6:4 Eb6:4 |
  F6:8 Ab6:4 F6:4 | Gb6:8 F6:4 Eb6:4 | Db6:6 Eb6:2 Db6:4 Bb5:4 | C6:12 _:4 |
  Bb5:4 Db6:4 F6:8 | Ab6:6 F6:2 Db6:8 | Gb6:4 F6:4 Eb6:4 Db6:4 | C6:8 F5:8 |
  F5:2 F5:2 Gb5:4 F5:4 Db5:4 | Bb4:4 Db5:4 Gb5:8 | F5:4 Gb5:4 Bb5:4 Eb6:4 | C6:8 Bb5:4 Gb5:2 E5:2
`);

// --- Riff de basse ----------------------------------------------------------------------------

/**
 * Riff d'une mesure, un caractère par pas : `0` fondamentale, `1` seconde mineure, `o` octave,
 * `3` tierce mineure, `-` tenue, `.` silence. Les accords de tonique et de ♭II gardent la
 * pédale de fa (le frottement sol♭/fa est la signature du stage).
 */
const RIFFS = {
  calm: '0-..0-..1-..0---',
  main: '0-0.1.0-0-0.1.o.',
  drive: '0.0.1.0.0.0.1.3.',
  fill: '0.0.1.0.o.o.1.3.',
  intro: '0---------------',
} as const;

function riffOf(bar: number, intense: boolean): string {
  if (bar < 2) return RIFFS.intro;
  if (!intense) return bar < 4 ? RIFFS.intro : RIFFS.calm;
  if (bar < 4) return RIFFS.drive;
  if (FILL_BARS.has(bar)) return RIFFS.fill;
  return inRange(bar, 20, 28) ? RIFFS.drive : RIFFS.main;
}

function riffRoot(bar: number): number {
  const chord = chordAt(SLOTS, bar, 0);
  const pedal = chord.symbol === 'Fm' || chord.symbol === 'Gb';
  return pedal ? 29 : bassNote(chord, 29); // fa1 (MIDI 29)
}

// --- Batterie ---------------------------------------------------------------------------------

function calmDrums(bar: number): DrumBar {
  if (bar < 4) return {};
  const p: DrumBar = {
    kick: 'x.......x.......',
    clap: '....x.......x...',
    hat: '..x...x...x...x.',
  };
  if (FILL_BARS.has(bar)) p.toms = '..........2.3.44';
  return p;
}

function intenseDrums(bar: number): DrumBar {
  if (bar < 2) return {};
  if (bar < 4)
    return { kick: 'x...x...x...x...', snare: bar === 3 ? '........x.x.XXXX' : undefined };
  const blast = bar === 27 || bar === 35;
  const p: DrumBar = {
    kick: inRange(bar, 20, 28) ? 'xxxxxxxxxxxxxxxx' : 'x.xxx.xxx.xxx.xx',
    snare: '....X.......X...',
    hat: 'x.x.x.x.x.x.x.x.',
  };
  if (SECTION_BARS.has(bar)) p.crash = 'X.......X.......';
  if (FILL_BARS.has(bar)) {
    p.toms = blast ? undefined : '........11223344';
    p.hat = 'x.x.x.x.........';
  }
  if (blast) {
    p.kick = 'xxxxxxxxxxxxxxxx';
    p.snare = '....X...xxxxXXXX';
  }
  return p;
}

const CALM_KICKS = hitTimes(GRID, BARS, (b) => calmDrums(b).kick);
const INTENSE_KICKS = hitTimes(GRID, BARS, (b) => {
  // Sidechain sur les temps seulement : la double pédale pomperait en continu.
  return intenseDrums(b).kick ? 'x...x...x...x...' : undefined;
});

/** Enclume : frappes métalliques sur les contretemps (calme) ou en motif (intense). */
const ANVIL = { calm: '......x.......x.', intense: '..x...x...x.x..x' };

// --- Couches ----------------------------------------------------------------------------------

async function pads({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 3, 0.05);
  // Stabs cuivrés : accords courts à enveloppe de filtre, sur les temps forts.
  const stabs = filterPoly({
    volume: -16,
    type: 'fatsawtooth',
    cutoff: 300,
    octaves: intense ? 4 : 3,
    q: 2,
    env: { attack: 0.01, decay: 0.25, sustain: 0.3, release: 0.25 },
    filterEnv: { decay: 0.2, sustain: 0.15 },
  });
  const dark = superSawPad({
    volume: -24,
    cutoff: 900,
    count: 3,
    spread: 40,
    env: { attack: 0.8, release: 2 },
  });
  const bus = new Tone.Gain(1);
  const rev = await reverb(3, 0.28);
  const sc = sidechainGain(intense ? INTENSE_KICKS : CALM_KICKS, 0.35, 0.2);
  chain(bus, hp(110), rev, sc, out);
  if (intense) {
    // Stabs bitcrushés, mêlés au signal propre.
    const crushed = new Tone.Gain(0.5);
    chain(stabs.output, crusher(10), crushed, bus);
    stabs.output.connect(bus);
  } else {
    stabs.output.connect(bus);
  }
  dark.output.connect(bus);
  const voiced = voicings(SLOTS, { low: 53, high: 75, center: 63, maxNotes: 4 });
  playChords(dark, grid, SLOTS, voiced, { hum, vel: 0.6, overlap: 0.15 });
  const stabPattern = (bar: number): string =>
    bar < 4
      ? bar === 3
        ? 'X.....X.....X...'
        : ''
      : intense
        ? inRange(bar, 20, 28)
          ? 'X..X..X...X..X..'
          : 'X.....X.....X...'
        : 'X...............';
  SLOTS.forEach((slot, i) => {
    for (const h of hits(stabPattern(slot.bar))) {
      if (h.step < slot.step || h.step >= slot.step + slot.len) continue;
      stabs.play(voiced[i], hum.time(grid.t(slot.bar, h.step)), grid.dur(2), hum.vel(h.vel * 0.85));
    }
  });
  // Lave : grondement de bruit brun, montées avant chaque section en intense.
  const lava = noiseBed({ volume: -32, type: 'brown', center: 180, octaves: 2, rate: 0.07 });
  lava.output.connect(rev);
  lava.start(0, grid.t(TOTAL_BARS) + 1, 0.9);
  if (intense)
    for (const s of [12, 20, 28, 36]) riser(bus, grid.t(s - 1), grid.t(s), -24, 150, 3000);
}

/** Enclume et tôles : percussions métalliques accordées sur la fondamentale. */
async function arp({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 3, 0.12);
  const anvil = metalPerc({ volume: -20, decay: intense ? 0.18 : 0.3, resonance: 2600 });
  const sheet = metalPerc({ volume: -26, decay: 0.8, harmonicity: 8.5, resonance: 5200 });
  const delay = new Tone.PingPongDelay({ delayTime: grid.beats(0.75), feedback: 0.25, wet: 0.22 });
  const rev = await reverb(2.5, 0.3);
  chain(anvil.output, hp(300), delay, rev, out);
  chain(sheet.output, hp(500), rev);
  for (const bar of range(bar0(intense), TOTAL_BARS)) {
    const root = riffRoot(bar) + 36;
    for (const h of hits(intense ? ANVIL.intense : ANVIL.calm)) {
      anvil.play([root], hum.time(grid.t(bar, h.step)), grid.dur(1), hum.vel(0.8));
    }
    if (SECTION_BARS.has(bar) || (intense && bar % 2 === 0))
      sheet.play([root + 7], hum.time(grid.t(bar, 0)), grid.dur(8), hum.vel(0.7));
  }
}
const bar0 = (intense: boolean): number => (intense ? 2 : 4);

/** Reese : deux scies désaccordées, saturées, riff sur la seconde mineure. */
function bass({ grid, out, rng }: LayerContext, intense: boolean): void {
  const hum = new Humanizer(rng, 1.5, 0.05);
  const reese = bassSynth({
    volume: -13,
    type: 'fatsawtooth',
    cutoff: intense ? 260 : 190,
    octaves: intense ? 3 : 2.2,
    decay: 0.18,
    q: 2.5,
    sub: -2,
  });
  const drive = new Tone.Distortion({
    distortion: intense ? 0.55 : 0.3,
    oversample: '2x',
    wet: 0.5,
  });
  const tone = new Tone.Filter({ type: 'lowpass', frequency: intense ? 3000 : 2000, rolloff: -12 });
  chain(
    reese.output,
    drive,
    tone,
    sidechainGain(intense ? INTENSE_KICKS : CALM_KICKS, 0.4, 0.14),
    out,
  );
  const offsets: Record<string, number> = { '0': 0, '1': 1, o: 12, '3': 3 };
  for (const bar of BARS) {
    const riff = riffOf(bar, intense);
    const root = riffRoot(bar);
    let i = 0;
    while (i < 16) {
      const ch = riff[i];
      if (ch === '.' || ch === '-') {
        i++;
        continue;
      }
      let len = 1;
      while (i + len < 16 && riff[i + len] === '-') len++;
      const t0 = grid.t(bar, i);
      const v = i % 4 === 0 ? 0.9 : 0.72;
      reese.play([root + offsets[ch]], hum.time(t0), grid.dur(len) * 0.8, hum.vel(v));
      i += len;
    }
  }
}

/** Lead : scie saturée (intense), carré filtré plus sourd (calme). */
async function lead({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 4, 0.07);
  const main = leadSynth({
    volume: -15,
    type: intense ? 'fatsawtooth' : 'fatsquare',
    count: 3,
    spread: intense ? 22 : 12,
    cutoff: intense ? 1200 : 700,
    octaves: 2.8,
    q: 1.6,
    portamento: 0.02,
    env: { attack: 0.006, release: 0.2 },
  });
  const drive = new Tone.Distortion({
    distortion: intense ? 0.4 : 0.15,
    oversample: '2x',
    wet: 0.4,
  });
  const delay = new Tone.FeedbackDelay({ delayTime: grid.beats(0.75), feedback: 0.25, wet: 0.18 });
  const rev = await reverb(2.6, 0.22);
  chain(main.output, hp(160), drive, delay, rev, out);
  playPhrase(main, grid, LEAD, 0, { hum, gate: 0.9 });
  if (intense) {
    // Doublure à l'octave inférieure dans la section B.
    const low = leadSynth({
      volume: -21,
      type: 'fatsawtooth',
      cutoff: 500,
      octaves: 2,
      portamento: 0.02,
    });
    low.output.connect(drive);
    playPhrase(
      low,
      grid,
      LEAD.filter((ev) => ev.step >= 20 * 16),
      0,
      { hum, gate: 0.9, transpose: -12 },
    );
  }
}

async function drums({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 2, 0.08);
  const kit = await DrumKit.create(out, {
    drive: intense ? 0.3 : 0.15,
    kickDecay: intense ? 0.22 : 0.35,
    kickPitch: 48,
    levels: intense ? { kick: -3, snare: -6, hat: -25 } : { clap: -9, hat: -25 },
    roomDecay: 1.5,
    roomWet: 0.18,
    clipDrive: intense ? 5 : 4,
  });
  for (const bar of BARS)
    drumBar(kit, grid, bar, intense ? intenseDrums(bar) : calmDrums(bar), hum);
  if (intense) riser(out, grid.t(2), grid.t(4), -20);
}

export const [volcanCalm, volcanIntense] = stagePair({
  stage: 4,
  name: 'Volcan',
  bpm: 128,
  key: 'Fa phrygien',
  tailSeconds: 5,
  mixCalm: { drums: -6.5, bass: -5.5, lead: -6.5, pads: -8.5, arp: -10 },
  mixIntense: { drums: -4.5, bass: -5.5, lead: -6.5, pads: -9, arp: -10.5 },
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
