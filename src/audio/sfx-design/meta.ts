/** Métadonnées d'un son, échangées entre la page de rendu et scripts/render-sfx. */
export interface SoundMeta {
  id: string;
  variants: number;
  stereo: boolean;
  bus: string;
  gainDb: number;
  pitchVar: number;
  volVar: number;
  maxVoices: number;
  priority: number;
  cooldownMs: number;
}
