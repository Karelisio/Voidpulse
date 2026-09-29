/**
 * Identifiants d'images de l'atlas, partagés entre la simulation (Look.frame) et le rendu
 * (qui génère une texture par identifiant, plus sa variante « flash blanc »).
 */
export const FRAME = {
  NONE: 0,
  PLAYER: 1,
  SHOT_FIRE: 2,
  SHOT_GENERIC: 3,
  BULLET: 4,
  GEM_S: 5,
  GEM_M: 6,
  GEM_L: 7,
  ORB_FROST: 8,
  ZONE_VAPOR: 9,
  ZONE_RING: 10,
  ZONE_RECT: 11,
  ZONE_MINE: 12,
  /** Ennemis : ENEMY_BASE + index de type. */
  ENEMY_BASE: 32,
  /** Boss : BOSS_BASE + index de boss. */
  BOSS_BASE: 64,
} as const;

export const FRAME_COUNT = 80;
