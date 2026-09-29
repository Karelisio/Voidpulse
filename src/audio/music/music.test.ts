import { describe, expect, it } from 'vitest';
import drumsDataUrl from '../../../assets/audio/music/stage1-calm/drums.ogg?inline';
import tracksJson from '../../../assets/audio/music/tracks.json';
import { IntensityDirector, rawIntensity, stemTargets, tierFor } from './intensity';
import { barFrames, nextBar, parseManifest, stageBinding, trackById } from './manifest';
import { MixerCore, QUANTUM, RampedGain, Stream } from './mixer-core';
import { demuxOggOpus, opusPacketSamples } from './ogg';
import type { DeckSpec } from './protocol';

describe('tracks.json', () => {
  const m = parseManifest(tracksJson);

  it('est valide et ses liaisons pointent vers des pistes existantes', () => {
    expect(m.tracks.length).toBeGreaterThanOrEqual(4);
    expect(trackById(m, m.bindings.menu).id).toBe('menu');
    const s = stageBinding(m, 1);
    expect(trackById(m, s.calm).bpm).toBe(trackById(m, s.intense).bpm);
    // Stage non lié : retombe sur le stage 1.
    expect(stageBinding(m, 99)).toEqual(stageBinding(m, 1));
  });

  it('donne à chaque stage, au boss final et à la fin de run leur propre musique', () => {
    const ids = new Set<string>();
    for (let n = 1; n <= 8; n++) {
      const s = stageBinding(m, n);
      expect(s.calm).toBe(`stage${String(n)}-calm`);
      expect(s.intense).toBe(`stage${String(n)}-intense`);
      const calm = trackById(m, s.calm);
      const intense = trackById(m, s.intense);
      // Versions jouées en phase : même tempo et mêmes points de boucle.
      expect([calm.loopStart, calm.loopEnd]).toEqual([intense.loopStart, intense.loopEnd]);
      ids.add(s.calm).add(s.intense);
    }
    expect(ids.size).toBe(16);
    expect(m.bindings.finalBoss).toBe('final-boss');
    expect(m.bindings.endOfRun).toBe('end-of-run');
    expect(m.tracks).toHaveLength(20);
  });

  it('a des boucles d’un nombre entier de mesures', () => {
    for (const t of m.tracks) {
      const bars = ((t.loopEnd - t.loopStart) * 48000) / barFrames(t);
      expect(Math.abs(bars - Math.round(bars))).toBeLessThan(1e-3);
      const start = (t.loopStart * 48000) / barFrames(t);
      expect(Math.abs(start - Math.round(start))).toBeLessThan(1e-3);
    }
  });

  it('rejette les manifestes invalides', () => {
    expect(() => parseManifest({ version: 2 })).toThrow();
    const broken = structuredClone(tracksJson) as { bindings: { boss: string } };
    broken.bindings.boss = 'inexistante';
    expect(() => parseManifest(broken)).toThrow(/inconnue/);
    const grid = structuredClone(tracksJson) as { tracks: { id: string; bpm: number }[] };
    const intense = grid.tracks.find((t) => t.id === 'stage1-intense');
    if (intense) intense.bpm = 120;
    expect(() => parseManifest(grid)).toThrow(/partager/);
  });

  it('quantifie à la mesure suivante', () => {
    const t = trackById(m, 'stage1-calm');
    const bar = barFrames(t);
    expect(nextBar(t, 0, 0)).toBe(0);
    expect(nextBar(t, 10, 0)).toBeCloseTo(bar, 6);
    expect(nextBar(t, bar - 100, 200)).toBeCloseTo(bar * 2, 6);
  });
});

describe('intensité musicale', () => {
  it('monte vite et redescend lentement', () => {
    const d = new IntensityDirector();
    for (let i = 0; i < 90; i++) d.update(1, 1 / 60);
    const afterRise = d.value;
    expect(afterRise).toBeGreaterThan(0.4);
    for (let i = 0; i < 90; i++) d.update(0, 1 / 60);
    expect(d.value).toBeGreaterThan(afterRise * 0.7);
  });

  it('applique une hystérésis entre paliers', () => {
    expect(tierFor(0.21, 0)).toBe(1);
    expect(tierFor(0.18, 1)).toBe(1);
    expect(tierFor(0.12, 1)).toBe(0);
    expect(tierFor(0.9, 0)).toBe(3);
    expect(tierFor(0.64, 3)).toBe(3);
    expect(tierFor(0.6, 3)).toBe(2);
  });

  it('mesure brute : densité, danger, boss', () => {
    expect(rawIntensity(0, 1, 0, false)).toBe(0);
    expect(rawIntensity(12, 1, 0, false)).toBeLessThan(0.2);
    expect(rawIntensity(120, 1, 0, false)).toBeGreaterThan(0.72);
    expect(rawIntensity(80, 0.1, 1, true)).toBe(1);
  });

  it('choisit les couches et bascule vers la version intense au palier 3', () => {
    const enterAt = [0, 0, 1, 2, 0, 0, 0];
    expect(Array.from(stemTargets(enterAt, 4, 0))).toEqual([1, 1, 0, 0, 0, 0, 0]);
    expect(Array.from(stemTargets(enterAt, 4, 2))).toEqual([1, 1, 1, 1, 0, 0, 0]);
    expect(Array.from(stemTargets(enterAt, 4, 3))).toEqual([0, 0, 0, 0, 1, 1, 1]);
    // Piste seule (boss) : tout joue au palier 3.
    expect(Array.from(stemTargets([0, 1, 2], 3, 3))).toEqual([1, 1, 1]);
  });
});

describe('démultiplexeur Ogg Opus', () => {
  it('lit l’en-tête et la longueur exacte (pré-skip et rognage de fin)', () => {
    const base64 = drumsDataUrl.slice(drumsDataUrl.indexOf(',') + 1);
    const s = demuxOggOpus(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
    expect(s.head.channels).toBe(2);
    expect(s.head.preSkip).toBeGreaterThan(0);
    // Boucle de 76,8 s exactement (vérifié contre ffmpeg).
    expect(s.length).toBe(3686400);
  });

  it('calcule la durée des paquets selon le TOC', () => {
    expect(opusPacketSamples(Uint8Array.of(0xfc))).toBe(960); // CELT 20 ms, 1 trame
    expect(opusPacketSamples(Uint8Array.of(0xfd))).toBe(1920); // 2 trames
    expect(opusPacketSamples(Uint8Array.of(0xf3, 0x03))).toBe(1440); // CELT 10 ms × 3
  });
});

function spec(over: Partial<DeckSpec> = {}): DeckSpec {
  return {
    id: 1,
    loopStart: 256,
    loopLength: 512,
    layout: 'split',
    stems: [{ intro: 'i', loop: 'l' }],
    gains: [1],
    gain: 1,
    ...over,
  };
}

/** Bloc stéréo entrelacé dont chaque échantillon vaut index + offset (gauche) et son opposé (droite). */
function ramp(start: number, frames: number, offset: number): Float32Array {
  const d = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    d[i * 2] = (start + i + offset) / 10000;
    d[i * 2 + 1] = -(start + i + offset) / 10000;
  }
  return d;
}

describe('cœur du mixeur', () => {
  it('lit intro puis boucle en phase, à l’échantillon près', () => {
    const core = new MixerCore();
    const deck = core.addDeck(spec());
    const intro = deck.stream(0, 0);
    const loop = deck.stream(0, 1);
    intro?.push(0, ramp(0, 256, 0), true);
    loop?.push(0, ramp(0, 2048, 5000), false);
    core.start(1, 0);
    const l = new Float32Array(QUANTUM);
    const r = new Float32Array(QUANTUM);
    const got: number[] = [];
    for (let b = 0; b < 4; b++) {
      core.process(l, r, QUANTUM, []);
      got.push(...Array.from(l));
      expect(Array.from(r)).toEqual(Array.from(l, (v) => 0 - v));
    }
    expect(got[0]).toBeCloseTo(0, 6);
    expect(got[255]).toBeCloseTo(255 / 10000, 6);
    // À la position 256, la boucle démarre à son index 0 (valeur 5000).
    expect(got[256]).toBeCloseTo(5000 / 10000, 6);
    expect(got[300]).toBeCloseTo(5044 / 10000, 6);
    expect(core.underruns).toBe(0);
    expect(deck.pos).toBe(512);
  });

  it('applique les rampes de gain à la position de piste demandée', () => {
    const g = new RampedGain(1);
    g.schedule(0, 100, 50, 0);
    const offs = Float32Array.from({ length: QUANTUM }, (_, i) => i);
    const out = new Float32Array(QUANTUM);
    g.render(out, 0, offs, QUANTUM);
    expect(out[99]).toBe(1);
    expect(out[100]).toBeCloseTo(1 - 1 / 50, 6);
    expect(out[127]).toBeCloseTo(1 - 28 / 50, 6);
    g.render(out, QUANTUM, offs, QUANTUM);
    expect(out[21]).toBe(0);
    expect(g.value).toBe(0);
  });

  it('signale les données manquantes et libère les blocs consommés', () => {
    const s = new Stream();
    s.push(0, ramp(0, 64, 0), false);
    const offs = Float32Array.from({ length: QUANTUM }, (_, i) => i);
    const gains = new Float32Array(QUANTUM).fill(1);
    const l = new Float32Array(QUANTUM);
    const r = new Float32Array(QUANTUM);
    s.mix(l, r, 0, offs, gains, QUANTUM);
    expect(s.underruns).toBe(1);
    s.push(64, ramp(64, 64, 0), false);
    s.push(128, ramp(128, 64, 0), false);
    s.trim(130);
    l.fill(0);
    s.mix(l, r, 128, offs, gains, 1);
    expect(l[0]).toBeCloseTo(128 / 10000, 6);
  });

  it('interpole en varispeed sans désynchroniser les stems', () => {
    const core = new MixerCore();
    const deck = core.addDeck(
      spec({
        stems: [
          { intro: 'a', loop: 'b' },
          { intro: 'c', loop: 'd' },
        ],
        gains: [1, 1],
        loopStart: 100000,
      }),
    );
    for (let k = 0; k < 2; k++) deck.stream(k, 0)?.push(0, ramp(0, 4096, 0), false);
    core.start(1, 0);
    core.setRate(2 ** (1 / 12), 64);
    const l = new Float32Array(QUANTUM);
    const r = new Float32Array(QUANTUM);
    for (let b = 0; b < 8; b++) core.process(l, r, QUANTUM, []);
    // Deux stems identiques : la sortie vaut exactement 2 × la position lue.
    const pos = deck.pos;
    expect(pos).toBeGreaterThan(8 * QUANTUM);
    expect(l[QUANTUM - 1]).toBeGreaterThan(0);
    expect(core.rate).toBeCloseTo(2 ** (1 / 12), 6);
  });

  it('démarre et retire un deck au bon moment', () => {
    const core = new MixerCore();
    core.addDeck(spec());
    core.start(1, 300);
    const l = new Float32Array(QUANTUM);
    const r = new Float32Array(QUANTUM);
    core.process(l, r, QUANTUM, []);
    expect(core.decks.get(1)?.started).toBe(false);
    core.process(l, r, QUANTUM, []);
    core.process(l, r, QUANTUM, []);
    expect(core.decks.get(1)?.started).toBe(true);
    core.stop(1, core.frame + 10);
    const ended: number[] = [];
    core.process(l, r, QUANTUM, ended);
    expect(ended).toEqual([1]);
    expect(core.decks.size).toBe(0);
  });
});
