/**
 * Schémas des données de jeu (/config/*.json). Validés en test (config.test.ts) ; le jeu
 * n'importe que les types (import type), zod n'est jamais embarqué dans le bundle.
 */
import { z } from 'zod';
import { ELEMENTS } from './elements';
import {
  BEHAVIORS,
  BIOMES,
  CHARACTER_EXTRAS,
  DASH_KINDS,
  ENEMY_PARAMS,
  RUN_EVENTS,
  RUN_MOD_ADD,
  RUN_MOD_MULT,
  UNLOCK_KINDS,
  MODE_IDS,
  META_EXTRAS,
  ACCOUNT_UNLOCKS,
  QUEST_METRICS,
  ACHIEVEMENT_METRICS,
  type EnemyParam,
} from './keys';

export {
  BEHAVIORS,
  BIOMES,
  CHARACTER_EXTRAS,
  DASH_KINDS,
  ELEMENTS,
  ENEMY_PARAMS,
  RUN_EVENTS,
  RUN_MOD_ADD,
  RUN_MOD_MULT,
  UNLOCK_KINDS,
  type EnemyParam,
};
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

/** Statistiques d'un personnage : appliquées une fois, malus permis (valeurs négatives). */
export const CharacterStats = z.partialRecord(
  z.enum([...(Object.keys(PassiveStats.shape) as (keyof PassiveStats)[]), ...CHARACTER_EXTRAS]),
  z.number(),
);
export type CharacterStats = z.infer<typeof CharacterStats>;

export const DashDef = z.object({
  kind: z.enum(DASH_KINDS),
  name: z.string(),
  description: z.string(),
  distance: nonNegative,
  duration: positive,
  cooldown: positive,
  iFrames: nonNegative,
  charges: z.number().int().positive(),
  /** Puissance de l'effet (dégâts, soin, statut) et rayon, selon le type. */
  power: nonNegative,
  radius: nonNegative,
});
export type DashDef = z.infer<typeof DashDef>;

export const CharacterDef = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  title: z.string(),
  description: z.string(),
  color: hex,
  element: Element,
  /** Arme de départ (id de weapons.json). */
  weapon: z.string(),
  passive: z.object({ name: z.string(), description: z.string(), stats: CharacterStats }),
  dash: DashDef,
  unlock: z.object({ kind: z.enum(UNLOCK_KINDS), value: nonNegative, hint: z.string() }),
});
export type CharacterDef = z.infer<typeof CharacterDef>;

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

export const PactDef = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  /** Chaleur : la somme détermine le rang de la run. */
  heat: z.number().int().positive(),
  malus: z.string(),
  bonus: z.string(),
  mods: z.partialRecord(z.enum([...RUN_MOD_MULT, ...RUN_MOD_ADD]), z.number()),
});
export type PactDef = z.infer<typeof PactDef>;

export const PactsDef = z.object({
  /** Pactes proposés au départ, et au plus combien d'entre eux. */
  offer: z.number().int().positive(),
  maxStart: z.number().int().positive(),
  /** Paliers (s) où un pacte de plus est proposé (au plus un parmi `milestoneOffer`). */
  milestones: z.array(positive),
  milestoneOffer: z.number().int().positive(),
  maxTotal: z.number().int().positive(),
  /** Rangs [lettre, chaleur minimale], croissants. */
  ranks: z.array(z.tuple([z.string(), nonNegative])).min(2),
  /** Multiplicateur de score par point de chaleur. */
  scorePerHeat: nonNegative,
  pacts: z.array(PactDef).min(1),
});
export type PactsDef = z.infer<typeof PactsDef>;

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

export const BossPattern = z.enum([
  'radial',
  'spiral',
  'summon',
  'charge',
  'mines',
  'rain',
  'wall',
  'laser',
  'fan',
  'blink',
  'hazard',
]);
export type BossPattern = z.infer<typeof BossPattern>;

export const BossDef = z.object({
  id: z.string(),
  name: z.string(),
  /** Mini-boss (5 et 10 min, lâche un coffre) ou boss final (victoire). */
  kind: z.enum(['mini', 'final']),
  biome: z.enum(BIOMES),
  /** Élément des flaques et de la pluie (teinte, givre qui ralentit). */
  element: Element.optional(),
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

export const STAGE_MECHANICS = z.enum([
  'none',
  'fog',
  'glassStorm',
  'water',
  'lavaFlow',
  'zeroG',
  'ice',
  'bog',
  'voidWell',
]);

export const StageDef = z.object({
  id: z.string(),
  name: z.string(),
  /** Ordre de la campagne (1 à 8) ; 0 pour le stage prototype. */
  order: z.number().int().nonnegative(),
  biome: z.enum(BIOMES),
  description: z.string(),
  duration: positive,
  bossAt: positive,
  boss: z.string(),
  /** Mini-boss (apparaît à chaque instant de `miniAt`, plus solide la deuxième fois). */
  miniBoss: z.string().optional(),
  miniAt: z.array(positive).default([]),
  /**
   * Mécanique propre au biome : brume (vision réduite par vagues), tempête de verre (éclats
   * télégraphiés), eaux lentes, coulées de lave, apesanteur (inertie), glace (glissade),
   * marais toxique, puits du vide (attraction). `every`/`length` : cycle des vagues ;
   * `count`/`radius`/`power` : réglages propres.
   */
  mechanic: z.object({
    kind: STAGE_MECHANICS,
    every: nonNegative,
    length: nonNegative,
    count: z.number().int().nonnegative(),
    radius: nonNegative,
    power: nonNegative,
    description: z.string(),
  }),
  /** Couleurs du décor : fond, grille, reflets. */
  palette: z.object({ base: hex, grid: hex, accent: hex }),
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

const RunModsPartial = z.partialRecord(z.enum([...RUN_MOD_MULT, ...RUN_MOD_ADD]), z.number());

/** Règles d'un défi hebdomadaire. */
export const WeeklyRulesetDef = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  description: z.string(),
  mods: RunModsPartial,
  /** Éléments permis pour les armes (vide : tous) ; l'arme de départ en fait partie. */
  elements: z.array(Element),
  /** PV max imposés (0 : libres). */
  fixedMaxHp: z.number().int().nonnegative(),
  /** Boss uniquement : le mini-boss et le boss du stage, puis `bossCount` boss finaux tirés. */
  bossOnly: z.boolean(),
  noRunEvents: z.boolean(),
});
export type WeeklyRulesetDef = z.infer<typeof WeeklyRulesetDef>;

export const ModesDef = z.object({
  modes: z
    .array(
      z.object({
        id: z.enum(MODE_IDS),
        name: z.string(),
        tagline: z.string(),
        description: z.string(),
        color: hex,
      }),
    )
    .length(MODE_IDS.length),
  endless: z.object({
    bossEvery: positive,
    bossHpStep: nonNegative,
    hpPerMin: nonNegative,
    damagePerMin: nonNegative,
    densityPerMin: nonNegative,
    densityCap: positive,
    /** Entrées du classement local. */
    leaderboard: z.number().int().positive(),
  }),
  daily: z.object({
    /** Pactes imposés, jours gardés dans l'historique. */
    pacts: z.number().int().nonnegative(),
    history: z.number().int().positive(),
  }),
  weekly: z.object({
    bossCount: z.number().int().positive(),
    bossRest: nonNegative,
    rulesets: z.array(WeeklyRulesetDef).min(4),
  }),
  bossRush: z.object({
    stage: z.string(),
    weapons: z.number().int().positive(),
    passives: z.number().int().nonnegative(),
    weaponLevel: z.number().int().positive(),
    passiveLevel: z.number().int().positive(),
    rest: nonNegative,
    heal: z.number().min(0).max(1),
    bossHp: positive,
  }),
  hardcore: z.object({
    /** Récompenses multipliées ; à la mort, part des ressources gagnées conservée. */
    rewardMult: positive,
    deathKeep: z.number().min(0).max(1),
  }),
  training: z.object({ stage: z.string() }),
});
export type ModesDef = z.infer<typeof ModesDef>;

/** Statistiques de méta : celles d'un personnage, plus résurrections et bonus de fin de run. */
export const MetaStats = z.partialRecord(
  z.enum([
    ...(Object.keys(PassiveStats.shape) as (keyof PassiveStats)[]),
    ...CHARACTER_EXTRAS,
    ...META_EXTRAS,
  ]),
  z.number(),
);
export type MetaStats = z.infer<typeof MetaStats>;
export type MetaStatKey = keyof MetaStats;

export const TalentNodeDef = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  branch: z.string(),
  name: z.string(),
  /** Palier (0 = racine) et colonne dans la branche. */
  tier: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
  /** Effet par rang. */
  stats: MetaStats,
  /** Coût (fragments) de chaque rang : sa longueur est le rang maximal. */
  cost: z.array(z.number().int().positive()).min(1),
  /** Au moins un rang dans l'un de ces nœuds (vide : racine). */
  requires: z.array(z.string()),
});
export type TalentNodeDef = z.infer<typeof TalentNodeDef>;

export const TalentsDef = z.object({
  branches: z.array(z.object({ id: z.string(), name: z.string() })).min(1),
  nodes: z.array(TalentNodeDef).min(60),
});
export type TalentsDef = z.infer<typeof TalentsDef>;

const StatKey = z.enum([
  ...(Object.keys(PassiveStats.shape) as (keyof PassiveStats)[]),
  ...CHARACTER_EXTRAS,
]);

export const MetaDef = z.object({
  account: z.object({
    /** XP de compte par point de score. */
    scoreXp: positive,
    /** XP du niveau L → L + 1 : base × L^exponent. */
    curve: z.object({ base: positive, exponent: positive }),
    maxLevel: z.number().int().positive(),
    /** XP d'un niveau Paragon (au-delà du niveau maximal). */
    paragonXp: positive,
    levelFragments: z.object({ base: nonNegative, perLevel: nonNegative }),
    unlocks: z.array(
      z.object({
        level: z.number().int().positive(),
        unlock: z.enum(ACCOUNT_UNLOCKS),
        name: z.string(),
      }),
    ),
  }),
  paragon: z.array(
    z.object({ stat: StatKey, name: z.string(), per: positive, cap: z.number().int().positive() }),
  ),
  ascension: z.object({
    rewardPerTier: nonNegative,
    tiers: z
      .array(
        z.object({
          tier: z.number().int().positive(),
          description: z.string(),
          mods: z.partialRecord(z.enum([...RUN_MOD_MULT, ...RUN_MOD_ADD]), z.number()),
        }),
      )
      .length(20),
  }),
  relics: z.object({
    slots: z.number().int().positive(),
    inventory: z.number().int().positive(),
    maxLevel: z.number().int().positive(),
    /** Bonus de toutes les valeurs par niveau au-delà du premier. */
    levelBonus: nonNegative,
    cacheCost: positive,
    upgradeCost: z.object({ base: positive, growth: positive }),
    rerollCost: positive,
    salvage: positive,
    bossDropChance: z.number().min(0).max(1),
    rarities: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          color: hex,
          weight: positive,
          secondaries: z.number().int().nonnegative(),
          mult: positive,
        }),
      )
      .min(2),
    pool: z.array(z.object({ stat: StatKey, min: positive, max: positive })).min(6),
    bases: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z0-9-]+$/),
          name: z.string(),
          /** Mini-boss qui la lâche à sa première défaite ('' : forge et butin). */
          boss: z.string(),
          signature: z.object({ stat: StatKey, value: positive }),
        }),
      )
      .min(8),
  }),
  mastery: z.object({
    xpPerDamage: positive,
    /** XP cumulée requise pour chaque rang (1 → 10). */
    ranks: z.array(positive).min(1),
    damagePerRank: nonNegative,
    skins: z.array(z.object({ rank: z.number().int().positive(), name: z.string(), color: hex })),
  }),
  codex: z.object({
    thresholds: z.array(z.number().min(0).max(1)).min(1),
    fragments: z.array(nonNegative).min(1),
    categories: z.array(z.object({ id: z.string(), name: z.string() })).min(1),
  }),
});
export type MetaDef = z.infer<typeof MetaDef>;

const QuestReward = z.object({ fragments: nonNegative, seasonXp: nonNegative });

export const QuestTemplateDef = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** Intitulé ; « {n} » est remplacé par l'objectif. */
  name: z.string(),
  metric: z.enum(QUEST_METRICS),
  /** Cumul sur les parties, ou meilleure valeur d'une seule partie. */
  kind: z.enum(['sum', 'max']),
  daily: positive,
  weekly: positive,
  element: Element.optional(),
});
export type QuestTemplateDef = z.infer<typeof QuestTemplateDef>;

export const RetentionDef = z.object({
  clock: z.object({ rollbackToleranceMs: nonNegative }),
  quests: z.object({
    daily: z.number().int().positive(),
    weekly: z.number().int().positive(),
    dailyRerolls: z.number().int().nonnegative(),
    rewards: z.object({ daily: QuestReward, weekly: QuestReward }),
    templates: z.array(QuestTemplateDef).min(8),
  }),
  streak: z.object({
    /** Récompense (fragments) de chaque jour du cycle de 7 jours. */
    rewards: z.array(nonNegative).length(7),
    /** Bonus par semaine complète de série, plafonné. */
    weekBonus: nonNegative,
    maxWeekBonus: z.number().int().nonnegative(),
  }),
  season: z.object({
    /** Premier jour de la saison 0 (AAAA-MM-JJ, heure locale). */
    epoch: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    days: z.number().int().positive(),
    tiers: z.number().int().positive(),
    xpPerTier: positive,
    scoreXp: nonNegative,
    themes: z
      .array(z.object({ id: z.string(), name: z.string(), color: hex, description: z.string() }))
      .min(1),
    rewards: z.object({
      fragmentsBase: nonNegative,
      fragmentsPerTier: nonNegative,
      milestoneEvery: z.number().int().positive(),
      milestoneFragments: nonNegative,
      relicEvery: z.number().int().positive(),
      /** Rareté minimale de la relique de chaque palier multiple de `relicEvery`. */
      relicRarity: z.record(z.string(), z.number().int().nonnegative()),
    }),
  }),
  chest: z.object({
    perHour: positive,
    levelBonus: nonNegative,
    capHours: positive,
    minClaim: nonNegative,
  }),
  notifications: z.object({ hour: z.number().int().min(0).max(23) }),
});
export type RetentionDef = z.infer<typeof RetentionDef>;

export const AchievementDef = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  description: z.string(),
  metric: z.enum(ACHIEVEMENT_METRICS),
  /** Cible de la mesure (stage, boss, pilote, réaction, catégorie du codex), '' sinon. */
  key: z.string(),
  value: positive,
  /** Fragments versés au déblocage. */
  reward: nonNegative,
});
export type AchievementDef = z.infer<typeof AchievementDef>;
