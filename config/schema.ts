/**
 * Schémas des données de jeu (/config/*.json). Validés en test (config.test.ts) ; le jeu
 * n'importe que les types (import type), zod n'est jamais embarqué dans le bundle.
 */
import { z } from 'zod';
import { ELEMENTS } from './elements';

export { ELEMENTS };
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

/** Statistiques d'une arme ; chaque niveau ajoute des deltas à ces valeurs. */
export const WeaponStats = z.object({
  damage: nonNegative,
  cooldown: nonNegative,
  count: z.number().int().nonnegative(),
  pierce: z.number().int().nonnegative(),
  speed: nonNegative,
  size: positive,
  range: nonNegative,
  duration: nonNegative,
  /** Intensité du statut élémentaire (brûlure dps, froid par coup, durée d'électrisation). */
  status: nonNegative,
});
export type WeaponStats = z.infer<typeof WeaponStats>;

export const WeaponDef = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  description: z.string(),
  element: Element,
  archetype: z.enum(['projectile', 'orbit', 'chain']),
  color: hex,
  base: WeaponStats,
  /** Deltas des niveaux 2 à N (index 0 = niveau 2) ; valeurs négatives permises (recharge). */
  levels: z
    .array(
      z.object({
        damage: z.number().optional(),
        cooldown: z.number().optional(),
        count: z.number().int().optional(),
        pierce: z.number().int().optional(),
        speed: z.number().optional(),
        size: z.number().optional(),
        range: z.number().optional(),
        duration: z.number().optional(),
        status: z.number().optional(),
      }),
    )
    .min(1),
});
export type WeaponDef = z.infer<typeof WeaponDef>;

export const PassiveDef = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  description: z.string(),
  maxLevel: z.number().int().positive(),
  /** Bonus par niveau, en proportion (0.1 = +10 %) ou en valeur absolue selon la statistique. */
  perLevel: z.object({
    maxHp: nonNegative.optional(),
    speed: nonNegative.optional(),
    pickupRadius: nonNegative.optional(),
    cooldown: nonNegative.optional(),
    damage: nonNegative.optional(),
    area: nonNegative.optional(),
  }),
});
export type PassiveDef = z.infer<typeof PassiveDef>;

export const Behavior = z.enum(['swarm', 'tank', 'shooter', 'kamikaze', 'teleporter']);
export type Behavior = z.infer<typeof Behavior>;

export const EnemyDef = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  behavior: Behavior,
  hp: positive,
  speed: positive,
  damage: nonNegative,
  radius: positive,
  xp: positive,
  mass: positive,
  knockbackRes: z.number().min(0).max(1),
  color: hex,
  /** Paramètres propres au comportement. */
  params: z.record(z.string(), z.number()).default({}),
});
export type EnemyDef = z.infer<typeof EnemyDef>;

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
  implemented: z.boolean(),
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
  }),
});
export type ResonanceDef = z.infer<typeof ResonanceDef>;

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
  events: z.array(
    z.object({
      at: nonNegative,
      kind: z.enum(['ring', 'line', 'swarm']),
      enemy: z.string(),
      count: z.number().int().positive(),
    }),
  ),
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
});
export type ProgressionDef = z.infer<typeof ProgressionDef>;
