/**
 * Squelette commun des pistes de stage : intro de 4 mesures, boucle A (16) + B (16), versions
 * calme et intense partageant tempo, grille et points de boucle (jouées en phase, croisées par
 * gains). Calme : nappes, basse et arpèges d'emblée, puis batterie, puis lead ; intense : tout.
 */
import type { IntensityLevel, LayerContext, LayerName, TrackDef } from './types';

export const INTRO_BARS = 4;
export const LOOP_BARS = 32;
export const TOTAL_BARS = INTRO_BARS + LOOP_BARS;
/** Dernière mesure de chaque demi-section : breaks et roulements. */
export const FILL_BARS: ReadonlySet<number> = new Set([11, 19, 27, 35]);
/** Débuts de section (A1, A2, B1, B2) : crash. */
export const SECTION_BARS: ReadonlySet<number> = new Set([4, 12, 20, 28]);

export const inRange = (bar: number, from: number, to: number): boolean => bar >= from && bar < to;

const CALM_ENTER: Record<LayerName, IntensityLevel> = {
  pads: 0,
  bass: 0,
  arp: 0,
  drums: 1,
  lead: 2,
};

export interface StageSpec {
  stage: number;
  name: string;
  bpm: number;
  key: string;
  swing?: number;
  tailSeconds: number;
  mixCalm: Record<LayerName, number>;
  mixIntense: Record<LayerName, number>;
  build(layer: LayerName, ctx: LayerContext, intense: boolean): Promise<void> | void;
}

/** Versions calme et intense d'un stage (`stageN-calm`, `stageN-intense`). */
export function stagePair(spec: StageSpec): [TrackDef, TrackDef] {
  const layers = (intense: boolean): TrackDef['layers'] => {
    const make = (layer: LayerName) => ({
      enterAt: intense ? (0 as const) : CALM_ENTER[layer],
      build: (ctx: LayerContext) => spec.build(layer, ctx, intense),
    });
    return {
      pads: make('pads'),
      bass: make('bass'),
      arp: make('arp'),
      drums: make('drums'),
      lead: make('lead'),
    };
  };
  const base = {
    bpm: spec.bpm,
    key: spec.key,
    ...(spec.swing ? { swing: spec.swing } : {}),
    introBars: INTRO_BARS,
    loopBars: LOOP_BARS,
    tailSeconds: spec.tailSeconds,
    group: `stage${String(spec.stage)}`,
  };
  return [
    {
      ...base,
      id: `stage${String(spec.stage)}-calm`,
      title: `${spec.name} — calme`,
      mix: spec.mixCalm,
      layers: layers(false),
    },
    {
      ...base,
      id: `stage${String(spec.stage)}-intense`,
      title: `${spec.name} — intense`,
      mix: spec.mixIntense,
      layers: layers(true),
    },
  ];
}
