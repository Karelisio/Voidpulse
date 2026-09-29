/**
 * Schémas des données de jeu (/config/*.json). Validés en test (config.test.ts) ; le jeu
 * n'importe que les types (import type), zod n'est jamais embarqué dans le bundle.
 */
import { z } from 'zod';
import { ELEMENTS } from './elements';
import { BEHAVIORS, BIOMES, ENEMY_PARAMS, RUN_EVENTS, type EnemyParam } from './keys';

export { BEHAVIORS, BIOMES, ELEMENTS, ENEMY_PARAMS, RUN_EVENTS, type EnemyParam };
export const Element = z.enum(ELEMENTS);
export type Element = z.infer<typeof Element>;

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const positive = z.number().positive();
const nonNegative = z.number().nonnegative();

export const PlayerDef = z.object({
  maxHp: positive,
  speed: positive,
  radius: positive,
  iFrames: nonNegative,
  pickupRadius: positive,
  magnetSpeed: positive,
  critChance: z.number().min(0).max(1),
  critMult: z.number().min(1),
  dash: z.object({
    distance: positive,
    duration: positive,
    cooldown: positive,
    iFrames: nonNegative,
  }),
});
export type PlayerDef = z.infer<typeof PlayerDef>;

/**
 * Statistiques d'une arme ; chaque niveau ajoute des deltas à ces valeurs. Sens selon
 * l'archétype : damage = dégâts par coup (par tick pour rayon, aura, zone) ; cooldown =
 * intervalle entre deux lancers (orbite : recharge de touche par ennemi ; aura : intervalle des
 * ticks) ; count = projectiles, éclats, rayons, impulsions, mines, missiles, zones ou rebonds ;
 * speed = vitesse (px/s) ou vitesse angulaire (orbite, rad/s) ; size = rayon du projectile,
 * largeur du rayon ou rayon de déclenchement d'une mine ; range = rayon d'orbite, portée,
 * longueur du rayon, rayon d'effet (nova, aura, mine, zone) ou distance d'aller (boomerang) ;
 * duration = durée de vie ; status = intensité du statut élémentaire (voir docs §8).
 */
export const WeaponStats = z.object({
  damage: nonNegative,
  cooldown: nonNegative,
  count: z.number().int().nonnegative(),
  pierce: z.number().int().nonnegative(),
  speed: nonNegative,
  size: nonNegative,
  range: nonNegative,
  duration: nonNegative,
  status: nonNegative,
});
export type WeaponStats = z.infer<typeof WeaponStats>;

export const ARCHETYPES = [
  'projectile',
  'orbit',
  'beam',
  'nova',
  'boomerang',
  'chain',
  'aura',
  'mines',
  'homing',
  'zone',
] as const;
export const Archetype = z.enum(ARCHETYPES);
export type Archetype = z.infer<typeof Archetype>;

/** Paramètres d'archétype (fixes, non affectés par les niveaux ; remplacés par l'évolution). */
export const WeaponParams = z
  .object({
    /** Écart angulaire entre projectiles (rad). */
    spread: nonNegative,
    /** Motif de tir des projectiles : 0 visé, 1 en étoile, 2 aléatoire. */
    pattern: z.number().int().min(0).max(2),
    /** Rayon d'explosion à l'impact (0 = aucune). */
    explode: nonNegative,
    /** Fragments libérés quand le projectile expire ou s'épuise. */
    split: z.number().int().nonnegative(),
    /** Vitesse de virage des têtes chercheuses (rad/s). */
    turn: nonNegative,
    /** Balayage angulaire des rayons (rad/s, 0 = fixe). */
    sweep: nonNegative,
    /** Le rayon suit la cible la plus proche (1) ou garde sa direction (0). */
    track: z.number().int().min(0).max(1),
    /** Intervalle des ticks de dégâts (s) : rayon, zone. */
    tick: positive,
    /** Attraction vers le centre (px/s). */
    pull: nonNegative,
    /** Recul infligé. */
    knock: nonNegative,
    /** Zone : délai avant un impact unique (0 = zone persistante). */
    strike: nonNegative,
    /** Mine : durée de la flaque laissée à l'explosion (0 = aucune). */
    pool: nonNegative,
    /** Mine : délai d'armement (s). */
    arm: nonNegative,
    /** Chaîne : branches supplémentaires à chaque rebond. */
    fork: z.number().int().nonnegative(),
    /** Arcs secondaires vers des ennemis voisins (nova) ou chance d'arc à l'impact (boomerang). */
    arcs: nonNegative,
    /** Soin (PV) par tick de l'aura qui touche, ou par rebond de chaîne. */
    heal: nonNegative,
    /** Chance de critique ajoutée. */
    critBonus: nonNegative,
  })
  .partial();
export type WeaponParams = z.infer<typeof WeaponParams>;

const StatDeltas = z.object({
  damage: z.number().optional(),
  cooldown: z.number().optional(),
  count: z.number().int().optional(),
  pierce: z.number().int().optional(),
  speed: z.number().optional(),
  size: z.number().optional(),
  range: z.number().optional(),
  duration: z.number().optional(),
  status: z.number().optional(),
});

export const WeaponDef = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  description: z.string(),
  element: Element,
  archetype: Archetype,
  color: hex,
  base: WeaponStats,
  params: WeaponParams.default({}),
  /** Deltas des niveaux 2 à N (index 0 = niveau 2) ; valeurs négatives permises (recharge). */
  levels: z.array(StatDeltas).min(1),
  /** Évolution : arme au niveau max + passif requis, obtenue dans un coffre d'élite. */
  evolution: z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string(),
    description: z.string(),
    passive: z.string(),
    base: WeaponStats,
    params: WeaponParams.default({}),
  }),
});
export type WeaponDef = z.infer<typeof WeaponDef>;

/** Bonus par niveau des passifs (proportions : 0.1 = +10 % ; valeurs absolues sinon). */
export const PassiveStats = z
  .object({
    /** PV max (absolu). */
    maxHp: nonNegative,
    speed: nonNegative,
    pickupRadius: nonNegative,
    /** Réduction de recharge (proportion). */
    cooldown: nonNegative,
    damage: nonNegative,
    area: nonNegative,
    /** Réduction fixe des dégâts subis par coup (absolu). */
    armor: nonNegative,
    /** Régénération (PV/s, absolu). */
    regen: nonNegative,
    /** Chance de critique (absolu, 0.05 = +5 points). */
    critChance: nonNegative,
    /** Multiplicateur de critique (absolu). */
    critMult: nonNegative,
    projectileSpeed: nonNegative,
    duration: nonNegative,
    /** Projectiles, éclats, mines… supplémentaires (absolu). */
    amount: z.number().int().nonnegative(),
    /** Chance (qualité des coffres). */
    luck: nonNegative,
    /** Gain d'XP. */
    growth: nonNegative,
    /** Gain de fragments (monnaie méta). */
    greed: nonNegative,
    /** Réduction de la recharge du dash. */
    dashCooldown: nonNegative,
    /** Puissance des statuts élémentaires. */
    status: nonNegative,
    /** Gain de jauge de Résonance. */
    gauge: nonNegative,
    fire: nonNegative,
    frost: nonNegative,
    lightning: nonNegative,
    poison: nonNegative,
    arcane: nonNegative,
    void: nonNegative,
  })
  .partial();
export type PassiveStats = z.infer<typeof PassiveStats>;

export const PassiveDef = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  description: z.string(),
  color: hex,
  maxLevel: z.number().int().positive(),
  perLevel: PassiveStats,
});
export type PassiveDef = z.infer<typeof PassiveDef>;

export const Behavior = z.enum(BEHAVIORS);
export type Behavior = z.infer<typeof Behavior>;

export const EnemyDef = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  biome: z.enum(BIOMES),
  behavior: Behavior,
  description: z.string(),
  hp: positive,
  speed: positive,
  damage: nonNegative,
  radius: positive,
  xp: positive,
  mass: positive,
  knockbackRes: z.number().min(0).max(1),
  color: hex,
  /** Élément des projectiles et flaques (teinte, ralentissement du givre). */
  element: Element.optional(),
  /** Créature invoquée, ou libérée à la mort (fission). */
  minion: z.string().optional(),
  params: z.partialRecord(z.enum(ENEMY_PARAMS), z.number().nonnegative()).default({}),
});
export type EnemyDef = z.infer<typeof EnemyDef>;

/** Affixe d'élite (tiré au hasard ; 1 à 3 selon le temps de jeu). */
export const AffixDef = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  description: z.string(),
  color: hex,
  /** Comportements incompatibles (effet redondant). */
  excludes: z.array(Behavior).default([]),
  params: z.record(z.string(), z.number()),
});
export type AffixDef = z.infer<typeof AffixDef>;

export const RunEventKind = z.enum(RUN_EVENTS);

/** Événements en cours de run : marchand, autel de sacrifice, horde dorée, faille temporelle. */
export const RunEventsDef = z.object({
  /** Premier événement (s), puis intervalle aléatoire [min, max]. */
  first: positive,
  interval: z.tuple([positive, positive]),
  /** Aucun événement dans cette fenêtre avant l'arrivée du boss. */
  bossBuffer: nonNegative,
  /** Distance d'apparition des marchands, autels et failles. */
  distance: z.tuple([positive, positive]),
  /** Or : probabilité qu'un ennemi abattu lâche une pièce ; pièces des élites. */
  coinChance: z.number().min(0).max(1),
  eliteCoins: z.number().int().nonnegative(),
  merchant: z.object({
    duration: positive,
    radius: positive,
    /** Prix × (1 + temps / priceScale). */
    priceScale: positive,
    offers: z.number().int().positive(),
    stock: z.array(
      z.object({
        id: z.enum(['heal', 'weapon', 'passive', 'maxhp', 'reroll', 'chest']),
        price: positive,
        value: nonNegative,
      }),
    ),
  }),
  altar: z.object({
    duration: positive,
    radius: positive,
    channel: positive,
    blood: z.object({ cost: z.number().min(0).max(1), rewards: z.number().int().positive() }),
    flesh: z.object({ cost: positive, damage: positive }),
    gold: z.object({ cost: z.number().min(0).max(1), min: z.number().int().nonnegative() }),
  }),
  horde: z.object({
    duration: positive,
    every: positive,
    count: z.number().int().positive(),
    enemy: z.string(),
  }),
  rift: z.object({
    duration: positive,
    radius: positive,
    time: positive,
    /** Vitesse des ennemis et de leurs projectiles dans le temps suspendu. */
    slow: z.number().min(0).max(1),
    xp: positive,
  }),
});
export type RunEventsDef = z.infer<typeof RunEventsDef>;

export const ReactionDef = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  elements: z.tuple([Element, Element]),
  description: z.string(),
  color: hex,
  /** Gain de jauge de Résonance. */
  gauge: positive,
  radius: nonNegative,
  damage: nonNegative,
  duration: nonNegative,
  /** Intensité propre à l'effet (recul, étourdissement, fragilité…). */
  power: nonNegative,
});
export type ReactionDef = z.infer<typeof ReactionDef>;

export const ResonanceDef = z.object({
  markDuration: positive,
  reactionCooldown: positive,
  gaugeMax: positive,
  diversityWindow: positive,
  diversityBonus: nonNegative,
  repeatFalloff: z.number().min(0).max(1),
  repeatFloor: z.number().min(0).max(1),
  eveil: z.object({
    duration: positive,
    novaInterval: positive,
    novaRadius: positive,
    novaDamage: positive,
    cooldownMult: positive,
    /** Échelle de l'effet de la réaction dominante porté par chaque impulsion. */
    ultimateScale: positive,
    /** Détonation finale : rayon et dégâts. */
    finaleRadius: positive,
    finaleDamage: positive,
  }),
});
export type ResonanceDef = z.infer<typeof ResonanceDef>;

/** Réglages des statuts élémentaires (docs §8). */
export const StatusDef = z.object({
  burn: z.object({ duration: positive, interval: positive }),
  chill: z.object({
    decay: positive,
    freeze: positive,
    bossFactor: positive,
    bossCap: z.number().min(0).max(1),
  }),
  shock: z.object({
    bonus: nonNegative,
    arcChance: z.number().min(0).max(1),
    arcRange: positive,
    arcDamage: nonNegative,
    arcCooldown: positive,
  }),
  toxin: z.object({ max: positive, duration: positive, dpsPerStack: positive }),
  expose: z.object({ duration: positive, max: positive }),
  entropy: z.object({ bossFactor: nonNegative, pull: nonNegative }),
  /** Fragilité (armure brisée) : dégâts subis en plus. */
  brittle: nonNegative,
  /** Statuts en % des PV max (flamme noire, corrosion) : réduction contre les boss. */
  percentBossFactor: nonNegative,
});
export type StatusDef = z.infer<typeof StatusDef>;

export const BossPattern = z.enum(['radial', 'spiral', 'summon', 'charge', 'mines']);
export type BossPattern = z.infer<typeof BossPattern>;

export const BossDef = z.object({
  id: z.string(),
  name: z.string(),
  hp: positive,
  radius: positive,
  speed: positive,
  contactDamage: positive,
  color: hex,
  bulletDamage: positive,
  bulletSpeed: positive,
  summon: z.string(),
  phases: z
    .array(
      z.object({
        /** Phase active tant que PV / PV max > threshold. */
        threshold: z.number().min(0).max(1),
        patterns: z.array(BossPattern).min(1),
        speedMult: positive,
        cooldownMult: positive,
        rage: z.boolean(),
      }),
    )
    .min(1),
  patternGap: positive,
});
export type BossDef = z.infer<typeof BossDef>;

export const StageDef = z.object({
  id: z.string(),
  name: z.string(),
  duration: positive,
  bossAt: positive,
  boss: z.string(),
  /** Nombre d'ennemis visé au fil du temps [secondes, nombre], interpolé linéairement. */
  density: z.array(z.tuple([nonNegative, nonNegative])).min(2),
  /** Répartition des types au fil du temps [secondes, { type: poids }]. */
  mix: z.array(z.tuple([nonNegative, z.record(z.string(), nonNegative)])).min(1),
  /** Multiplicateur de PV des ennemis au fil du temps [secondes, facteur]. */
  hpScale: z.array(z.tuple([nonNegative, positive])).min(2),
  /** Vagues scénarisées. */
  waves: z.array(
    z.object({
      at: nonNegative,
      /**
       * ring : cercle autour du joueur ; line : ligne qui avance ; swarm : essaim groupé ;
       * pincer : deux essaims opposés ; escort : un meneur (élite si `elite`) et sa garde
       * `minion` ; stampede : ligne qui traverse l'écran.
       */
      kind: z.enum(['ring', 'line', 'swarm', 'pincer', 'escort', 'stampede']),
      enemy: z.string(),
      count: z.number().int().positive(),
      minion: z.string().optional(),
      elite: z.boolean().optional(),
    }),
  ),
  /** Événements de run imposés [secondes, type] ; sinon tirés au hasard (runevents.json). */
  runEvents: z.array(z.tuple([nonNegative, RunEventKind])).optional(),
});
export type StageDef = z.infer<typeof StageDef>;

export const ProgressionDef = z.object({
  /** XP pour passer du niveau n au niveau n+1 : round(a × n^b + c). */
  xpCurve: z.object({ a: positive, b: positive, c: nonNegative }),
  maxWeapons: z.number().int().positive(),
  maxPassives: z.number().int().positive(),
  rerolls: z.number().int().nonnegative(),
  banishes: z.number().int().nonnegative(),
  locks: z.number().int().nonnegative(),
  gemMergeThreshold: z.number().int().positive(),
  /** Élites : première apparition, intervalle (s) et multiplicateurs. */
  elite: z.object({
    first: positive,
    every: positive,
    hp: positive,
    scale: positive,
    damage: positive,
    speed: positive,
    xp: positive,
    /** Nombre d'affixes selon le temps [secondes, nombre] (palier atteint). */
    affixes: z.array(z.tuple([nonNegative, z.number().int().nonnegative()])).min(1),
  }),
});
export type ProgressionDef = z.infer<typeof ProgressionDef>;
