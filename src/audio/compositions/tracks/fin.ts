/**
 * 20 — Fin de run. La mineur / Do majeur, 84 BPM. Respiration après la bataille.
 * Piano FM, leitmotiv Voidpulse apaisé (valeurs longues). Victoire et défaite partagent la
 * piste, variée par le moteur : victoire = toutes les couches, filtre ouvert ; défaite =
 * nappes + basse seulement, passe-bas et ralenti de 2 demi-tons.
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
import { DrumKit } from '../lib/drums';
import { chain, hp, reverb, sidechainGain } from '../lib/fx';
import { bassSynth, fmPoly, pwmPad, superSawPad } from '../lib/instruments';
import { type NoteEvent, phrase } from '../lib/notation';
import { FILL_BARS, inRange, TOTAL_BARS } from '../lib/stage';
import { Grid, Humanizer } from '../lib/time';
import type { TrackDef } from '../lib/types';

const GRID = new Grid(84);
const BARS = range(0, TOTAL_BARS);

// prettier-ignore
const CHORDS = [
  'Am9', 'Fmaj7', 'Cmaj7', 'G6',
  'Am9', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Em7', 'Dm9', 'G6',
  'Am9', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'G6', 'Cmaj7', 'E7sus4',
  'Fmaj7', 'G6', 'Em7', 'Am9', 'Dm9', 'G6', 'Cmaj7', 'Cmaj7',
  'Fmaj7', 'G6', 'Em7', 'Am9', 'Dm9', 'Fmaj7', 'E7sus4', 'E7',
];
const SLOTS = progression(CHORDS);

// Le leitmotiv en valeurs longues : la–do–mi… fa–mi.
const THEME = `A4:4 C5:4 E5:8 | F5:12 E5:4 | E5:8 G5:4 B5:4 | A5:8 G5:4 D5:4 |`;
const LEAD: NoteEvent[] = phrase(`
  _:16 | _:16 | _:16 | _:16 |
  ${THEME}
  C5:4 E5:4 A5:8 | G5:8 B4:8 | F5:6 E5:2 D5:8 | E5:12 _:4 |
  ${THEME}
  A5:8 C6:8 | B5:4 A5:4 G5:8 | E5:8 G5:4 C6:4 | B5:12 _:4 |
  C6:8 A5:8 | B5:6 A5:2 G5:8 | G5:8 E5:8 | B5:12 A5:4 |
  A5:4 F5:4 E5:8 | D5:8 E5:4 G5:4 | E5:16 | _:16 |
  A4:4 C5:4 E5:4 F5:4 | E5:8 D5:8 | B4:4 D5:4 G5:8 | E5:12 _:4 |
  A4:4 C5:4 E5:4 F5:4 | E5:12 C5:4 | B4:8 A4:8 | G#4:12 _:4
`);

function drumsOf(bar: number): DrumBar {
  if (bar < 4) return {};
  const p: DrumBar = {
    kick: 'x.........x.....',
    rim: '........x.......',
    shaker: 'x.x.x.x.x.x.x.x.',
  };
  if (inRange(bar, 20, 36)) p.hat = '..x...x...x...x.';
  if (FILL_BARS.has(bar)) p.rim = '........x...x.x.';
  return p;
}
const KICKS = hitTimes(GRID, BARS, (b) => drumsOf(b).kick);

export const endOfRun: TrackDef = {
  id: 'end-of-run',
  title: 'Fin de run — Respiration',
  bpm: 84,
  key: 'La mineur / Do majeur',
  introBars: 4,
  loopBars: 32,
  tailSeconds: 9,
  mix: { drums: -9, bass: -7, lead: -5.5, pads: -7, arp: -7.5 },
  layers: {
    pads: {
      enterAt: 0,
      build: async ({ grid, out, rng }) => {
        const hum = new Humanizer(rng, 5, 0.04);
        const warm = pwmPad({
          volume: -19,
          cutoff: 1600,
          rate: 0.2,
          env: { attack: 1.5, release: 3.5 },
        });
        const air = superSawPad({
          volume: -24,
          cutoff: 2600,
          count: 3,
          spread: 18,
          env: { attack: 2, release: 3.5 },
        });
        const bus = new Tone.Gain(1);
        warm.output.connect(bus);
        air.output.connect(bus);
        const chorus = new Tone.Chorus({
          frequency: 0.3,
          delayTime: 4,
          depth: 0.6,
          wet: 0.45,
        }).start(0);
        const rev = await reverb(7, 0.45);
        chain(bus, hp(100), chorus, rev, sidechainGain(KICKS, 0.06, 0.3), out);
        const voiced = voicings(SLOTS, { low: 55, high: 79, center: 66, maxNotes: 4 });
        playChords(warm, grid, SLOTS, voiced, { hum, vel: 0.6, overlap: 0.4 });
        playChords(
          air,
          grid,
          SLOTS,
          voiced.map((v) => v.map((n) => n + 12)),
          { hum, vel: 0.45, overlap: 0.4 },
        );
      },
    },
    bass: {
      enterAt: 0,
      build: ({ grid, out, rng }) => {
        const hum = new Humanizer(rng, 2, 0.05);
        const bass = bassSynth({
          volume: -12,
          type: 'square',
          cutoff: 120,
          octaves: 1.1,
          decay: 0.4,
          q: 0.7,
          sub: 1,
          env: { attack: 0.03 },
        });
        chain(bass.output, out);
        for (const bar of BARS) {
          bassBar(bass, grid, SLOTS, bar, bar < 4 ? 'L---------------' : 'L-------5---L---', {
            low: 33,
            hum,
            vel: 0.72,
            gate: 0.97,
          });
        }
      },
    },
    arp: {
      enterAt: 1,
      build: async ({ grid, out, rng }) => {
        const hum = new Humanizer(rng, 8, 0.1);
        // Piano FM (façon DX) : attaque nette, déclin long, légère brillance.
        const piano = fmPoly({
          volume: -15,
          harmonicity: 1,
          modulationIndex: 2.2,
          env: { attack: 0.003, decay: 2.2, sustain: 0.12, release: 1.2 },
          modEnv: { decay: 0.6, sustain: 0.1 },
        });
        const rev = await reverb(4.5, 0.32);
        chain(piano.output, hp(120), rev, out);
        for (const bar of BARS) {
          arpBar(piano, grid, SLOTS, bar, {
            low: 57,
            count: 5,
            pattern: [0, 2, 3, 4, 1, 3, 2, 4],
            rate: 2,
            gate: 1.6,
            vel: (s) => (s === 0 ? 0.7 : s % 4 === 0 ? 0.55 : 0.42),
            hum,
            skip: (s) => bar < 4 && s % 4 !== 0,
          });
        }
      },
    },
    drums: {
      enterAt: 1,
      build: async ({ grid, out, rng }) => {
        const hum = new Humanizer(rng, 4, 0.12);
        const kit = await DrumKit.create(out, {
          kickDecay: 0.45,
          kickPitch: 48,
          levels: { kick: -7, rim: -16, shaker: -24, hat: -27 },
          roomDecay: 2.6,
          roomWet: 0.32,
        });
        for (const bar of BARS) drumBar(kit, grid, bar, drumsOf(bar), hum);
      },
    },
    lead: {
      enterAt: 2,
      build: async ({ grid, out, rng }) => {
        const hum = new Humanizer(rng, 9, 0.08);
        const keys = fmPoly({
          volume: -11,
          harmonicity: 2,
          modulationIndex: 1.6,
          env: { attack: 0.004, decay: 2.8, sustain: 0.2, release: 1.4 },
          modEnv: { decay: 0.8, sustain: 0.05 },
        });
        const delay = new Tone.FeedbackDelay({
          delayTime: grid.beats(0.75),
          feedback: 0.3,
          wet: 0.2,
        });
        const rev = await reverb(5, 0.36);
        chain(keys.output, hp(160), delay, rev, out);
        playPhrase(keys, grid, LEAD, 0, { hum, gate: 0.98 });
      },
    },
  },
};
