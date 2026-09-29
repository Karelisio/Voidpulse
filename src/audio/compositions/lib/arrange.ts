import type { DrumKit } from './drums';
import type { Instrument } from './instruments';
import { hits, type NoteEvent } from './notation';
export type { NoteEvent };
import { bassNote, type Chord, parseChord, voiceChord, type VoicingOptions } from './theory';
import type { Grid, Humanizer } from './time';

/** Accord placé sur la grille. */
export interface ChordSlot {
  bar: number;
  step: number;
  len: number; // en pas
  chord: Chord;
}

/**
 * Une entrée par mesure ; une entrée peut contenir plusieurs accords séparés par des espaces,
 * répartis à parts égales dans la mesure (« E7sus4 E7 » = deux blanches).
 */
export function progression(bars: readonly string[], stepsPerBar = 16): ChordSlot[] {
  const slots: ChordSlot[] = [];
  bars.forEach((entry, bar) => {
    const symbols = entry.trim().split(/\s+/);
    const len = stepsPerBar / symbols.length;
    symbols.forEach((s, i) => slots.push({ bar, step: i * len, len, chord: parseChord(s) }));
  });
  return slots;
}

export function chordAt(slots: readonly ChordSlot[], bar: number, step: number): Chord {
  let found = slots[0].chord;
  for (const s of slots) {
    if (s.bar < bar || (s.bar === bar && s.step <= step)) found = s.chord;
    else break;
  }
  return found;
}

/** Voicings de toute la progression avec conduite des voix. */
export function voicings(slots: readonly ChordSlot[], opts: VoicingOptions): number[][] {
  const out: number[][] = [];
  let prev: number[] | null = null;
  for (const s of slots) {
    prev = voiceChord(s.chord, prev, opts);
    out.push(prev);
  }
  return out;
}

export interface PlayOptions {
  hum?: Humanizer;
  gate?: number; // proportion de la durée notée réellement tenue
  vel?: number; // multiplicateur de vélocité
  transpose?: number;
  map?: (midi: number) => number;
}

/** Joue une phrase (notation) à partir de la mesure `bar`. */
export function playPhrase(
  inst: Instrument,
  grid: Grid,
  events: readonly NoteEvent[],
  bar: number,
  opts: PlayOptions = {},
): void {
  for (const ev of events) {
    const t0 = grid.t(bar, ev.step);
    const t1 = grid.t(bar, ev.step + ev.len);
    const t = opts.hum ? opts.hum.time(t0) : t0;
    const dur = Math.max(0.03, (t1 - t0) * (opts.gate ?? 0.95));
    const v = (opts.hum ? opts.hum.vel(ev.vel) : ev.vel) * (opts.vel ?? 1);
    let notes = ev.notes;
    if (opts.transpose) notes = notes.map((n) => n + opts.transpose!);
    if (opts.map) notes = notes.map(opts.map);
    inst.play(notes, t, dur, Math.min(1, v));
  }
}

/** Joue les accords d'une progression (nappes), en légato. */
export function playChords(
  inst: Instrument,
  grid: Grid,
  slots: readonly ChordSlot[],
  voiced: readonly number[][],
  opts: {
    hum?: Humanizer;
    vel?: number | ((slot: ChordSlot) => number);
    overlap?: number;
    from?: number;
    to?: number;
  } = {},
): void {
  slots.forEach((slot, i) => {
    if (opts.from !== undefined && slot.bar < opts.from) return;
    if (opts.to !== undefined && slot.bar >= opts.to) return;
    const t0 = grid.t(slot.bar, slot.step);
    const t1 = grid.t(slot.bar, slot.step + slot.len);
    const vel = typeof opts.vel === 'function' ? opts.vel(slot) : (opts.vel ?? 0.7);
    const t = opts.hum ? opts.hum.time(t0) : t0;
    inst.play(voiced[i], t, t1 - t0 + (opts.overlap ?? 0.08), opts.hum ? opts.hum.vel(vel) : vel);
  });
}

/**
 * Ligne de basse à partir d'un motif d'un caractère par pas :
 * `L` fondamentale grave, `H` octave, `5` quinte, `7` septième mineure, `b` seconde mineure (♭2),
 * `-` prolonge la note précédente, `.` silence. Majuscule/minuscule sans effet sauf `!` non supporté :
 * l'accent est donné par `accents` (pas accentués).
 */
export function bassBar(
  inst: Instrument,
  grid: Grid,
  slots: readonly ChordSlot[],
  bar: number,
  pattern: string,
  opts: { low: number; hum?: Humanizer; vel?: number; accents?: readonly number[]; gate?: number },
): void {
  const steps = pattern.replace(/[\s|]/g, '');
  let i = 0;
  while (i < steps.length) {
    const ch = steps[i];
    if (ch === '.' || ch === '-') {
      i++;
      continue;
    }
    let len = 1;
    while (i + len < steps.length && steps[i + len] === '-') len++;
    const chord = chordAt(slots, bar, i);
    const root = bassNote(chord, opts.low);
    const offset =
      ch === 'H' ? 12 : ch === '5' ? 7 : ch === '7' ? 10 : ch === 'b' ? 1 : ch === 'L' ? 0 : NaN;
    if (Number.isNaN(offset)) throw new Error(`Symbole de basse inconnu « ${ch} »`);
    const t0 = grid.t(bar, i);
    const t1 = grid.t(bar, i + len);
    const base = opts.vel ?? 0.8;
    const v = opts.accents?.includes(i) ? Math.min(1, base * 1.2) : base;
    inst.play(
      [root + offset],
      opts.hum ? opts.hum.time(t0) : t0,
      Math.max(0.03, (t1 - t0) * (opts.gate ?? 0.85)),
      opts.hum ? opts.hum.vel(v) : v,
    );
    i += len;
  }
}

/** Notes d'un accord empilées vers le haut à partir de `low` (pour arpèges). */
export function chordTones(chord: Chord, low: number, count: number, withBass = false): number[] {
  const pcs = chord.intervals.map((iv) => (chord.root + iv) % 12);
  const set = withBass ? [chord.bass, ...pcs] : pcs;
  const out: number[] = [];
  let n = low;
  while (out.length < count) {
    if (set.includes(((n % 12) + 12) % 12) && !out.includes(n)) out.push(n);
    n++;
  }
  return out;
}

/**
 * Arpège : à chaque pas multiple de `rate`, joue `tones[pattern[k]]` de l'accord courant.
 */
export function arpBar(
  inst: Instrument,
  grid: Grid,
  slots: readonly ChordSlot[],
  bar: number,
  opts: {
    low: number;
    count: number;
    pattern: readonly number[];
    rate: number; // en pas
    gate?: number;
    vel?: number | ((step: number) => number);
    hum?: Humanizer;
    skip?: (step: number) => boolean;
  },
  stepsPerBar = 16,
): void {
  let k = 0;
  for (let step = 0; step < stepsPerBar; step += opts.rate) {
    const idx = opts.pattern[k % opts.pattern.length];
    k++;
    if (opts.skip?.(step)) continue;
    const tones = chordTones(chordAt(slots, bar, step), opts.low, opts.count);
    const note = tones[Math.min(idx, tones.length - 1)];
    const t0 = grid.t(bar, step);
    const v = typeof opts.vel === 'function' ? opts.vel(step) : (opts.vel ?? 0.7);
    inst.play(
      [note],
      opts.hum ? opts.hum.time(t0) : t0,
      grid.dur(opts.rate) * (opts.gate ?? 0.8),
      opts.hum ? opts.hum.vel(v) : v,
    );
  }
}

/** Motifs de batterie d'une mesure (un caractère par pas, voir `hits`). */
export interface DrumBar {
  kick?: string;
  snare?: string;
  clap?: string;
  hat?: string;
  openHat?: string;
  shaker?: string;
  rim?: string;
  crash?: string;
  /** Toms : un caractère par pas, 1 (aigu) à 4 (grave), `.` silence. */
  toms?: string;
}

const TOM_FREQS = [0, 196, 147, 110, 82];

export function drumBar(kit: DrumKit, grid: Grid, bar: number, p: DrumBar, hum?: Humanizer): void {
  const at = (step: number, jitter: boolean): number => {
    const t = grid.t(bar, step);
    return jitter && hum ? hum.time(t) : t;
  };
  const v = (x: number): number => (hum ? hum.vel(x) : x);
  if (p.kick) for (const h of hits(p.kick)) kit.kick(at(h.step, false), v(h.vel));
  if (p.snare) for (const h of hits(p.snare)) kit.snare(at(h.step, true), v(h.vel));
  if (p.clap) for (const h of hits(p.clap)) kit.clap(at(h.step, true), v(h.vel));
  if (p.hat) for (const h of hits(p.hat)) kit.hat(at(h.step, true), v(h.vel));
  if (p.openHat) for (const h of hits(p.openHat)) kit.openHat(at(h.step, true), v(h.vel));
  if (p.shaker) for (const h of hits(p.shaker)) kit.shaker(at(h.step, true), v(h.vel));
  if (p.rim) for (const h of hits(p.rim)) kit.rim(at(h.step, true), v(h.vel));
  if (p.crash) for (const h of hits(p.crash)) kit.crash(at(h.step, false), v(h.vel));
  if (p.toms) {
    let step = 0;
    for (const ch of p.toms) {
      if (ch === ' ' || ch === '|') continue;
      if (ch !== '.') kit.tom(at(step, true), TOM_FREQS[Number(ch)] ?? 110, v(0.85));
      step++;
    }
  }
}

/** Temps absolus des frappes d'un motif sur une liste de mesures (sidechain, gated reverb). */
export function hitTimes(
  grid: Grid,
  bars: readonly number[],
  patternOf: (bar: number) => string | undefined,
): number[] {
  const out: number[] = [];
  for (const bar of bars) {
    const p = patternOf(bar);
    if (!p) continue;
    for (const h of hits(p)) out.push(grid.t(bar, h.step));
  }
  return out;
}

/**
 * Seconde voix sous la mélodie : pour chaque note, la note de l'accord courant la plus proche
 * en dessous, en préférant tierces puis sixtes puis quarte/quinte (toujours consonant).
 */
export function harmonizeBelow(
  events: readonly NoteEvent[],
  slots: readonly ChordSlot[],
  stepsPerBar = 16,
): NoteEvent[] {
  const preference = [3, 4, 8, 9, 5, 7];
  return events.map((ev) => {
    const bar = Math.floor(ev.step / stepsPerBar);
    const chord = chordAt(slots, bar, ev.step - bar * stepsPerBar);
    const pcs = chord.intervals.map((iv) => (chord.root + iv) % 12);
    const top = ev.notes[0];
    let pick = top - 5;
    for (const interval of preference) {
      const cand = top - interval;
      if (pcs.includes(((cand % 12) + 12) % 12)) {
        pick = cand;
        break;
      }
    }
    return { ...ev, notes: [pick] };
  });
}

/** [from, from+1, …, to-1] */
export function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i < to; i++) out.push(i);
  return out;
}
