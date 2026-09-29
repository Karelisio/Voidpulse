/**
 * Identifiants d'images de l'atlas, partagés entre la simulation (Look.frame) et le rendu
 * (qui génère une texture par identifiant, plus sa variante « flash blanc »). Les images
 * blanches sont teintées au rendu par Look.tint (couleur de l'élément).
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
  /** Projectiles blancs (teintés) : trait, orbe, éclat, disque, missile, éclat du vide. */
  SHOT_BOLT: 13,
  SHOT_ORB: 14,
  SHOT_SHARD: 15,
  SHOT_DISC: 16,
  SHOT_MISSILE: 17,
  SHOT_VOID: 18,
  ORB_GENERIC: 19,
  /** Zones du joueur et des réactions (teintées). */
  ZONE_POOL: 20,
  ZONE_PMINE: 21,
  ZONE_STRIKE: 22,
  ZONE_BEAM: 23,
  ZONE_SURGE: 24,
  ZONE_WELL: 25,
  CHEST: 26,
  /** Ennemis : ENEMY_BASE + index de type. */
  ENEMY_BASE: 64,
  /** Boss : BOSS_BASE + index de boss. */
  BOSS_BASE: 128,
} as const;

export const FRAME_COUNT = 160;
