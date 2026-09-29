/**
 * Monde ECS : bitecs sert de registre (entités, composants SoA, requêtes structurelles).
 * En jeu, aucune entité n'est créée ni détruite : chaque archétype dispose d'un pool
 * pré-alloué (voir pool.ts). Mesure à l'origine de ce choix : bitecs 0.4 alloue un Set par
 * entité créée et des closures à chaque addComponent, incompatible avec « zéro allocation
 * dans la boucle chaude ».
 */
import { addComponent, addEntity, createWorld, query, type World } from 'bitecs';
import {
  Body,
  BossTag,
  Chest,
  ChestTag,
  Bullet,
  BulletTag,
  EnemyTag,
  Foe,
  Gem,
  GemTag,
  Life,
  Look,
  makeReset,
  Orbit,
  OrbitTag,
  PlayerTag,
  Pos,
  Shot,
  ShotTag,
  Status,
  Vel,
  Zone,
  ZoneTag,
} from './components';
import { MAX_ENTITIES } from './constants';
import { EntityPool } from './pool';

export const POOL_SIZES = {
  player: 1,
  boss: 2,
  enemies: 1400,
  shots: 2200,
  bullets: 600,
  orbits: 32,
  gems: 900,
  zones: 512,
  chests: 8,
};

export type PoolSizes = typeof POOL_SIZES;

export interface GameWorld {
  ecs: World;
  player: EntityPool;
  boss: EntityPool;
  enemies: EntityPool;
  shots: EntityPool;
  bullets: EntityPool;
  orbits: EntityPool;
  gems: EntityPool;
  zones: EntityPool;
  chests: EntityPool;
}

export function createGameWorld(sizes: PoolSizes = POOL_SIZES): GameWorld {
  const ecs = createWorld();
  const archetype =
    (...components: object[]) =>
    (): number => {
      const eid = addEntity(ecs);
      for (const c of components) addComponent(ecs, eid, c);
      return eid;
    };
  const pool = (name: keyof PoolSizes): EntityPool => {
    const components = ARCHETYPES[name];
    return new EntityPool(
      name,
      sizes[name],
      MAX_ENTITIES,
      archetype(...components),
      makeReset(components),
    );
  };

  return {
    ecs,
    player: pool('player'),
    boss: pool('boss'),
    enemies: pool('enemies'),
    shots: pool('shots'),
    bullets: pool('bullets'),
    orbits: pool('orbits'),
    gems: pool('gems'),
    zones: pool('zones'),
    chests: pool('chests'),
  };
}

/**
 * Composants de chaque archétype. Seules leurs colonnes sont remises à zéro à l'activation :
 * aucun système ne doit écrire une colonne hors de l'archétype de l'entité (vérifié en test).
 */
export const ARCHETYPES: Record<keyof PoolSizes, readonly object[]> = {
  player: [PlayerTag, Pos, Vel, Body, Life, Look],
  boss: [BossTag, Pos, Vel, Body, Life, Look, Foe, Status],
  enemies: [EnemyTag, Pos, Vel, Body, Life, Look, Foe, Status],
  shots: [ShotTag, Pos, Vel, Look, Shot],
  bullets: [BulletTag, Pos, Vel, Look, Bullet],
  orbits: [OrbitTag, Pos, Look, Orbit],
  gems: [GemTag, Pos, Vel, Look, Gem],
  zones: [ZoneTag, Pos, Look, Zone],
  chests: [ChestTag, Pos, Look, Chest],
};

/** Nombre d'entités d'un archétype enregistrées dans le monde (outillage, debug). */
export function countArchetype(world: GameWorld, tag: object): number {
  return query(world.ecs, [tag]).length;
}
