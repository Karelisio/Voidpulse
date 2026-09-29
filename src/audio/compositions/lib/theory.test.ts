import { describe, expect, it } from 'vitest';
import { hits, phrase } from './notation';
import {
  bassNote,
  chordPitchClasses,
  diatonicShift,
  noteToMidi,
  parseChord,
  scale,
  voiceChord,
  voiceProgression,
} from './theory';

describe('notes', () => {
  it('convertit les noms de notes en MIDI', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('C#3')).toBe(49);
    expect(noteToMidi('Eb5')).toBe(75);
    expect(noteToMidi('B#3')).toBe(60);
    expect(noteToMidi('Cb4')).toBe(59);
  });
});

describe('accords', () => {
  it('analyse les symboles', () => {
    expect(chordPitchClasses(parseChord('Am9'))).toEqual([9, 0, 4, 7, 11]);
    expect(parseChord('C/E').bass).toBe(4);
    expect(chordPitchClasses(parseChord('E7sus4'))).toEqual([4, 9, 11, 2]);
    expect(chordPitchClasses(parseChord('Dbmaj7'))).toEqual([1, 5, 8, 0]);
    expect(() => parseChord('Hm')).toThrow();
    expect(() => parseChord('Cfoo')).toThrow();
  });

  it('place la basse dans le registre demandé', () => {
    expect(bassNote(parseChord('D/F#'), 36)).toBe(42);
    expect(bassNote(parseChord('Am9'), 33)).toBe(33);
  });

  it('produit des voicings dans la tessiture avec une conduite des voix économe', () => {
    const opts = { low: 52, high: 79, center: 64, maxNotes: 4 };
    const prog = voiceProgression(['Am9', 'Fmaj7', 'C/E', 'G6'], opts);
    for (const v of prog) {
      expect(v.length).toBeLessThanOrEqual(4);
      expect(Math.min(...v)).toBeGreaterThanOrEqual(52);
      expect(Math.max(...v)).toBeLessThanOrEqual(79);
    }
    // Mouvement moyen par voix raisonnable entre accords voisins.
    for (let i = 1; i < prog.length; i++) {
      const a = prog[i - 1];
      const b = prog[i];
      const moves = b.map((n) => Math.min(...a.map((p) => Math.abs(n - p))));
      expect(moves.reduce((x, y) => x + y, 0) / moves.length).toBeLessThanOrEqual(3);
    }
  });

  it("n'accepte que les notes de l'accord", () => {
    const v = voiceChord(parseChord('E7'), null, { low: 55, high: 80, center: 66 });
    for (const n of v) expect([4, 8, 11, 2]).toContain(n % 12);
  });
});

describe('harmonisation diatonique', () => {
  it('déplace par degrés dans la gamme', () => {
    const aMinor = scale('A', 'aeolian');
    expect(diatonicShift(noteToMidi('A4'), aMinor, 2)).toBe(noteToMidi('C5'));
    expect(diatonicShift(noteToMidi('E5'), aMinor, -5)).toBe(noteToMidi('G4'));
    expect(diatonicShift(noteToMidi('G4'), aMinor, 1)).toBe(noteToMidi('A4'));
    const eDorian = scale('E', 'dorian');
    expect(diatonicShift(noteToMidi('B4'), eDorian, 1)).toBe(noteToMidi('C#5'));
  });
});

describe('notation', () => {
  it('analyse une phrase avec liaisons, accents et silences', () => {
    const ev = phrase('A4:2 C5:2! E5:4 F5:6? E5:2- | E5:6 _:2 [C4,E4]:8');
    expect(ev.map((e) => [e.step, e.len, e.notes, e.vel])).toEqual([
      [0, 2, [69], 0.8],
      [2, 2, [72], 1],
      [4, 4, [76], 0.8],
      [8, 6, [77], 0.5],
      [14, 8, [76], 0.8],
      [24, 8, [60, 64], 0.8],
    ]);
  });

  it('refuse une barre de mesure mal placée', () => {
    expect(() => phrase('A4:4 | C5:4')).toThrow(/Barre de mesure/);
  });

  it('lit les motifs rythmiques', () => {
    expect(hits('X...x...|o.......')).toEqual([
      { step: 0, vel: 1 },
      { step: 4, vel: 0.8 },
      { step: 8, vel: 0.45 },
    ]);
  });
});
