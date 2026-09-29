import { noteToMidi } from './theory';

/**
 * Notation compacte des phrases, en pas de double croche (16 pas par mesure en 4/4) :
 *
 *   « A4:2 C5:2 E5:4 F5:6 E5:2- | E5:6 C5:2 D5:4 E5:4 »
 *
 * - `NOTE:PAS` : note et durée (1 = double croche, 2 = croche, 4 = noire, 6 = noire pointée…)
 * - `[C4,E4,G4]:4` : accord ; `_:4` : silence
 * - suffixe `!` : accent (vélocité 1) ; `?` : note fantôme (0,5) ; défaut 0,8
 * - suffixe `-` : liaison avec la note suivante de même hauteur
 * - `|` : barre de mesure, vérifiée (la position doit tomber sur un début de mesure)
 */
export interface NoteEvent {
  step: number; // position en pas depuis le début de la phrase
  len: number; // durée en pas
  notes: number[]; // notes MIDI (vide = silence, jamais émis)
  vel: number;
}

const TOKEN = /^(\[[^\]]+\]|_|[A-G][#b]?-?\d):(\d+(?:\.\d+)?)([!?]?)(-?)$/;

export function phrase(src: string, stepsPerBar = 16): NoteEvent[] {
  const events: NoteEvent[] = [];
  let pos = 0;
  let pendingTie: NoteEvent | null = null;
  for (const token of src.trim().split(/\s+/)) {
    if (token === '') continue;
    if (token === '|') {
      if (pos % stepsPerBar !== 0) {
        throw new Error(`Barre de mesure mal placée (pas ${pos}) dans : ${src}`);
      }
      continue;
    }
    const m = TOKEN.exec(token);
    if (!m) throw new Error(`Jeton invalide « ${token} » dans : ${src}`);
    const head = m[1];
    const len = Number(m[2]);
    const vel = m[3] === '!' ? 1 : m[3] === '?' ? 0.5 : 0.8;
    const tie = m[4] === '-';
    const notes =
      head === '_'
        ? []
        : head.startsWith('[')
          ? head
              .slice(1, -1)
              .split(',')
              .map((n) => noteToMidi(n.trim()))
          : [noteToMidi(head)];

    if (pendingTie && sameNotes(pendingTie.notes, notes)) {
      pendingTie.len += len;
      pendingTie = tie ? pendingTie : null;
    } else {
      const ev: NoteEvent = { step: pos, len, notes, vel };
      if (notes.length > 0) events.push(ev);
      pendingTie = tie && notes.length > 0 ? ev : null;
    }
    pos += len;
  }
  return events;
}

/** Longueur totale d'une phrase en pas (silences compris). */
export function phraseLength(src: string): number {
  let pos = 0;
  for (const token of src.trim().split(/\s+/)) {
    const m = TOKEN.exec(token);
    if (m) pos += Number(m[2]);
  }
  return pos;
}

function sameNotes(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

/**
 * Motif rythmique de batterie : un caractère par pas.
 * `X` accent (1), `x` normal (0,8), `o` fantôme (0,45), `.` silence. Espaces et `|` ignorés.
 */
export function hits(pattern: string): { step: number; vel: number }[] {
  const out: { step: number; vel: number }[] = [];
  let step = 0;
  for (const ch of pattern) {
    if (ch === ' ' || ch === '|') continue;
    if (ch === 'X') out.push({ step, vel: 1 });
    else if (ch === 'x') out.push({ step, vel: 0.8 });
    else if (ch === 'o') out.push({ step, vel: 0.45 });
    else if (ch !== '.') throw new Error(`Caractère de motif invalide « ${ch} » dans : ${pattern}`);
    step++;
  }
  return out;
}
