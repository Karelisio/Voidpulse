/**
 * 18 — Boss (commun aux boss de stage). Do mineur avec seconde bémolisée (ré♭), 140 BPM.
 * Le leitmotif devient un ostinato menaçant (Do–Mi♭–Sol–La♭) ; les couches suivent les
 * phases du boss : phase 1 = nappes + basse + batterie, phase 2 = + ostinato, puis + lead.
 */
import * as Tone from 'tone';
import {
  bassBar,
  type ChordSlot,
  chordAt,
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
import { bassSynth, filterPoly, leadSynth, seqSynth, superSawPad } from '../lib/instruments';
import { type NoteEvent, phrase } from '../lib/notation';
import { clipToWindow } from '../lib/section';
import { Grid, Humanizer } from '../lib/time';
import type { TrackDef } from '../lib/types';

const GRID = new Grid(140);
const BARS = range(0, 36);
const inRange = (bar: number, from: number, to: number): boolean => bar >= from && bar < to;

// prettier-ignore
const CHORDS = [
  // Intro
  'Cm', 'Cm', 'Db', 'G',
  // A1
  'Cm', 'Db', 'Cm', 'Db', 'Ab', 'Fm', 'Db', 'G',
  // A2
  'Cm', 'Db', 'Ab', 'G', 'Cm', 'Db', 'Ab', 'G7',
  // B1 : section héroïque, demi-temps puis relance
  'Fm', 'Db', 'Eb', 'Cm', 'Fm', 'Db', 'Eb', 'G',
  // B2
  'Fm', 'Db', 'Eb', 'Cm', 'Ab', 'Db', 'G', 'G7',
];
const SLOTS = progression(CHORDS);

const LEAD: NoteEvent[] = phrase(`
  _:16 | _:16 | _:16 | G5:4 F5:4 D5:4 B4:4 |
  C5:2 Eb5:2 G5:4 Ab5:6 G5:2- | G5:6 F5:2 Eb5:2 Db5:6 | C5:2 Eb5:2 G5:4 Ab5:6 Bb5:2 | C6:8 Bb5:2 Ab5:2 F5:4 |
  Eb5:6 C5:2 Eb5:4 Ab5:4 | Ab5:6 G5:2 F5:8 | F5:4 Ab5:4 Db6:4 C6:4 | B5:8 D6:4 B5:2 G5:2 |
  G5:2 G5:2 C6:4 Bb5:2 Ab5:2 G5:4 | Ab5:4 F5:4 Db5:4 F5:4 | Eb5:4 Ab5:4 C6:8 | B5:6 Ab5:2 G5:8 |
  G5:2 G5:2 C6:4 Bb5:2 Ab5:2 G5:4 | Ab5:4 F5:4 Ab5:4 Db6:4 | C6:6 Bb5:2 Ab5:4 Eb5:4 | D6:4 B5:4 G5:4 F5:2 D5:2 |
  C6:8 Ab5:4 F5:4 | F5:8 Ab5:4 Db6:4 | Bb5:8 G5:4 Eb5:4 | G5:12 _:4 |
  Ab5:8 C6:4 Ab5:4 | Db6:8 C6:4 Ab5:4 | Bb5:6 C6:2 D6:8 | D6:8 B5:4 G5:4 |
  C5:4 Eb5:4 G5:8 | Ab5:12 G5:4 | G5:8 F5:4 Eb5:4 | C5:4 Eb5:4 G5:4 C6:4 |
  C6:8 Eb6:4 C6:4 | Db6:8 C6:4 Ab5:4 | B5:8 G5:4 Ab5:4 | G5:4 F5:4 D5:4 B4:4
`);
const barOf = (ev: NoteEvent): number => Math.floor(ev.step / 16);
const HARMONY = harmonizeBelow(
  LEAD.filter((ev) => inRange(barOf(ev), 28, 36)),
  SLOTS,
);

const FILL_BARS = new Set([11, 19, 27, 35]);
const HALF_TIME = (bar: number): boolean => inRange(bar, 20, 24);

function drumsOf(bar: number): DrumBar {
  if (bar < 2) return { toms: bar === 0 ? '4...4...4...4.4.' : '4.4.4.4.4.4.4444' };
  if (bar === 2) return { kick: 'x...x...x...x...', hat: 'xoxoxoxoxoxoxoxo' };
  if (bar === 3) return { kick: 'x...x...x...x...', snare: 'ooooxxxxxxxxXXXX' };
  if (HALF_TIME(bar)) {
    return {
      kick: 'x.........x.....',
      snare: '........X.......',
      hat: 'x.x.x.x.x.x.x.x.',
      crash: bar === 20 ? 'X...............' : undefined,
    };
  }
  const p: DrumBar = {
    kick: [15, 19, 31].includes(bar) ? 'x...x...x...x.xx' : 'x...x...x...x...',
    snare: '....X.......X...',
    hat: 'xoxoxoxoxoxoxoxo',
    openHat: '..x...x...x...x.',
  };
  if (inRange(bar, 28, 36)) p.clap = '....x.......x...';
  if ([4, 12, 24, 28].includes(bar)) p.crash = 'X...............';
  if (bar === 34 || bar === 35) p.kick = 'x.x.x.x.x.x.x.x.';
  if (FILL_BARS.has(bar)) {
    delete p.openHat;
    p.hat = 'xoxoxoxo........';
    p.toms = bar === 35 ? '........11223344' : '..........1.2.34';
  }
  return p;
}

const KICKS = hitTimes(GRID, BARS, (b) => drumsOf(b).kick);

function bassPattern(bar: number, slot: ChordSlot['chord']): string {
  if (bar < 2) return 'L-L-L-L-L-L-L-L-';
  if (bar === 2) return 'LLLLLLLLLLLLLLLL';
  if (bar === 3) return 'LLLLLLLLHHHHLLLL';
  if (HALF_TIME(bar)) return 'L-------L---L-H-';
  if (bar === 34 || bar === 35) return 'LLLLLLLLLLLLHHHH';
  // La seconde bémolisée ne s'emploie que sur la tonique : elle signe la menace.
  return slot.symbol === 'Cm' ? 'LLHLLbLLLLHLLbLL' : 'LLHLLLHLLLHLLLHL';
}

/** Forme du leitmotif selon l'accord : 1–3–5–6 (♭3/♭6 sur les accords mineurs et la dominante). */
function motifTones(slot: ChordSlot['chord'], low: number): number[] {
  const minor = slot.intervals.includes(3);
  const dominant = slot.symbol.startsWith('G');
  const shape = minor ? [0, 3, 7, 8] : dominant ? [0, 4, 7, 8] : [0, 4, 7, 9];
  let root = low;
  while (root % 12 !== slot.root) root++;
  return [...shape.map((iv) => root + iv), root + 12];
}

const OSTINATO = [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 4, 3, 2, 1];

export const boss: TrackDef = {
  id: 'boss',
  title: 'Boss',
  bpm: 140,
  key: 'Do mineur (♭2)',
  introBars: 4,
  loopBars: 32,
  tailSeconds: 5,
  mix: { drums: -4.5, bass: -6, lead: -6.5, pads: -9, arp: -9.5 },
  layers: {
    pads: {
      enterAt: 0,
      build: async ({ grid, out, rng }) => {
        const hum = new Humanizer(rng, 4, 0.05);
        const brass = filterPoly({
          volume: -18,
          type: 'fatsawtooth',
          cutoff: 380,
          octaves: 3,
          q: 1.5,
          env: { attack: 0.08, decay: 0.6, sustain: 0.8, release: 0.7 },
          filterEnv: { attack: 0.35, decay: 1.1, sustain: 0.35, release: 0.6 },
        });
        const dark = superSawPad({
          volume: -22,
          cutoff: 1300,
          count: 3,
          spread: 38,
          env: { attack: 0.3, release: 1.6 },
        });
        const bus = new Tone.Gain(1);
        brass.output.connect(bus);
        dark.output.connect(bus);
        const rev = await reverb(3.2, 0.3);
        chain(bus, hp(90), rev, sidechainGain(KICKS, 0.35, 0.18), out);
        const voiced = voicings(SLOTS, { low: 50, high: 74, center: 61, maxNotes: 4 });
        playChords(brass, grid, SLOTS, voiced, { hum, vel: 0.75, overlap: 0.05 });
        playChords(dark, grid, SLOTS, voiced, { hum, vel: 0.6, overlap: 0.1 });

        // Sirène d'alerte : intro et entrée de la section B (hauteur pilotée par un LFO).
        const siren = new Tone.Oscillator({ type: 'sawtooth', frequency: 700 });
        siren.volume.value = -28;
        new Tone.LFO({ frequency: grid.bpm / 60 / 2, min: 560, max: 880 })
          .start(0)
          .connect(siren.frequency);
        const sirenGain = new Tone.Gain(0);
        const sirenFilter = new Tone.Filter({ type: 'bandpass', frequency: 1400, Q: 0.8 });
        chain(siren, sirenGain, sirenFilter, rev);
        const segment = (t0: number, t1: number, level: number): void => {
          const w = clipToWindow(t0, t1);
          if (!w) return;
          const g = sirenGain.gain;
          g.setValueAtTime(0, w[0]);
          g.linearRampToValueAtTime(level, Math.min(w[0] + 0.4, w[1]));
          g.setValueAtTime(level, Math.max(w[0], w[1] - 0.5));
          g.linearRampToValueAtTime(0, w[1]);
        };
        segment(0, grid.t(4), 1);
        segment(grid.t(20), grid.t(22), 0.8);
        siren.start(0).stop(grid.t(22) + 0.1);
      },
    },
    bass: {
      enterAt: 0,
      build: ({ grid, out, rng }) => {
        const hum = new Humanizer(rng, 1.5, 0.05);
        const bass = bassSynth({
          volume: -14,
          cutoff: 220,
          octaves: 3.4,
          decay: 0.12,
          q: 3,
          sub: -2,
        });
        const drive = new Tone.Distortion({ distortion: 0.35, oversample: '2x', wet: 0.45 });
        const tone = new Tone.Filter({ type: 'lowpass', frequency: 3200, rolloff: -12 });
        chain(bass.output, drive, tone, sidechainGain(KICKS, 0.4, 0.14), out);
        for (const bar of BARS) {
          bassBar(bass, grid, SLOTS, bar, bassPattern(bar, chordAt(SLOTS, bar, 0)), {
            low: 36,
            hum,
            vel: bar < 2 ? 0.65 : 0.8,
            accents: [0, 4, 8, 12],
            gate: 0.7,
          });
        }
      },
    },
    drums: {
      enterAt: 0,
      build: async ({ grid, out, rng }) => {
        const hum = new Humanizer(rng, 2.5, 0.1);
        const kit = await DrumKit.create(out, {
          drive: 0.25,
          kickDecay: 0.36,
          kickPitch: 48,
          levels: { snare: -6, hat: -26, openHat: -27, crash: -20 },
          roomDecay: 1.8,
          roomWet: 0.22,
        });
        for (const bar of BARS) drumBar(kit, grid, bar, drumsOf(bar), hum);
        riser(out, grid.t(2), grid.t(4), -18);
        riser(out, grid.t(19), grid.t(20), -22);
      },
    },
    arp: {
      enterAt: 1,
      build: async ({ grid, out, rng }) => {
        const hum = new Humanizer(rng, 2, 0.08);
        const seq = seqSynth({
          volume: -17,
          type: 'fatsquare',
          cutoff: 2100,
          q: 2,
          env: { decay: 0.1, sustain: 0.2 },
        });
        const delay = new Tone.PingPongDelay({
          delayTime: grid.beats(0.5),
          feedback: 0.22,
          wet: 0.2,
        });
        const rev = await reverb(2, 0.18);
        chain(seq.output, hp(150), delay, rev, out);
        ramp(seq.filter.frequency, 400, 2100, grid.t(2), grid.t(4));
        for (const bar of range(2, 36)) {
          if (HALF_TIME(bar) && bar < 22) continue; // respiration au début de B1
          for (let step = 0; step < 16; step++) {
            const tones = motifTones(chordAt(SLOTS, bar, step), 60);
            const note = tones[OSTINATO[step]];
            const v = step % 4 === 0 ? 0.9 : 0.62;
            seq.play([note], hum.time(grid.t(bar, step)), grid.dur(1) * 0.7, hum.vel(v));
          }
        }
      },
    },
    lead: {
      enterAt: 2,
      build: async ({ grid, out, rng }) => {
        const hum = new Humanizer(rng, 4, 0.07);
        const opts = {
          type: 'fatsawtooth' as const,
          count: 3,
          spread: 20,
          cutoff: 1100,
          octaves: 3,
          q: 1.8,
          portamento: 0.018,
          env: { attack: 0.006, release: 0.2 },
        };
        const lead = leadSynth({ ...opts, volume: -16 });
        const harm = leadSynth({ ...opts, volume: -23 });
        const bus = new Tone.Gain(1);
        lead.output.connect(bus);
        harm.output.connect(bus);
        const drive = new Tone.Distortion({ distortion: 0.3, oversample: '2x', wet: 0.35 });
        const delay = new Tone.FeedbackDelay({
          delayTime: grid.beats(0.75),
          feedback: 0.25,
          wet: 0.18,
        });
        const rev = await reverb(2.6, 0.22);
        chain(bus, hp(150), drive, delay, rev, out);
        playPhrase(lead, grid, LEAD, 0, { hum, gate: 0.92 });
        playPhrase(harm, grid, HARMONY, 0, { hum, gate: 0.9, vel: 0.85 });
      },
    },
  },
};
