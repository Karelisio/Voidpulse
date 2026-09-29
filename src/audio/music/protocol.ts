/**
 * Messages échangés entre le lecteur (thread principal), le worker de décodage et le worklet
 * mixeur. Positions en échantillons à 48 kHz ; « position de deck » = position dans la piste
 * depuis le début de l'intro, non repliée (la boucle se répète au-delà de loopEnd).
 */

export type StreamPart = 0 | 1; // 0 = intro, 1 = boucle
export const PART_INTRO: StreamPart = 0;
export const PART_LOOP: StreamPart = 1;

export interface DeckStemSpec {
  /** URL du fichier intro (layout split) ou null. */
  intro: string | null;
  /** URL du fichier boucle (split) ou du fichier complet (single). */
  loop: string;
}

export interface DeckSpec {
  id: number;
  /** Début de la boucle (échantillons). */
  loopStart: number;
  /** Longueur de la boucle (échantillons). */
  loopLength: number;
  /**
   * split : l'intro est un flux à part, la boucle démarre à loopStart.
   * single : un seul flux (intro + boucle), rejoué depuis loopStart en fin de boucle.
   */
  layout: 'split' | 'single';
  stems: DeckStemSpec[];
  /** Gains initiaux des stems (0-1). */
  gains: number[];
  /** Gain initial du deck (0 pour un fondu d'entrée). */
  gain: number;
}

// ─── Principal → worker ──────────────────────────────────────────────────────────────────
export type ToWorker = { type: 'open'; deck: DeckSpec } | { type: 'close'; deck: number };

// ─── Worker → principal ──────────────────────────────────────────────────────────────────
export type FromWorker =
  { type: 'ready'; deck: number } | { type: 'error'; deck: number; message: string };

// ─── Worker → worklet (canal direct) ─────────────────────────────────────────────────────
export interface PcmBlock {
  type: 'pcm';
  deck: number;
  stem: number;
  part: StreamPart;
  /** Index du premier échantillon du bloc dans le flux. */
  start: number;
  /** Stéréo entrelacée. */
  data: Float32Array;
  /** Dernier bloc du flux (flux fini). */
  end: boolean;
}

// ─── Worklet → worker (canal direct) ─────────────────────────────────────────────────────
export interface Consumed {
  type: 'pos';
  deck: number;
  /** Position de deck courante. */
  pos: number;
}

// ─── Principal → worklet ─────────────────────────────────────────────────────────────────
export type ToMixer =
  | { type: 'deck'; deck: DeckSpec }
  /** Données décodées en entier (repli sans WebCodecs) : mono Int16 à `rate` Hz. */
  | {
      type: 'static';
      deck: number;
      stem: number;
      part: StreamPart;
      data: Int16Array;
      rate: number;
      length: number;
    }
  /** Démarre le deck à l'échantillon de contexte `at` (0 = tout de suite). */
  | { type: 'start'; deck: number; at: number }
  /** Rampe de gain d'un stem (stem = -1 : gain du deck) à la position de deck `at` (-1 = tout de suite). */
  | { type: 'ramp'; deck: number; stem: number; target: number; at: number; frames: number }
  /** Varispeed de tous les decks (1 = normal). */
  | { type: 'rate'; rate: number; frames: number }
  /** Retire le deck à l'échantillon de contexte `at` (0 = tout de suite). */
  | { type: 'stop'; deck: number; at: number };

// ─── Worklet → principal ─────────────────────────────────────────────────────────────────
export interface DeckReport {
  id: number;
  started: boolean;
  pos: number;
  gain: number;
  stemGains: number[];
  /** Niveau RMS de chaque stem sur la fenêtre (après gain). */
  levels: number[];
}

export interface MixerReport {
  type: 'report';
  /** Échantillon de contexte à la fin du bloc rendu. */
  frame: number;
  rate: number;
  underruns: number;
  decks: DeckReport[];
}

export type FromMixer = MixerReport | { type: 'ended'; deck: number };
