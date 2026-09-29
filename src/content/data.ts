/**
 * Données de jeu chargées depuis /config (typées ; validées par config/config.test.ts).
 * Index numériques pour la simulation (tableaux SoA) : type d'ennemi, élément, réaction.
 */
import { ELEMENTS, type ElementId } from '../../config/elements';
import type {
  BossDef,
  EnemyDef,
  PassiveDef,
  ReactionDef,
  StageDef,
  StatusDef,
  WeaponDef,
} from '../../config/schema';
import bossesJson from '../../config/bosses.json';
import enemiesJson from '../../config/enemies.json';
import passivesJson from '../../config/passives.json';
import playerJson from '../../config/player.json';
import progressionJson from '../../config/progression.json';
import reactionsJson from '../../config/reactions.json';
import resonanceJson from '../../config/resonance.json';
import statusJson from '../../config/status.json';
import protoStageJson from '../../config/stages/proto.json';
import weaponsJson from '../../config/weapons.json';

export type {
  BossDef,
  EnemyDef,
  PassiveDef,
  PlayerDef,
  ProgressionDef,
  ReactionDef,
  ResonanceDef,
  StageDef,
  StatusDef,
  WeaponDef,
  WeaponParams,
  WeaponStats,
} from '../../config/schema';
export { ELEMENTS, type ElementId };

export const PLAYER = playerJson;
export const WEAPONS = weaponsJson as WeaponDef[];
export const PASSIVES = passivesJson as PassiveDef[];
export const ENEMIES = enemiesJson as EnemyDef[];
export const REACTIONS = reactionsJson as ReactionDef[];
export const RESONANCE = resonanceJson;
export const STATUS: StatusDef = statusJson;
export const BOSSES = bossesJson as BossDef[];
export const PROGRESSION = progressionJson;
export const STAGES: Partial<Record<string, StageDef>> = { proto: protoStageJson as StageDef };

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
