import * as Tone from 'tone';
import { clipToWindow, inWindow } from './section';
import { midiToFreq } from './theory';

/** Instrument jouable par les couches : notes MIDI, temps et durée en secondes. */
export interface Instrument {
  play(notes: readonly number[], time: number, dur: number, vel: number): void;
  output: Tone.ToneAudioNode;
}

type Env = Partial<Pick<Tone.EnvelopeOptions, 'attack' | 'decay' | 'sustain' | 'release'>>;

const freqs = (notes: readonly number[]): number[] => notes.map(midiToFreq);

/** Nappe « supersaw » (scies désaccordées) filtrée : base des pads synthwave. */
export function superSawPad(opts: {
  volume: number;
  cutoff: number;
  count?: number;
  spread?: number;
  env?: Env;
  q?: number;
}): Instrument & { filter: Tone.Filter; synth: Tone.PolySynth } {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fatsawtooth', count: opts.count ?? 3, spread: opts.spread ?? 28 },
    envelope: { attack: 0.6, decay: 0.8, sustain: 0.85, release: 2.2, ...opts.env },
  });
  synth.maxPolyphony = 32;
  synth.volume.value = opts.volume;
  const filter = new Tone.Filter({
    type: 'lowpass',
    frequency: opts.cutoff,
    rolloff: -24,
    Q: opts.q ?? 0.6,
  });
  synth.connect(filter);
  return {
    synth,
    filter,
    output: filter,
    play: (notes, t, d, v) => {
      if (inWindow(t)) synth.triggerAttackRelease(freqs(notes), d, t, v);
    },
  };
}

/** Nappe PWM (façon Juno) : largeur d'impulsion modulée lentement. */
export function pwmPad(opts: {
  volume: number;
  cutoff: number;
  rate?: number;
  env?: Env;
}): Instrument & {
  filter: Tone.Filter;
} {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'pwm', modulationFrequency: opts.rate ?? 0.35 },
    envelope: { attack: 0.5, decay: 0.6, sustain: 0.8, release: 2, ...opts.env },
  });
  synth.maxPolyphony = 32;
  synth.volume.value = opts.volume;
  const filter = new Tone.Filter({ type: 'lowpass', frequency: opts.cutoff, rolloff: -24, Q: 0.5 });
  // La PWM de Tone produit un décalage DC qui varie lentement : on le bloque.
  const dcBlock = new Tone.Filter({ type: 'highpass', frequency: 40, rolloff: -12 });
  synth.chain(dcBlock, filter);
  return {
    filter,
    output: filter,
    play: (notes, t, d, v) => {
      if (inWindow(t)) synth.triggerAttackRelease(freqs(notes), d, t, v);
    },
  };
}

/** Accords à enveloppe de filtre (stabs, cuivres synthétiques). */
export function filterPoly(opts: {
  volume: number;
  type?: 'fatsawtooth' | 'fatsquare' | 'sawtooth' | 'square';
  cutoff: number;
  octaves: number;
  q?: number;
  env?: Env;
  filterEnv?: Env;
}): Instrument {
  const synth = new Tone.PolySynth(Tone.MonoSynth, {
    oscillator: { type: opts.type ?? 'fatsawtooth' },
    filter: { type: 'lowpass', rolloff: -24, Q: opts.q ?? 1 },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.4, ...opts.env },
    filterEnvelope: {
      attack: 0.005,
      decay: 0.25,
      sustain: 0.3,
      release: 0.4,
      baseFrequency: opts.cutoff,
      octaves: opts.octaves,
      ...opts.filterEnv,
    },
  });
  synth.maxPolyphony = 32;
  synth.volume.value = opts.volume;
  return {
    output: synth,
    play: (notes, t, d, v) => {
      if (inWindow(t)) synth.triggerAttackRelease(freqs(notes), d, t, v);
    },
  };
}

/** Basse : scie filtrée à enveloppe + sinus de renfort à la même hauteur. */
export function bassSynth(opts: {
  volume: number;
  cutoff: number;
  octaves: number;
  decay: number;
  q?: number;
  sub?: number; // gain du sinus en dB relatif
  type?: 'sawtooth' | 'square' | 'fatsawtooth';
  env?: Env;
  portamento?: number;
}): Instrument {
  const out = new Tone.Gain(1);
  const mono = new Tone.MonoSynth({
    oscillator: { type: opts.type ?? 'sawtooth' },
    portamento: opts.portamento ?? 0,
    filter: { type: 'lowpass', rolloff: -24, Q: opts.q ?? 2 },
    envelope: { attack: 0.004, decay: 0.3, sustain: 0.75, release: 0.08, ...opts.env },
    filterEnvelope: {
      attack: 0.003,
      decay: opts.decay,
      sustain: 0.2,
      release: 0.1,
      baseFrequency: opts.cutoff,
      octaves: opts.octaves,
    },
  });
  mono.volume.value = opts.volume;
  const sub = new Tone.MonoSynth({
    oscillator: { type: 'sine' },
    portamento: opts.portamento ?? 0,
    filter: { type: 'lowpass', frequency: 300, rolloff: -12 },
    envelope: { attack: 0.004, decay: 0.2, sustain: 0.9, release: 0.08, ...opts.env },
    filterEnvelope: { baseFrequency: 300, octaves: 0 },
  });
  sub.volume.value = opts.volume + (opts.sub ?? -4);
  mono.connect(out);
  sub.connect(out);
  return {
    output: out,
    play: (notes, t, d, v) => {
      if (!inWindow(t)) return;
      const f = midiToFreq(notes[0]);
      mono.triggerAttackRelease(f, d, t, v);
      sub.triggerAttackRelease(f, d, t, v);
    },
  };
}

/** Lead monophonique : oscillateur, enveloppe de filtre, portamento. */
export function leadSynth(opts: {
  volume: number;
  type?: 'fatsawtooth' | 'fatsquare' | 'sawtooth' | 'square' | 'triangle' | 'sine';
  count?: number;
  spread?: number;
  cutoff: number;
  octaves: number;
  q?: number;
  portamento?: number;
  env?: Env;
  filterEnv?: Env;
}): Instrument & { synth: Tone.MonoSynth } {
  const type = opts.type ?? 'fatsawtooth';
  const oscillator =
    type === 'fatsawtooth' || type === 'fatsquare'
      ? { type, count: opts.count ?? 2, spread: opts.spread ?? 14 }
      : { type };
  const synth = new Tone.MonoSynth({
    oscillator,
    portamento: opts.portamento ?? 0.02,
    filter: { type: 'lowpass', rolloff: -24, Q: opts.q ?? 1.2 },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.25, ...opts.env },
    filterEnvelope: {
      attack: 0.01,
      decay: 0.35,
      sustain: 0.5,
      release: 0.3,
      baseFrequency: opts.cutoff,
      octaves: opts.octaves,
      ...opts.filterEnv,
    },
  });
  synth.volume.value = opts.volume;
  return {
    synth,
    output: synth,
    play: (notes, t, d, v) => {
      if (inWindow(t)) synth.triggerAttackRelease(midiToFreq(notes[0]), d, t, v);
    },
  };
}

/** Pluck / cloche FM polyphonique. */
export function fmPoly(opts: {
  volume: number;
  harmonicity: number;
  modulationIndex: number;
  env?: Env;
  modEnv?: Env;
  modType?: 'sine' | 'square' | 'triangle';
}): Instrument {
  const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: opts.harmonicity,
    modulationIndex: opts.modulationIndex,
    oscillator: { type: 'sine' },
    modulation: { type: opts.modType ?? 'sine' },
    envelope: { attack: 0.002, decay: 0.4, sustain: 0, release: 0.4, ...opts.env },
    modulationEnvelope: { attack: 0.002, decay: 0.2, sustain: 0, release: 0.2, ...opts.modEnv },
  });
  synth.maxPolyphony = 32;
  synth.volume.value = opts.volume;
  return {
    output: synth,
    play: (notes, t, d, v) => {
      if (inWindow(t)) synth.triggerAttackRelease(freqs(notes), d, t, v);
    },
  };
}

/** Arpège / séquence : onde courte polyphonique (PWM ou carré), filtrée. */
export function seqSynth(opts: {
  volume: number;
  type?: 'pwm' | 'fatsquare' | 'square' | 'fatsawtooth' | 'triangle';
  cutoff: number;
  env?: Env;
  q?: number;
}): Instrument & { filter: Tone.Filter } {
  const type = opts.type ?? 'pwm';
  const oscillator =
    type === 'pwm'
      ? { type, modulationFrequency: 0.6 }
      : type === 'fatsquare' || type === 'fatsawtooth'
        ? { type, count: 2, spread: 10 }
        : { type };
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator,
    envelope: { attack: 0.003, decay: 0.16, sustain: 0.25, release: 0.12, ...opts.env },
  });
  synth.maxPolyphony = 32;
  synth.volume.value = opts.volume;
  const filter = new Tone.Filter({
    type: 'lowpass',
    frequency: opts.cutoff,
    rolloff: -24,
    Q: opts.q ?? 1,
  });
  synth.connect(filter);
  return {
    filter,
    output: filter,
    play: (notes, t, d, v) => {
      if (inWindow(t)) synth.triggerAttackRelease(freqs(notes), d, t, v);
    },
  };
}

/** Flûte synthétique : partiels doux + souffle bruité déclenché à chaque note. */
export function flute(opts: { volume: number; breath?: number }): Instrument {
  const out = new Tone.Gain(1);
  const tone = new Tone.MonoSynth({
    oscillator: { type: 'custom', partials: [1, 0.22, 0.09, 0.04, 0.015] },
    portamento: 0.015,
    filter: { type: 'lowpass', rolloff: -12, Q: 0.5 },
    envelope: { attack: 0.07, decay: 0.25, sustain: 0.82, release: 0.22 },
    filterEnvelope: {
      attack: 0.06,
      decay: 0.3,
      sustain: 0.8,
      release: 0.3,
      baseFrequency: 1800,
      octaves: 1.2,
    },
  });
  tone.volume.value = opts.volume;
  const noise = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.02, decay: 0.12, sustain: 0.18, release: 0.15 },
  });
  noise.volume.value = opts.volume + (opts.breath ?? -20);
  const breathFilter = new Tone.Filter({ type: 'bandpass', frequency: 2600, Q: 0.9 });
  noise.connect(breathFilter);
  tone.connect(out);
  breathFilter.connect(out);
  return {
    output: out,
    play: (notes, t, d, v) => {
      if (!inWindow(t)) return;
      tone.triggerAttackRelease(midiToFreq(notes[0]), d, t, v);
      noise.triggerAttackRelease(Math.max(0.05, d * 0.8), t, v);
    },
  };
}

/** Orgue additif (tirasses) pour les chorals. */
export function organ(opts: { volume: number; partials?: number[]; env?: Env }): Instrument {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: {
      type: 'custom',
      partials: opts.partials ?? [1, 0.7, 0.35, 0.3, 0, 0.18, 0, 0.12],
    },
    envelope: { attack: 0.03, decay: 0.2, sustain: 0.95, release: 0.35, ...opts.env },
  });
  synth.maxPolyphony = 32;
  synth.volume.value = opts.volume;
  return {
    output: synth,
    play: (notes, t, d, v) => {
      if (inWindow(t)) synth.triggerAttackRelease(freqs(notes), d, t, v);
    },
  };
}

/** Nappe de bruit continue (brume, vent, lave) filtrée par un passe-bande mouvant. */
export function noiseBed(opts: {
  volume: number;
  type?: 'white' | 'pink' | 'brown';
  center: number;
  octaves: number;
  rate: number;
  q?: number;
}): { output: Tone.ToneAudioNode; start(t0: number, t1: number, vel: number): void } {
  const noise = new Tone.NoiseSynth({
    noise: { type: opts.type ?? 'pink' },
    envelope: { attack: 2, decay: 0.1, sustain: 1, release: 3 },
  });
  noise.volume.value = opts.volume;
  const auto = new Tone.AutoFilter({
    frequency: opts.rate,
    baseFrequency: opts.center,
    octaves: opts.octaves,
    depth: 1,
    wet: 1,
    filter: { type: 'bandpass', rolloff: -12, Q: opts.q ?? 1.2 },
  }).start(0);
  noise.connect(auto);
  return {
    output: auto,
    start: (t0, t1, vel) => {
      const w = clipToWindow(t0, t1);
      if (w) noise.triggerAttackRelease(w[1] - w[0], w[0], vel);
    },
  };
}

/** Formants (Hz, gain dB) des voyelles chantées, voix de poitrine. */
const VOWELS = {
  a: [
    [800, 0],
    [1150, -6],
    [2900, -14],
  ],
  o: [
    [450, 0],
    [800, -8],
    [2830, -18],
  ],
  u: [
    [325, 0],
    [700, -12],
    [2530, -22],
  ],
  e: [
    [400, 0],
    [1600, -10],
    [2700, -14],
  ],
} as const;

/**
 * Voix à filtres formants : scies désaccordées → passe-bandes parallèles d'une voyelle.
 * Polyphonique (chœurs) ou monophonique avec portamento (lead « vocodé »).
 */
export function formantVoice(opts: {
  volume: number;
  vowel?: keyof typeof VOWELS;
  poly?: boolean;
  count?: number;
  spread?: number;
  portamento?: number;
  env?: Env;
}): Instrument {
  const out = new Tone.Gain(10 ** (14 / 20));
  const bank = new Tone.Gain(1);
  for (const [f, g] of VOWELS[opts.vowel ?? 'a']) {
    const bp = new Tone.Filter({ type: 'bandpass', frequency: f, Q: 5 });
    const gain = new Tone.Gain(10 ** (g / 20));
    chainNodes(bank, bp, gain, out);
  }
  const osc = { type: 'fatsawtooth' as const, count: opts.count ?? 3, spread: opts.spread ?? 22 };
  const env = { attack: 0.18, decay: 0.3, sustain: 0.85, release: 0.6, ...opts.env };
  if (opts.poly !== false) {
    const synth = new Tone.PolySynth(Tone.Synth, { oscillator: osc, envelope: env });
    synth.maxPolyphony = 32;
    synth.volume.value = opts.volume;
    synth.connect(bank);
    return {
      output: out,
      play: (notes, t, d, v) => {
        if (inWindow(t)) synth.triggerAttackRelease(freqs(notes), d, t, v);
      },
    };
  }
  const mono = new Tone.MonoSynth({
    oscillator: osc,
    portamento: opts.portamento ?? 0.04,
    envelope: env,
    filter: { type: 'lowpass', rolloff: -12, Q: 0.5 },
    filterEnvelope: { baseFrequency: 6000, octaves: 0 },
  });
  mono.volume.value = opts.volume;
  mono.connect(bank);
  return {
    output: out,
    play: (notes, t, d, v) => {
      if (inWindow(t)) mono.triggerAttackRelease(midiToFreq(notes[0]), d, t, v);
    },
  };
}

function chainNodes(...nodes: Tone.ToneAudioNode[]): void {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
}

/** Percussion métallique (enclume, tôle) : MetalSynth accordé sur la note jouée. */
export function metalPerc(opts: {
  volume: number;
  decay?: number;
  harmonicity?: number;
  resonance?: number;
}): Instrument {
  const synth = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: opts.decay ?? 0.25, release: 0.1 },
    harmonicity: opts.harmonicity ?? 5.1,
    modulationIndex: 24,
    resonance: opts.resonance ?? 3200,
    octaves: 1.2,
  });
  synth.volume.value = opts.volume;
  return {
    output: synth,
    play: (notes, t, d, v) => {
      if (inWindow(t)) synth.triggerAttackRelease(midiToFreq(notes[0]), d, t, v);
    },
  };
}
