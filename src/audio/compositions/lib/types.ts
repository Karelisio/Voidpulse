import type * as Tone from 'tone';
import type { Rng } from '../../../engine/rng';
import type { Grid } from './time';

export const LAYERS = ['pads', 'bass', 'drums', 'arp', 'lead'] as const;
export type LayerName = (typeof LAYERS)[number];

/** Palier d'intensité musicale (0 calme → 3 intense) à partir duquel une couche est audible. */
export type IntensityLevel = 0 | 1 | 2 | 3;

export interface LayerContext {
  grid: Grid;
  /** Sortie de la couche (reliée à la destination du rendu). */
  out: Tone.ToneAudioNode;
  /** Aléatoire seedé propre à la piste et à la couche (humanisation, variations). */
  rng: Rng;
  /** Durée totale rendue, queue comprise (s). */
  duration: number;
}

export interface LayerSpec {
  enterAt: IntensityLevel;
  build(ctx: LayerContext): Promise<void> | void;
}

export interface TrackDef {
  id: string;
  title: string;
  bpm: number;
  key: string;
  swing?: number;
  introBars: number;
  loopBars: number;
  /** Queue rendue après la fin de boucle puis repliée sur le début de boucle. */
  tailSeconds: number;
  /** Pistes jouées en phase (versions calme et intense d'un même stage). */
  group?: string;
  /** Loudness cible de chaque stem en LU, relative au mix complet (normalisé à -14 LUFS). */
  mix: Record<LayerName, number>;
  layers: Record<LayerName, LayerSpec>;
}

/** Métadonnées sérialisables transmises au script Node de rendu. */
export interface TrackMeta {
  id: string;
  title: string;
  bpm: number;
  key: string;
  timeSignature: [number, number];
  introBars: number;
  loopBars: number;
  tailSeconds: number;
  group?: string;
  mix: Record<LayerName, number>;
  enterAt: Record<LayerName, IntensityLevel>;
}

export function trackMeta(def: TrackDef): TrackMeta {
  const enterAt = {} as Record<LayerName, IntensityLevel>;
  for (const [name, spec] of Object.entries(def.layers) as [LayerName, LayerSpec][]) {
    enterAt[name] = spec.enterAt;
  }
  return {
    id: def.id,
    title: def.title,
    bpm: def.bpm,
    key: def.key,
    timeSignature: [4, 4],
    introBars: def.introBars,
    loopBars: def.loopBars,
    tailSeconds: def.tailSeconds,
    ...(def.group ? { group: def.group } : {}),
    mix: def.mix,
    enterAt,
  };
}
