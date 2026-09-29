/**
 * 10-11 — Station orbitale (calme / intense). Sol lydien, 118 BPM. Apesanteur, émerveillement.
 * Identité : séquences d'arpèges façon école de Berlin (scie filtrée, filtre qui respire),
 * batterie 808, lead « vocodé » (voix à formants), motif qui monte par la quarte augmentée
 * (sol–do#). Intense : arpèges en triples croches, nappes pompées par le sidechain.
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
import { chain, hp, ramp, reverb, sidechainGain } from '../lib/fx';
import { bassSynth, fmPoly, formantVoice, pwmPad, seqSynth, superSawPad } from '../lib/instruments';
import { type NoteEvent, phrase } from '../lib/notation';
import { FILL_BARS, inRange, SECTION_BARS, stagePair, TOTAL_BARS } from '../lib/stage';
import { Grid, Humanizer } from '../lib/time';
import type { LayerContext } from '../lib/types';

const GRID = new Grid(118);
const BARS = range(0, TOTAL_BARS);

// prettier-ignore
const CHORDS = [
  'Gmaj7', 'A/G', 'Gmaj7', 'A/G',
  'Gmaj7', 'A/G', 'Gmaj7', 'A/G', 'Em9', 'D', 'Bm7', 'A',
  'Gmaj7', 'A/G', 'Gmaj7', 'A/G', 'Em9', 'F#m7', 'Gmaj7', 'A',
  'Em9', 'Bm7', 'Gmaj7', 'D', 'Em9', 'Bm7', 'Gmaj7', 'A',
  'Em9', 'Bm7', 'Gmaj7', 'D', 'C#m7b5', 'F#m7', 'Gmaj7', 'A',
];
const SLOTS = progression(CHORDS);

const RISE = `G5:2 A5:2 B5:4 C#6:8 | B5:4 A5:4 E5:8 | D5:2 E5:2 F#5:4 G5:4 D6:4 |`;
const LEAD: NoteEvent[] = phrase(`
  _:16 | _:16 | _:16 | _:12 D5:4 |
  ${RISE} C#6:12 _:4 |
  B5:4 F#5:4 G5:4 B5:4 | A5:8 F#5:4 D5:4 | D5:4 F#5:4 A5:4 B5:4 | C#6:8 E6:8 |
  ${RISE} C#6:8 E6:4 C#6:4 |
  F#6:8 E6:4 B5:4 | C#6:8 A5:4 E5:4 | F#5:4 G5:4 B5:4 D6:4 | C#6:12 _:4 |
  E6:8 D6:4 B5:4 | F#5:8 A5:8 | G5:4 B5:4 C#6:4 D6:4 | A5:16 |
  G5:4 F#5:2 E5:2 B5:8 | A5:4 F#5:4 D6:8 | C#6:6 D6:2 F#6:8 | E6:12 _:4 |
  B5:4 E6:4 F#6:8 | D6:8 B5:4 A5:4 | B5:6 C#6:2 D6:8 | A5:8 F#5:8 |
  G5:8 E5:4 C#5:4 | E5:4 F#5:4 A5:4 C#6:4 | B5:8 C#6:8 | A5:8 _:4 D5:4
`);

// --- Batterie 808 -------------------------------------------------------------------------

function calmDrums(bar: number): DrumBar {
  if (bar < 4) return {};
  const p: DrumBar = {
    kick: inRange(bar, 20, 36) ? 'x.........x.....' : 'x.......x.......',
    clap: '....x.......x...',
    hat: 'x.x.x.x.x.x.x.x.',
  };
  if (FILL_BARS.has(bar)) p.hat = 'x.x.x.x.xxxxxxxx';
  return p;
}

function intenseDrums(bar: number): DrumBar {
  if (bar < 2) return {};
  if (bar < 4) return { kick: 'x...x...x...x...', hat: 'xxxxxxxxxxxxxxxx' };
  const p: DrumBar = {
    kick: inRange(bar, 20, 28) ? 'x..x..x...x..x..' : 'x...x...x...x...',
    clap: '....x.......x...',
    snare: '....x.......x...',
    hat: 'xoxoxoxoxoxoxoxo',
    openHat: '..x...x...x...x.',
  };
  if (SECTION_BARS.has(bar)) p.crash = 'X...............';
  if (FILL_BARS.has(bar)) {
    p.hat = 'xoxoxoxo........';
    p.toms = '........11223344';
    delete p.openHat;
  }
  return p;
}

const CALM_KICKS = hitTimes(GRID, BARS, (b) => calmDrums(b).kick);
const INTENSE_KICKS = hitTimes(GRID, BARS, (b) => intenseDrums(b).kick);

// --- Couches ----------------------------------------------------------------------------------

/** Nappes spatiales : PWM chaleureuse + supersaw aérienne ; pompées par le kick en intense. */
async function pads({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 5, 0.05);
  const warm = pwmPad({ volume: -19, cutoff: 1800, rate: 0.25, env: { attack: 1.2, release: 3 } });
  const air = superSawPad({
    volume: -21,
    cutoff: intense ? 4200 : 3200,
    count: 3,
    spread: 20,
    env: { attack: 1.4, release: 3 },
  });
  const bus = new Tone.Gain(1);
  warm.output.connect(bus);
  air.output.connect(bus);
  const chorus = new Tone.Chorus({ frequency: 0.4, delayTime: 4, depth: 0.7, wet: 0.5 }).start(0);
  const rev = await reverb(7.5, 0.45);
  const sc = sidechainGain(intense ? INTENSE_KICKS : CALM_KICKS, intense ? 0.55 : 0.15, 0.3);
  chain(bus, hp(120), chorus, rev, sc, out);
  const voiced = voicings(SLOTS, { low: 55, high: 81, center: 67, maxNotes: 4 });
  playChords(warm, grid, SLOTS, voiced, { hum, vel: 0.62, overlap: 0.3 });
  playChords(
    air,
    grid,
    SLOTS,
    voiced.map((v) => v.map((n) => n + 12)),
    { hum, vel: 0.5, overlap: 0.3 },
  );
}

/**
 * École de Berlin : séquence de scie filtrée en doubles croches (calme) ou triples croches
 * (intense), filtre qui s'ouvre et se referme sur 8 mesures ; échos de cloches FM.
 */
async function arp({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 1.5, 0.06);
  const seq = seqSynth({
    volume: -19,
    type: 'fatsawtooth',
    cutoff: 1400,
    q: 4,
    env: { decay: 0.09, sustain: 0.1, release: 0.06 },
  });
  const delay = new Tone.PingPongDelay({ delayTime: grid.beats(0.75), feedback: 0.35, wet: 0.3 });
  const rev = await reverb(4, 0.3);
  chain(seq.output, hp(180), delay, rev, out);
  // Respiration du filtre : 8 mesures pour s'ouvrir, 8 pour se refermer.
  for (let bar = 0; bar < TOTAL_BARS; bar += 8) {
    const f = seq.filter.frequency;
    ramp(f, 700, intense ? 4200 : 3000, grid.t(bar), grid.t(bar + 4));
    ramp(f, intense ? 4200 : 3000, 700, grid.t(bar + 4), grid.t(bar + 8));
  }
  const rate = (bar: number): number => (!intense || bar < 4 ? 1 : inRange(bar, 20, 28) ? 1 : 0.5);
  for (const bar of BARS) {
    arpBar(seq, grid, SLOTS, bar, {
      low: 55,
      count: 6,
      pattern: [0, 2, 4, 5, 3, 1, 4, 2],
      rate: rate(bar),
      gate: 0.55,
      vel: (s) => (s % 4 === 0 ? 0.85 : s % 2 === 0 ? 0.62 : 0.5),
      hum,
    });
  }
  const bell = fmPoly({
    volume: -22,
    harmonicity: 4.01,
    modulationIndex: 5,
    env: { decay: 1.6, release: 1.4 },
    modEnv: { decay: 0.6 },
  });
  bell.output.connect(rev);
  // Signaux lointains : quarte augmentée sol–do# à chaque début de section.
  for (const bar of [4, 12, 20, 28])
    bell.play([79, 85], hum.time(grid.t(bar, 8)), grid.dur(8), hum.vel(0.6));
}

/** Basse 808 : sinus long et glissé (calme), + scie courte en croches (intense). */
function bass({ grid, out, rng }: LayerContext, intense: boolean): void {
  const hum = new Humanizer(rng, 1.5, 0.05);
  const synth = bassSynth({
    volume: -12,
    type: intense ? 'sawtooth' : 'square',
    cutoff: intense ? 180 : 110,
    octaves: intense ? 3 : 1,
    decay: 0.2,
    q: 1.5,
    sub: intense ? -2 : 2,
    portamento: 0.03,
  });
  chain(
    synth.output,
    sidechainGain(intense ? INTENSE_KICKS : CALM_KICKS, intense ? 0.5 : 0.15, 0.2),
    out,
  );
  for (const bar of BARS) {
    let pattern: string;
    if (!intense) pattern = bar < 4 ? 'L---------------' : 'L-------L-----5-';
    else if (bar < 4) pattern = 'L-L-L-L-L-L-L-L-';
    else if (FILL_BARS.has(bar)) pattern = 'L-H-L-H-5-H-L-H-';
    else pattern = inRange(bar, 20, 28) ? 'L--L--L-H-L--L--' : 'L-LHL-LHL-LHL-5H';
    bassBar(synth, grid, SLOTS, bar, pattern, {
      low: 31,
      hum,
      vel: 0.8,
      accents: [0, 8],
      gate: intense ? 0.7 : 0.95,
    });
  }
}

/** Lead « vocodé » : voix à formants monophonique (voyelle « o »), doublée en intense. */
async function lead({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 6, 0.08);
  const voice = formantVoice({
    volume: -13,
    vowel: 'o',
    poly: false,
    count: 3,
    spread: 14,
    portamento: 0.05,
    env: { attack: 0.04, release: 0.35 },
  });
  const vibrato = new Tone.Vibrato({ frequency: 5, depth: 0.05 });
  const delay = new Tone.PingPongDelay({ delayTime: grid.beats(0.75), feedback: 0.3, wet: 0.22 });
  const rev = await reverb(4.5, 0.32);
  chain(voice.output, hp(200), vibrato, delay, rev, out);
  playPhrase(voice, grid, LEAD, 0, { hum, gate: 0.95 });
  if (intense) {
    const ah = formantVoice({ volume: -19, vowel: 'a', poly: false, portamento: 0.05 });
    ah.output.connect(vibrato);
    playPhrase(
      ah,
      grid,
      LEAD.filter((ev) => ev.step >= 12 * 16),
      0,
      { hum, gate: 0.95, transpose: 12, vel: 0.8 },
    );
  }
}

async function drums({ grid, out, rng }: LayerContext, intense: boolean): Promise<void> {
  const hum = new Humanizer(rng, 2.5, 0.1);
  const kit = await DrumKit.create(out, {
    drive: intense ? 0.1 : 0,
    kickDecay: 0.75, // 808 : kick long et grave
    kickPitch: 42,
    levels: intense ? { snare: -12, clap: -9 } : { kick: -5, clap: -11, hat: -24 },
    roomDecay: 1.8,
    roomWet: 0.2,
  });
  for (const bar of BARS)
    drumBar(kit, grid, bar, intense ? intenseDrums(bar) : calmDrums(bar), hum);
  if (intense) riser(out, grid.t(2), grid.t(4), -22);
}

export const [stationCalm, stationIntense] = stagePair({
  stage: 5,
  name: 'Station orbitale',
  bpm: 118,
  key: 'Sol lydien',
  tailSeconds: 8,
  mixCalm: { drums: -7, bass: -6.5, lead: -6, pads: -8, arp: -9 },
  mixIntense: { drums: -5, bass: -6, lead: -6.5, pads: -8.5, arp: -9 },
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
