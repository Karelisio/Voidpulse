/**
 * Format de la sauvegarde (versionné). Les champs ajoutés plus tard prennent leur valeur par
 * défaut au chargement (fusion avec `defaultSave`) ; seules les transformations (renommage,
 * changement d'unité) demandent une migration (migrate.ts).
 */

export const SAVE_VERSION = 1;

export type ThemeId = 'arcade' | 'material' | 'light' | 'dark';
export type Language = 'fr' | 'en';

export interface AudioPrefs {
  master: number;
  music: number;
  sfx: number;
  ui: number;
  ambience: number;
  bassDb: number;
  trebleDb: number;
  headphones: boolean;
  muted: boolean;
}

export interface ControlPrefs {
  sensitivity: number;
  leftHanded: boolean;
  aim: 'auto' | 'direction';
  haptics: boolean;
}

export interface DisplayPrefs {
  /** Préréglage de qualité (bas, moyen, haut) ou personnalisé. */
  preset: 'low' | 'medium' | 'high' | 'custom';
  resolution: number;
  particles: number;
  damageNumbers: boolean;
  shake: number;
  reduceFlashes: boolean;
  fpsCap: 30 | 60;
  hudScale: number;
  theme: ThemeId;
  language: Language;
}

export interface LifetimeStats {
  runs: number;
  victories: number;
  kills: number;
  bestTime: number;
  bestLevel: number;
  playSeconds: number;
  /** Élites abattues (déblocages). */
  elites: number;
}

/** Profil : personnage choisi, personnages débloqués, meilleurs rang et score. */
export interface ProfileData {
  character: string;
  unlocked: string[];
  /** Index du meilleur rang atteint (PACTS.ranks), -1 si aucun. */
  bestRank: number;
  bestScore: number;
}

export interface SaveData {
  version: number;
  /** Horodatage (ms) de création et de dernière écriture. */
  createdAt: number;
  updatedAt: number;
  audio: AudioPrefs;
  controls: ControlPrefs;
  display: DisplayPrefs;
  stats: LifetimeStats;
  profile: ProfileData;
}

export function defaultSave(now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    audio: {
      master: 0.9,
      music: 0.75,
      sfx: 0.9,
      ui: 0.8,
      ambience: 0.7,
      bassDb: 0,
      trebleDb: 0,
      headphones: false,
      muted: false,
    },
    controls: { sensitivity: 1, leftHanded: false, aim: 'auto', haptics: true },
    display: {
      preset: 'high',
      resolution: 1,
      particles: 1,
      damageNumbers: true,
      shake: 1,
      reduceFlashes: false,
      fpsCap: 60,
      hudScale: 1,
      theme: 'arcade',
      language: 'fr',
    },
    stats: {
      runs: 0,
      victories: 0,
      kills: 0,
      bestTime: 0,
      bestLevel: 0,
      playSeconds: 0,
      elites: 0,
    },
    profile: {
      character: 'vex',
      unlocked: ['vex', 'nova', 'volt', 'toxa'],
      bestRank: -1,
      bestScore: 0,
    },
  };
}

/** Préréglages de qualité d'affichage. */
export const QUALITY_PRESETS: Record<
  'low' | 'medium' | 'high',
  Pick<DisplayPrefs, 'resolution' | 'particles' | 'fpsCap'>
> = {
  low: { resolution: 0.6, particles: 0.35, fpsCap: 30 },
  medium: { resolution: 0.8, particles: 0.65, fpsCap: 60 },
  high: { resolution: 1, particles: 1, fpsCap: 60 },
};
