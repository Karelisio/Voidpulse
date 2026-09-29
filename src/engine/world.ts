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
  zones: 256,
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
  const pool = (name: keyof PoolSizes, ...components: object[]): EntityPool =>
    new EntityPool(name, sizes[name], MAX_ENTITIES, archetype(...components));

  return {
    ecs,
    player: pool('player', PlayerTag, Pos, Vel, Body, Life, Look),
    boss: pool('boss', BossTag, Pos, Vel, Body, Life, Look, Foe, Status),
    enemies: pool('enemies', EnemyTag, Pos, Vel, Body, Life, Look, Foe, Status),
    shots: pool('shots', ShotTag, Pos, Vel, Look, Shot),
    bullets: pool('bullets', BulletTag, Pos, Vel, Look, Bullet),
    orbits: pool('orbits', OrbitTag, Pos, Look, Orbit),
    gems: pool('gems', GemTag, Pos, Vel, Look, Gem),
    zones: pool('zones', ZoneTag, Pos, Look, Zone),
    chests: pool('chests', ChestTag, Pos, Look, Chest),
  };
}

/** Nombre d'entités d'un archétype enregistrées dans le monde (outillage, debug). */
export function countArchetype(world: GameWorld, tag: object): number {
  return query(world.ecs, [tag]).length;
}
