/**
 * Données de jeu chargées depuis /config (typées ; validées par config/config.test.ts).
 * Index numériques pour la simulation (tableaux SoA) : type d'ennemi, élément, réaction.
 */
import { ELEMENTS, type ElementId } from '../../config/elements';
import {
  BEHAVIORS,
  DASH_KINDS,
  ENEMY_PARAMS,
  RUN_MOD_ADD,
  RUN_MOD_MULT,
  type BehaviorId,
  type DashKind,
  type EnemyParam,
  type RunModKey,
} from '../../config/keys';
import type {
  AffixDef,
  BossDef,
  CharacterDef,
  EnemyDef,
  ModesDef,
  PactsDef,
  PassiveDef,
  ReactionDef,
  RunEventsDef,
  StageDef,
  StatusDef,
  WeaponDef,
} from '../../config/schema';
import affixesJson from '../../config/affixes.json';
import bossesJson from '../../config/bosses.json';
import charactersJson from '../../config/characters.json';
import enemiesJson from '../../config/enemies.json';
import modesJson from '../../config/modes.json';
import pactsJson from '../../config/pacts.json';
import passivesJson from '../../config/passives.json';
import playerJson from '../../config/player.json';
import progressionJson from '../../config/progression.json';
import reactionsJson from '../../config/reactions.json';
import resonanceJson from '../../config/resonance.json';
import runEventsJson from '../../config/runevents.json';
import statusJson from '../../config/status.json';
import protoStageJson from '../../config/stages/proto.json';
import forestStageJson from '../../config/stages/forest.json';
import desertStageJson from '../../config/stages/desert.json';
import sunkenStageJson from '../../config/stages/sunken.json';
import volcanoStageJson from '../../config/stages/volcano.json';
import stationStageJson from '../../config/stages/station.json';
import tundraStageJson from '../../config/stages/tundra.json';
import swampStageJson from '../../config/stages/swamp.json';
import cathedralStageJson from '../../config/stages/cathedral.json';

import weaponsJson from '../../config/weapons.json';

export type {
  AffixDef,
  BossDef,
  CharacterDef,
  CharacterStats,
  DashDef,
  PactDef,
  EnemyDef,
  PassiveDef,
  PlayerDef,
  ProgressionDef,
  ReactionDef,
  ResonanceDef,
  RunEventsDef,
  StageDef,
  StatusDef,
  WeaponDef,
  WeaponParams,
  WeaponStats,
} from '../../config/schema';
export {
  BEHAVIORS,
  DASH_KINDS,
  ELEMENTS,
  ENEMY_PARAMS,
  RUN_MOD_ADD,
  RUN_MOD_MULT,
  type BehaviorId,
  type DashKind,
  type ElementId,
  type EnemyParam,
  type RunModKey,
};

export const PLAYER = playerJson;
export const WEAPONS = weaponsJson as WeaponDef[];
export const PASSIVES = passivesJson as PassiveDef[];
export const ENEMIES = enemiesJson as EnemyDef[];
export const REACTIONS = reactionsJson as ReactionDef[];
export const RESONANCE = resonanceJson;
export const STATUS: StatusDef = statusJson;
export const BOSSES = bossesJson as BossDef[];
export const PROGRESSION = progressionJson;
/** Stages de la campagne, dans l'ordre (le prototype sert aux tests et au banc de charge). */
/** JSON des stages : validés par config.test.ts (tuples non inférés par TypeScript). */
const stage = (json: unknown): StageDef => json as StageDef;

export const CAMPAIGN: StageDef[] = [
  stage(forestStageJson),
  stage(desertStageJson),
  stage(sunkenStageJson),
  stage(volcanoStageJson),
  stage(stationStageJson),
  stage(tundraStageJson),
  stage(swampStageJson),
  stage(cathedralStageJson),
];
export const STAGES: Partial<Record<string, StageDef>> = Object.fromEntries([
  ['proto', stage(protoStageJson)],
  ...CAMPAIGN.map((s) => [s.id, s] as const),
]);
// Paramètres hétérogènes selon l'affixe : le JSON est validé par config.test.ts.
export const CHARACTERS = charactersJson as CharacterDef[];
export const PACTS = pactsJson as PactsDef;

export function characterIndex(id: string): number {
  const i = CHARACTERS.findIndex((c) => c.id === id);
  if (i < 0) throw new Error(`Personnage inconnu : ${id}`);
  return i;
}

export const AFFIXES = affixesJson as unknown as AffixDef[];
export const RUN_EVENTS = runEventsJson as RunEventsDef;

/** Paramètres d'ennemis en colonnes (index = type d'ennemi, 0 si absent). */
export const ENEMY_PARAM = Object.fromEntries(
  ENEMY_PARAMS.map((k) => [k, Float32Array.from(ENEMIES.map((e) => e.params[k] ?? 0))]),
) as Record<EnemyParam, Float32Array>;

/** Comportement de chaque type d'ennemi (index dans BEHAVIORS). */
export const BEHAVIOR_OF = Uint8Array.from(ENEMIES.map((e) => BEHAVIORS.indexOf(e.behavior)));

/** Élément de chaque type d'ennemi (index dans ELEMENTS, 255 si aucun). */
export const ENEMY_ELEMENT = Uint8Array.from(
  ENEMIES.map((e) => (e.element ? ELEMENTS.indexOf(e.element) : 255)),
);

/** Créature invoquée ou libérée par chaque type (index d'ennemi, -1 si aucune). */
export const ENEMY_MINION = Int32Array.from(
  ENEMIES.map((e) => (e.minion ? ENEMIES.findIndex((m) => m.id === e.minion) : -1)),
);

export function affixIndex(id: string): number {
  const i = AFFIXES.findIndex((a) => a.id === id);
  if (i < 0) throw new Error(`Affixe inconnu : ${id}`);
  return i;
}

/** Élément « aucun » (dégâts de réaction, contact…) : n'applique pas de marque. */
export const NO_ELEMENT = 255;

export function elementIndex(id: ElementId): number {
  return ELEMENTS.indexOf(id);
}

export function weaponIndex(id: string): number {
  const i = WEAPONS.findIndex((w) => w.id === id);
  if (i < 0) throw new Error(`Arme inconnue : ${id}`);
  return i;
}

export function passiveIndex(id: string): number {
  const i = PASSIVES.findIndex((p) => p.id === id);
  if (i < 0) throw new Error(`Passif inconnu : ${id}`);
  return i;
}

/** Passif requis par l'évolution de chaque arme (index dans PASSIVES). */
export const EVOLUTION_PASSIVE = Int32Array.from(
  WEAPONS.map((w) => passiveIndex(w.evolution.passive)),
);

export function reactionIndex(id: string): number {
  const i = REACTIONS.findIndex((r) => r.id === id);
  if (i < 0) throw new Error(`Réaction inconnue : ${id}`);
  return i;
}

export function enemyIndex(id: string): number {
  const i = ENEMIES.findIndex((e) => e.id === id);
  if (i < 0) throw new Error(`Ennemi inconnu : ${id}`);
  return i;
}

export function bossIndex(id: string): number {
  const i = BOSSES.findIndex((b) => b.id === id);
  if (i < 0) throw new Error(`Boss inconnu : ${id}`);
  return i;
}

/** Réaction déclenchée par une paire d'éléments : REACTION_BY_PAIR[a * 6 + b] (symétrique). */
export const REACTION_BY_PAIR = new Int8Array(ELEMENTS.length * ELEMENTS.length).fill(-1);
REACTIONS.forEach((r, i) => {
  const a = elementIndex(r.elements[0]);
  const b = elementIndex(r.elements[1]);
  REACTION_BY_PAIR[a * ELEMENTS.length + b] = i;
  REACTION_BY_PAIR[b * ELEMENTS.length + a] = i;
});

export function reactionFor(a: number, b: number): number {
  return REACTION_BY_PAIR[a * ELEMENTS.length + b];
}

/** Couleur #rrggbb → entier 0xrrggbb. */
export function colorOf(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/** Modes de jeu : textes, réglages de l'infini, des défis, du Boss Rush, du hardcore. */
export const MODES = modesJson as ModesDef;
export type { ModeId } from '../../config/keys';
export type { ModesDef, WeeklyRulesetDef } from '../../config/schema';
