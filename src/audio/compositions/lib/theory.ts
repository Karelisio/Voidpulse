/**
 * Théorie musicale pour les compositions : notes, gammes, accords et voicings.
 * Fonctions pures (aucune dépendance audio), testées unitairement.
 */

const LETTER_PC: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Classe de hauteur (0-11) d'un nom de note sans octave : « C# », « Eb », « A ». */
export function pitchClass(name: string): number {
  const m = /^([A-G])([#b]*)$/.exec(name);
  if (!m) throw new Error(`Nom de note invalide : ${name}`);
  let pc = LETTER_PC[m[1]];
  for (const acc of m[2]) pc += acc === '#' ? 1 : -1;
  return ((pc % 12) + 12) % 12;
}

/** « A4 » → 69, « C#3 » → 49, « Eb5 » → 75 (C4 = 60). */
export function noteToMidi(note: string): number {
  const m = /^([A-G][#b]*)(-?\d)$/.exec(note);
  if (!m) throw new Error(`Note invalide : ${note}`);
  const letter = m[1];
  const octave = Number(m[2]);
  // Les altérations franchissant l'octave (B#, Cb) suivent la lettre, comme en notation usuelle.
  let raw = LETTER_PC[letter[0]];
  for (const acc of letter.slice(1)) raw += acc === '#' ? 1 : -1;
  return (octave + 1) * 12 + raw;
}

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export const SCALES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
} as const satisfies Record<string, readonly number[]>;

export interface Scale {
  tonic: number; // classe de hauteur
  steps: readonly number[];
}

export function scale(tonic: string, mode: keyof typeof SCALES): Scale {
  return { tonic: pitchClass(tonic), steps: SCALES[mode] };
}

/**
 * Déplace une note de `degrees` degrés dans la gamme (harmonisation diatonique).
 * Une note hors gamme est d'abord ramenée au degré inférieur le plus proche.
 */
export function diatonicShift(midi: number, sc: Scale, degrees: number): number {
  const n = sc.steps.length;
  const rel = midi - sc.tonic;
  const octave = Math.floor(rel / 12);
  const pcRel = rel - octave * 12;
  let degree = 0;
  for (let i = 0; i < n; i++) if (sc.steps[i] <= pcRel) degree = i;
  const target = degree + degrees;
  const targetOctave = octave + Math.floor(target / n);
  const targetDegree = ((target % n) + n) % n;
  return sc.tonic + targetOctave * 12 + sc.steps[targetDegree];
}

const QUALITIES: Readonly<Partial<Record<string, readonly number[]>>> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '5': [0, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  mmaj7: [0, 3, 7, 11],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  '7sus4': [0, 5, 7, 10],
  '7b9': [0, 4, 7, 10, 13],
  '9': [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  m11: [0, 3, 7, 10, 14, 17],
  'maj7#11': [0, 4, 7, 11, 18],
};

export interface Chord {
  symbol: string;
  root: number; // classe de hauteur
  intervals: readonly number[];
  bass: number; // classe de hauteur de la basse (fondamentale ou basse de l'accord renversé)
}

/** « Am9 », « C/E », « E7sus4 », « Dbmaj7 », « F#m7b5 »… */
export function parseChord(symbol: string): Chord {
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(symbol);
  if (!m) throw new Error(`Accord invalide : ${symbol}`);
  const quality = QUALITIES[m[2]];
  if (!quality) throw new Error(`Qualité d'accord inconnue : ${symbol}`);
  const root = pitchClass(m[1]);
  return { symbol, root, intervals: quality, bass: m[3] ? pitchClass(m[3]) : root };
}

/** Notes de l'accord (classes de hauteur), dans l'ordre fondamentale, tierce, quinte, septième… */
export function chordPitchClasses(chord: Chord): number[] {
  return chord.intervals.map((iv) => (chord.root + iv) % 12);
}

export interface VoicingOptions {
  low: number; // note MIDI la plus grave autorisée
  high: number; // note MIDI la plus aiguë autorisée
  center: number; // centre de gravité visé sans accord précédent
  maxNotes?: number; // on retire d'abord la quinte, puis la fondamentale
}

/**
 * Voicing serré avec conduite des voix : parmi tous les renversements dans la tessiture,
 * choisit celui qui bouge le moins par rapport à l'accord précédent.
 */
export function voiceChord(
  chord: Chord,
  prev: readonly number[] | null,
  opts: VoicingOptions,
): number[] {
  let pcs = chordPitchClasses(chord);
  const maxNotes = opts.maxNotes ?? 5;
  if (pcs.length > maxNotes && chord.intervals.length >= 4) {
    // Quinte juste d'abord (peu caractéristique), puis la fondamentale (tenue par la basse).
    const fifth = (chord.root + 7) % 12;
    if (chord.intervals.includes(7)) pcs = pcs.filter((pc) => pc !== fifth);
  }
  if (pcs.length > maxNotes) pcs = pcs.filter((pc) => pc !== chord.root);
  pcs = pcs.slice(0, maxNotes);

  let best: number[] | null = null;
  let bestScore = Infinity;
  for (let inv = 0; inv < pcs.length; inv++) {
    const order = [...pcs.slice(inv), ...pcs.slice(0, inv)];
    const stack: number[] = [];
    for (const pc of order) {
      const last = stack.length > 0 ? stack[stack.length - 1] : opts.low - 1;
      let n = last + 1;
      while (((n % 12) + 12) % 12 !== pc) n++;
      stack.push(n);
    }
    for (let shift = -48; shift <= 48; shift += 12) {
      const v = stack.map((n) => n + shift);
      if (v[0] < opts.low || v[v.length - 1] > opts.high) continue;
      const score = voicingScore(v, prev, opts.center);
      if (score < bestScore) {
        bestScore = score;
        best = v;
      }
    }
  }
  if (!best)
    throw new Error(`Aucun voicing possible pour ${chord.symbol} dans [${opts.low}, ${opts.high}]`);
  return best;
}

function voicingScore(
  v: readonly number[],
  prev: readonly number[] | null,
  center: number,
): number {
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  let score = Math.abs(mean - center) * 0.35;
  if (prev && prev.length > 0) {
    // Mouvement total : chaque voix vers la note précédente la plus proche.
    for (const n of v) {
      let d = Infinity;
      for (const p of prev) d = Math.min(d, Math.abs(n - p));
      score += d;
    }
  }
  // Seconde mineure entre les deux voix graves : son boueux.
  if (v.length > 1 && v[1] - v[0] === 1) score += 6;
  return score;
}

/** Voicings successifs d'une progression, avec conduite des voix. */
export function voiceProgression(symbols: readonly string[], opts: VoicingOptions): number[][] {
  const out: number[][] = [];
  let prev: number[] | null = null;
  for (const s of symbols) {
    prev = voiceChord(parseChord(s), prev, opts);
    out.push(prev);
  }
  return out;
}

/** Note de basse d'un accord dans l'intervalle [low, low + 11]. */
export function bassNote(chord: Chord, low: number): number {
  let n = low;
  while (((n % 12) + 12) % 12 !== chord.bass) n++;
  return n;
}

/**
 * Note de l'accord située à `interval` demi-tons de la fondamentale, placée au plus près
 * (vers le haut) de `from` : utile pour ostinatos et arpèges transposés.
 */
export function chordToneAbove(chord: Chord, interval: number, from: number): number {
  const pc = (chord.root + interval) % 12;
  let n = from;
  while (((n % 12) + 12) % 12 !== pc) n++;
  return n;
}
