/**
 * Types d'événements émis par la simulation (file SoA : a, b, x, y, v, w).
 * Chaque commentaire indique la signification des champs.
 */
export const EV = {
  /** a : eid, b : slot | élément << 8 | critique << 16, x/y, v : dégâts. */
  HIT: 1,
  /** a : eid, b : type d'ennemi (255 = boss), x/y, v : XP. */
  KILL: 2,
  /** a : PV restants, v : dégâts. */
  PLAYER_HURT: 3,
  PLAYER_DEATH: 4,
  /** a : slot, b : index d'arme, x/y : origine, v : rayon (nova, 0 sinon), w : élément. */
  FIRE: 5,
  /** Segment d'éclair : a : slot, b : élément, x/y → v/w. */
  BEAM: 6,
  /** a : index de réaction, b : 1 si forme ultime de l'Éveil, x/y, v : rayon. */
  REACTION: 7,
  EVEIL_START: 8,
  EVEIL_END: 9,
  /** x/y, v : rayon, a : élément. */
  EVEIL_NOVA: 10,
  /** a : nouveau niveau. */
  LEVEL_UP: 11,
  /** v : valeur (cosmétique). */
  XP: 12,
  /** x/y, v/w : direction. */
  DASH: 13,
  /** x/y : origine. */
  ENEMY_SHOT: 14,
  /** a : nature (0 kamikaze, 1 mine de boss, 3 mine du joueur, 4 implosion), x/y, v : rayon, w : élément. */
  EXPLOSION: 15,
  /** x/y → v/w. */
  BLINK: 16,
  /** a : nature (voir TELEGRAPH_KIND), x/y, v : durée. */
  TELEGRAPH: 17,
  /** a : index de boss. */
  BOSS_SPAWN: 18,
  /** a : phase, b : 1 si rage. */
  BOSS_PHASE: 19,
  /** x/y. */
  BOSS_DEATH: 20,
  /** a : motif (index de BOSS_PATTERNS). */
  BOSS_PATTERN: 21,
  /** x/y (cosmétique). */
  FREEZE: 22,
  /** a : 1 victoire, 0 défaite. */
  RUN_END: 23,
  /** Fin d'une charge de boss, x/y. */
  BOSS_SLAM: 24,
  /** Impact d'une frappe de zone (orage) : a : slot, b : index d'arme, x/y, v : rayon, w : élément. */
  STRIKE: 25,
  /** Coffre d'élite posé : x/y. */
  CHEST_DROP: 26,
  /** Coffre ouvert : a : nombre de récompenses. */
  CHEST_OPEN: 27,
  /** Arme évoluée : a : index d'arme. */
  EVOLUTION: 28,
  /** Élite apparue : a : eid, b : type. */
  ELITE_SPAWN: 29,
  /** Fin de l'Éveil : détonation fusionnée, x/y, v : rayon. */
  EVEIL_FINALE: 30,
} as const;

export const TELEGRAPH_KIND = { KAMIKAZE: 0, BLINK: 1, BOSS: 2, SHOOTER: 3 } as const;

/** Emplacement fictif des dégâts de réaction et d'Éveil dans les statistiques. */
export const SLOT_REACTION = 6;
export const SLOT_EVEIL = 7;
