/**
 * 01 — Menu « Nocturne néon ». La mineur, 96 BPM.
 * Expose le leitmotiv Voidpulse : La–Do–Mi–Fa…Mi (1–♭3–5–♭6–5), rythme court-court-long.
 * Structure : intro 4 mesures, A1/A2 (16), B1/B2 (16). Toutes les couches entrent au palier 0.
 */
import * as Tone from 'tone';
import {
  arpBar,
  bassBar,
  type ChordSlot,
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
import { bassSynth, fmPoly, leadSynth, pwmPad, seqSynth, superSawPad } from '../lib/instruments';
import { type NoteEvent, phrase } from '../lib/notation';
import { Grid, Humanizer } from '../lib/time';
import type { TrackDef } from '../lib/types';

const GRID = new Grid(96);
const BARS = range(0, 36);

// prettier-ignore
const CHORDS = [
  // Intro
  'Am9', 'Fmaj7', 'E7sus4', 'E7',
  // A1
  'Am9', 'Fmaj7', 'C/E', 'G6', 'Am9', 'Fmaj7', 'C/E', 'G6',
  // A2
  'Am9', 'Fmaj7', 'C/E', 'G6', 'Dm9', 'F/A', 'E7sus4', 'E7',
  // B1 : bascule vers le relatif majeur
  'Fmaj7', 'G6', 'Em7', 'Am9', 'Dm9', 'G6', 'Cmaj7', 'E7',
  // B2
  'Fmaj7', 'G6', 'Em7', 'Am9', 'Dm9', 'F/A', 'E7sus4', 'E7',
];
const SLOTS = progression(CHORDS);

const inRange = (bar: number, from: number, to: number): boolean => bar >= from && bar < to;
const FILL_BARS = new Set([11, 19, 27, 35]);
const CRASH_BARS = new Set([4, 12, 20, 28]);

function drumsOf(bar: number): DrumBar {
  if (bar < 4) return {};
  const a1 = inRange(bar, 4, 12);
  const b1 = inRange(bar, 20, 28);
  const busy = inRange(bar, 12, 20) || inRange(bar, 28, 36);
  const p: DrumBar = {
    kick: a1 ? 'x.......x.......' : b1 ? 'x.....x.x.......' : 'x.......x.x.....',
    snare: '....X.......X...',
    hat: busy ? 'xoxoxoxoxoxoxoxo' : b1 ? 'x...x...x...x...' : 'x.x.x.x.x.x.x.x.',
  };
  if (b1) p.openHat = '..x...x...x...x.';
  if (busy) p.clap = '....x.......x...';
  if (CRASH_BARS.has(bar)) p.crash = 'X...............';
  if (FILL_BARS.has(bar)) {
    p.hat = 'x.x.x.x.........';
    delete p.openHat;
    if (bar === 11) p.toms = '........1.2.3.44';
    if (bar === 19) p.snare = '....X.......XoXX';
    if (bar === 27) p.toms = '........11223344';
    if (bar === 35) p.snare = '....X...X.X.XXXX';
  }
  return p;
}

const KICKS = hitTimes(GRID, BARS, (b) => drumsOf(b).kick);
const SNARES = hitTimes(GRID, BARS, (b) => drumsOf(b).snare);

function bassPattern(bar: number): string {
  if (bar < 4) return 'L---------------';
  if (FILL_BARS.has(bar)) return 'L-H-L-H-L-5-H-5-';
  if (inRange(bar, 12, 20) || inRange(bar, 28, 36)) return 'L--L--H-L--L--H-';
  return 'L-H-L-H-L-H-L-H-';
}

// Mélodie principale (une ligne par mesure, barres vérifiées).
const LEAD: NoteEvent[] = phrase(`
  _:16 | _:16 | _:16 | _:12 B4:2 G#4:2 |
  A4:2 C5:2 E5:4 F5:6 E5:2- | E5:6 C5:2 D5:4 E5:4 | G5:4 F5:2 E5:2 D5:6 C5:2 | D5:8 E5:4 D5:2 B4:2 |
  A4:2 C5:2 E5:4 F5:6 E5:2- | E5:6 G5:2 A5:4 C6:4 | B5:4 A5:2 G5:2 E5:8 | D5:4 E5:4 G5:6 G#5:2 |
  A5:2 C6:2 E6:4 F6:6 E6:2- | E6:6 C6:2 D6:4 E6:4 | C6:4 B5:2 A5:2 G5:6 E5:2 | D5:8 E5:4 G5:4 |
  F5:4 E5:2 D5:2 A5:8 | G5:4 F5:2 E5:2 C5:8 | D5:4 E5:4 A5:8 | G#5:6 E5:2 B5:4 D6:4 |
  C6:12 B5:2 A5:2 | B5:8 G5:4 E5:4 | G5:12 E5:2 G5:2 | A5:6 C6:2 B5:8 |
  A5:6 G5:2 F5:4 E5:4 | D5:6 E5:2 G5:8 | E5:4 G5:4 B5:8 | G#5:8 E5:4 B4:2 G#4:2 |
  A4:2 C5:2 E5:4 F5:6 E5:2- | E5:6 D5:2 B4:4 D5:4 | E5:4 G5:4 B5:6 A5:2 | C6:8 B5:4 A5:4 |
  A5:4 F5:4 E5:4 D5:4 | C5:6 D5:2 E5:4 F5:4 | E5:8 A5:4 B5:4 | G#5:8 E5:4 B4:2 G#4:2
`);

const barOf = (ev: NoteEvent): number => Math.floor(ev.step / 16);
/** Seconde voix (notes de l'accord sous la mélodie) sur les reprises du thème. */
const HARMONY = harmonizeBelow(
  LEAD.filter((ev) => inRange(barOf(ev), 12, 16) || inRange(barOf(ev), 28, 32)),
  SLOTS,
);

/** Notes guides (tierce, septième/neuvième) d'un accord, autour de `center`. */
function guideTones(slot: ChordSlot, center: number): [number, number] {
  const iv = slot.chord.intervals;
  const third = iv.includes(3) ? 3 : iv.includes(4) ? 4 : iv.includes(5) ? 5 : 7;
  const color = iv.includes(14)
    ? 14
    : iv.includes(11)
      ? 11
      : iv.includes(10)
        ? 10
        : iv.includes(9)
          ? 9
          : 7;
  const place = (interval: number): number => {
    const pc = (slot.chord.root + interval) % 12;
    let n = center - 6;
    while (n % 12 !== pc) n++;
    return n;
  };
  return [place(color), place(third)];
}

export const menu: TrackDef = {
  id: 'menu',
  title: 'Menu — Nocturne néon',
  bpm: 96,
  key: 'La mineur',
  introBars: 4,
  loopBars: 32,
  tailSeconds: 6,
  mix: { drums: -5, bass: -6, lead: -6.5, pads: -8, arp: -11 },
  layers: {
    pads: {
      enterAt: 0,
      build: async ({ grid, out, rng }) => {
        const hum = new Humanizer(rng, 4, 0.05);
        const main = superSawPad({ volume: -16, cutoff: 2300, count: 3, spread: 30 });
        const warm = pwmPad({ volume: -22, cutoff: 1500 });
        const bus = new Tone.Gain(1);
        main.output.connect(bus);
        warm.output.connect(bus);
        const chorus = new Tone.Chorus({
          frequency: 0.8,
          delayTime: 3.5,
          depth: 0.6,
          spread: 180,
          wet: 0.45,
        }).start(0);
        const rev = await reverb(4.5, 0.35);
        chain(bus, hp(110), chorus, rev, sidechainGain(KICKS, 0.3, 0.26), out);
        ramp(main.filter.frequency, 420, 2300, 0, grid.t(4));
        const voiced = voicings(SLOTS, { low: 55, high: 79, center: 66, maxNotes: 4 });
        playChords(main, grid, SLOTS, voiced, { hum, vel: 0.7, overlap: 0.12 });
        playChords(warm, grid, SLOTS, voiced, { hum, vel: 0.6, overlap: 0.12 });
      },
    },
    bass: {
      enterAt: 0,
      build: ({ grid, out, rng }) => {
        const hum = new Humanizer(rng, 2, 0.05);
        const bass = bassSynth({
          volume: -12,
          cutoff: 170,
          octaves: 3.3,
          decay: 0.19,
          q: 2.4,
          sub: -3,
        });
        chain(bass.output, sidechainGain(KICKS, 0.45, 0.2), out);
        for (const bar of BARS) {
          bassBar(bass, grid, SLOTS, bar, bassPattern(bar), {
            low: 33,
            hum,
            vel: bar < 4 ? 0.55 : 0.8,
            accents: [0, 8],
            gate: bar < 4 ? 0.98 : 0.82,
          });
        }
      },
    },
    drums: {
      enterAt: 0,
      build: async ({ grid, out, rng }) => {
        const hum = new Humanizer(rng, 3, 0.1);
        const kit = await DrumKit.create(out, {
          gatedHold: 0.26,
          snareTimes: SNARES,
          drive: 0.12,
          kickDecay: 0.45,
          kickPitch: 50,
        });
        for (const bar of BARS) drumBar(kit, grid, bar, drumsOf(bar), hum);
        riser(out, grid.t(2), grid.t(4), -20);
        riser(out, grid.t(35), grid.t(36), -24);
      },
    },
    arp: {
      enterAt: 0,
      build: async ({ grid, out, rng }) => {
        const hum = new Humanizer(rng, 3, 0.1);
        const seq = seqSynth({ volume: -18, type: 'pwm', cutoff: 2600, q: 1.5 });
        const delay = new Tone.PingPongDelay({
          delayTime: grid.beats(0.75),
          feedback: 0.3,
          wet: 0.28,
        });
        const rev = await reverb(3, 0.25);
        chain(seq.output, hp(160), delay, rev, out);
        ramp(seq.filter.frequency, 500, 2600, 0, grid.t(4));
        const pattern = [0, 1, 2, 3, 4, 3, 2, 1];
        for (const bar of BARS) {
          const rate = bar < 12 ? 2 : 1;
          arpBar(seq, grid, SLOTS, bar, {
            low: 57,
            count: 6,
            pattern,
            rate,
            gate: 0.7,
            vel: (s) => (s % 4 === 0 ? 0.85 : 0.6),
            hum,
          });
        }
        // Contre-chant de cloches sur les reprises (A2, B2) : notes guides en blanches.
        const bell = fmPoly({
          volume: -21,
          harmonicity: 3.01,
          modulationIndex: 7,
          env: { decay: 1.8, release: 1.4 },
          modEnv: { decay: 0.7 },
        });
        bell.output.connect(rev);
        for (const slot of SLOTS) {
          if (!(inRange(slot.bar, 12, 20) || inRange(slot.bar, 28, 36))) continue;
          const [color, third] = guideTones(slot, 79);
          bell.play([color], hum.time(grid.t(slot.bar, slot.step)), grid.dur(8), hum.vel(0.7));
          bell.play([third], hum.time(grid.t(slot.bar, slot.step + 8)), grid.dur(8), hum.vel(0.6));
        }
      },
    },
    lead: {
      enterAt: 0,
      build: async ({ grid, out, rng }) => {
        const hum = new Humanizer(rng, 6, 0.08);
        const leadOpts = {
          type: 'fatsawtooth' as const,
          count: 2,
          spread: 12,
          cutoff: 900,
          octaves: 2.6,
          q: 1.4,
          portamento: 0.025,
          env: { attack: 0.012, release: 0.28 },
        };
        const lead = leadSynth({ ...leadOpts, volume: -14 });
        const harm = leadSynth({ ...leadOpts, volume: -21 });
        const bus = new Tone.Gain(1);
        lead.output.connect(bus);
        harm.output.connect(bus);
        const vibrato = new Tone.Vibrato({ frequency: 5.2, depth: 0.06 });
        const delay = new Tone.FeedbackDelay({
          delayTime: grid.beats(0.75),
          feedback: 0.32,
          wet: 0.22,
        });
        const rev = await reverb(3.2, 0.28);
        chain(bus, hp(140), vibrato, delay, rev, out);
        playPhrase(lead, grid, LEAD, 0, { hum, gate: 0.94 });
        playPhrase(harm, grid, HARMONY, 0, { hum, gate: 0.9, vel: 0.8 });
      },
    },
  },
};
