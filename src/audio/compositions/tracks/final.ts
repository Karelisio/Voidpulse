/**
 * 19 — Boss final / mode Infini au-delà de 30 min. La mineur (la tonalité du menu : la boucle
 * est bouclée), 150 BPM. Apothéose : le leitmotiv Voidpulse harmonisé, orgue et chœurs,
 * arpèges rapides. Couches par phase comme le boss : nappes + basse + batterie, + arpèges,
 * + lead.
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
import { chain, hp, ramp, reverb, sidechainGain } from '../lib/fx';
import {
  bassSynth,
  formantVoice,
  leadSynth,
  organ,
  seqSynth,
  superSawPad,
} from '../lib/instruments';
import { type NoteEvent, phrase } from '../lib/notation';
import { FILL_BARS, inRange, SECTION_BARS, TOTAL_BARS } from '../lib/stage';
import { Grid, Humanizer } from '../lib/time';
import type { TrackDef } from '../lib/types';

const GRID = new Grid(150);
const BARS = range(0, TOTAL_BARS);

// prettier-ignore
const CHORDS = [
  'Am', 'F', 'Dm', 'E',
  'Am', 'F', 'C', 'G', 'Am', 'F', 'Dm', 'E',
  'Am', 'F', 'C', 'G', 'F', 'G', 'Am', 'E7',
  'Dm', 'Am', 'Bb', 'F', 'Dm', 'Am', 'E7sus4', 'E7',
  'F', 'G', 'Em7', 'Am', 'Dm', 'Bb', 'E7sus4', 'E7',
];
const SLOTS = progression(CHORDS);

const MOTIF = `A4:2 C5:2 E5:4 F5:6 E5:2-`;
const MOTIF_HIGH = `A5:2 C6:2 E6:4 F6:6 E6:2-`;
const LEAD: NoteEvent[] = phrase(`
  _:16 | _:16 | _:16 | B4:4 C5:4 D5:4 G#5:4 |
  ${MOTIF} | E5:6 F5:2 A5:4 C6:4 | G5:4 E5:2 C5:2 E5:4 G5:4 | D5:8 B4:4 D5:4 |
  ${MOTIF_HIGH} | E6:6 C6:2 A5:4 F5:4 | D5:4 F5:4 A5:4 D6:4 | B5:8 G#5:8 |
  ${MOTIF} | E5:6 F5:2 A5:4 C6:4 | G5:4 E5:2 C5:2 E5:4 G5:4 | D5:8 B4:4 D5:4 |
  C6:6 A5:2 F5:4 A5:4 | B5:6 D6:2 G6:8 | E6:4 C6:4 A5:4 E5:4 | G#5:8 E5:4 B4:4 |
  D6:8 F6:8 | E6:8 C6:8 | D6:6 C6:2 Bb5:8 | A5:12 _:4 |
  F5:4 A5:4 D6:4 F6:4 | E6:8 A5:8 | A5:8 B5:8 | G#5:8 D6:4 B5:4 |
  A5:2 C6:2 F6:4 G6:6 F6:2 | D6:8 B5:8 | E6:4 D6:4 B5:4 G5:4 | A5:12 _:4 |
  ${MOTIF} | E5:4 F5:4 Bb5:8 | A5:8 B5:8 | G#5:8 B5:4 E5:4
`);
const HARMONY = harmonizeBelow(
  LEAD.filter((ev) => ev.step >= 4 * 16),
  SLOTS,
);

function drumsOf(bar: number): DrumBar {
  if (bar < 2)
    return { toms: '4...4...4...4.44', crash: bar === 0 ? 'X...............' : undefined };
  if (bar < 4)
    return { kick: 'x.x.x.x.x.x.x.x.', snare: bar === 3 ? 'x.x.x.x.xxxxXXXX' : undefined };
  const half = inRange(bar, 20, 24);
  if (half) {
    return {
      kick: 'x.......x.......',
      snare: '........X.......',
      hat: 'x.x.x.x.x.x.x.x.',
      crash: bar === 20 ? 'X...............' : undefined,
    };
  }
  const p: DrumBar = {
    kick: inRange(bar, 28, 36) ? 'x.x.x.x.x.x.x.x.' : 'x...x.x.x...x.x.',
    snare: '....X.......X...',
    hat: 'xoxoxoxoxoxoxoxo',
    openHat: '..x...x...x...x.',
  };
  if (SECTION_BARS.has(bar)) p.crash = 'X...............';
  if (FILL_BARS.has(bar)) {
    delete p.openHat;
    p.toms = '........11223344';
    if (bar === 35) p.kick = 'xxxxxxxxxxxxxxxx';
  }
  return p;
}

const KICKS = hitTimes(GRID, BARS, (b) => (drumsOf(b).kick ? 'x...x...x...x...' : undefined));

export const finalBoss: TrackDef = {
  id: 'final-boss',
  title: 'Boss final — Apothéose',
  bpm: 150,
  key: 'La mineur',
  introBars: 4,
  loopBars: 32,
  tailSeconds: 7,
  mix: { drums: -4.5, bass: -6, lead: -6, pads: -8, arp: -9.5 },
  layers: {
    pads: {
      enterAt: 0,
      build: async ({ grid, out, rng }) => {
        const hum = new Humanizer(rng, 4, 0.04);
        const org = organ({ volume: -21 });
        const choir = formantVoice({ volume: -17, vowel: 'a', count: 3, spread: 28 });
        const saw = superSawPad({ volume: -23, cutoff: 2400, count: 3, spread: 34 });
        const bus = new Tone.Gain(1);
        org.output.connect(bus);
        choir.output.connect(bus);
        saw.output.connect(bus);
        const rev = await reverb(5.5, 0.32, 0.04);
        chain(bus, hp(90), rev, sidechainGain(KICKS, 0.3, 0.16), out);
        const voiced = voicings(SLOTS, { low: 52, high: 76, center: 63, maxNotes: 4 });
        playChords(org, grid, SLOTS, voiced, { hum, vel: 0.62, overlap: 0.05 });
        playChords(
          choir,
          grid,
          SLOTS,
          voiced.map((v) => v.map((n) => n + 12)),
          { hum, vel: 0.62, overlap: 0.25 },
        );
        playChords(saw, grid, SLOTS, voiced, { hum, vel: 0.55, overlap: 0.1, from: 4 });
      },
    },
    bass: {
      enterAt: 0,
      build: ({ grid, out, rng }) => {
        const hum = new Humanizer(rng, 1.5, 0.05);
        const bass = bassSynth({
          volume: -13,
          cutoff: 230,
          octaves: 3.2,
          decay: 0.13,
          q: 2.6,
          sub: -2,
        });
        const drive = new Tone.Distortion({ distortion: 0.3, oversample: '2x', wet: 0.4 });
        chain(
          bass.output,
          drive,
          new Tone.Filter({ type: 'lowpass', frequency: 3000 }),
          sidechainGain(KICKS, 0.4, 0.13),
          out,
        );
        for (const bar of BARS) {
          const pattern =
            bar < 2
              ? 'L-------L-------'
              : bar < 4 || inRange(bar, 28, 36)
                ? 'LLHLLLHLLLHLLLHL'
                : inRange(bar, 20, 24)
                  ? 'L-------L---L-H-'
                  : 'L-LHL-LHL-LHL-5H';
          bassBar(bass, grid, SLOTS, bar, pattern, {
            low: 33,
            hum,
            vel: 0.8,
            accents: [0, 4, 8, 12],
            gate: 0.72,
          });
        }
      },
    },
    drums: {
      enterAt: 0,
      build: async ({ grid, out, rng }) => {
        const hum = new Humanizer(rng, 2, 0.1);
        const kit = await DrumKit.create(out, {
          drive: 0.25,
          kickDecay: 0.3,
          kickPitch: 48,
          levels: { snare: -6, hat: -26, openHat: -27 },
          roomDecay: 2,
          roomWet: 0.22,
          clipDrive: 5,
        });
        for (const bar of BARS) drumBar(kit, grid, bar, drumsOf(bar), hum);
        riser(out, grid.t(2), grid.t(4), -18);
        riser(out, grid.t(27), grid.t(28), -22);
      },
    },
    arp: {
      enterAt: 1,
      build: async ({ grid, out, rng }) => {
        const hum = new Humanizer(rng, 1.5, 0.06);
        const seq = seqSynth({ volume: -18, type: 'fatsawtooth', cutoff: 2600, q: 2.5 });
        const delay = new Tone.PingPongDelay({
          delayTime: grid.beats(0.75),
          feedback: 0.22,
          wet: 0.2,
        });
        const rev = await reverb(2.4, 0.2);
        chain(seq.output, hp(180), delay, rev, out);
        ramp(seq.filter.frequency, 500, 2600, grid.t(2), grid.t(4));
        for (const bar of range(2, TOTAL_BARS)) {
          if (inRange(bar, 20, 22)) continue; // respiration à l'entrée du demi-temps
          arpBar(seq, grid, SLOTS, bar, {
            low: 57,
            count: 7,
            pattern: [0, 2, 4, 6, 5, 3, 4, 2, 0, 2, 4, 6, 5, 4, 3, 1],
            rate: 1,
            gate: 0.55,
            vel: (s) => (s % 4 === 0 ? 0.9 : 0.6),
            hum,
          });
        }
      },
    },
    lead: {
      enterAt: 2,
      build: async ({ grid, out, rng }) => {
        const hum = new Humanizer(rng, 4, 0.06);
        const opts = {
          type: 'fatsawtooth' as const,
          count: 3,
          spread: 22,
          cutoff: 1300,
          octaves: 3,
          q: 1.6,
          portamento: 0.015,
          env: { attack: 0.006, release: 0.22 },
        };
        const main = leadSynth({ ...opts, volume: -15 });
        const harm = leadSynth({ ...opts, volume: -21 });
        const octave = formantVoice({ volume: -21, vowel: 'o', poly: false, portamento: 0.02 });
        const bus = new Tone.Gain(1);
        main.output.connect(bus);
        harm.output.connect(bus);
        octave.output.connect(bus);
        const drive = new Tone.Distortion({ distortion: 0.25, oversample: '2x', wet: 0.3 });
        const delay = new Tone.FeedbackDelay({
          delayTime: grid.beats(0.75),
          feedback: 0.22,
          wet: 0.16,
        });
        const rev = await reverb(3, 0.24);
        chain(bus, hp(150), drive, delay, rev, out);
        playPhrase(main, grid, LEAD, 0, { hum, gate: 0.92 });
        playPhrase(harm, grid, HARMONY, 0, { hum, gate: 0.9, vel: 0.85 });
        // Chœur à l'octave inférieure sur les reprises du thème.
        playPhrase(
          octave,
          grid,
          LEAD.filter((ev) => ev.step >= 12 * 16),
          0,
          { hum, gate: 0.95, transpose: -12, vel: 0.8 },
        );
      },
    },
  },
};
