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
  /** Pièce d'or, monticule d'un fouisseur enfoui. */
  COIN: 27,
  MOUND: 28,
  /** Décors d'événements : marchand, autel de sacrifice, faille temporelle. */
  MERCHANT: 29,
  ALTAR: 30,
  RIFT: 31,
  /** Dangers ennemis (teintés) : flaque, cible de mortier, obus, cercle d'alerte. */
  ZONE_HAZARD: 32,
  ZONE_TARGET: 33,
  SHELL: 34,
  ZONE_WARN: 35,
  /** Surcouches d'ennemis (teintées) : arc de bouclier, bulle, protection, anneau d'aura. */
  SHIELD_ARC: 36,
  BUBBLE: 37,
  GUARD: 38,
  AURA: 39,
  /** Projectile ennemi blanc (teinté par la couleur du tireur). */
  BULLET_TINT: 40,
  /** Terrain du stage (eau, glace, bourbier ; teinté). */
  TERRAIN: 41,
  /** Vaisseaux des personnages : PLAYER_BASE + index de personnage (12). */
  PLAYER_BASE: 44,
  /** Ennemis : ENEMY_BASE + index de type. */
  ENEMY_BASE: 64,
  /** Boss : BOSS_BASE + index de boss. */
  BOSS_BASE: 128,
} as const;

export const FRAME_COUNT = 160;
