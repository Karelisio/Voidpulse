import { describe, expect, it } from 'vitest';
import { EnemyTag, Pos, ShotTag } from './components';
import { DT, MAX_ENTITIES } from './constants';
import { EventQueue } from './events';
import { FixedLoop, type LoopClock } from './loop';
import { EntityPool } from './pool';
import { Rng } from './rng';
import { SpatialGrid } from './spatial';
import { countArchetype, createGameWorld } from './world';

describe('EntityPool', () => {
  it('active et désactive sans perdre d’entités, dans un ordre déterministe', () => {
    let next = 10;
    const pool = new EntityPool('t', 4, 64, () => next++);
    const a = pool.spawn();
    const b = pool.spawn();
    const c = pool.spawn();
    expect([a, b, c]).toEqual([10, 11, 12]);
    pool.despawn(b);
    expect(pool.count).toBe(2);
    expect(pool.isActive(b)).toBe(false);
    expect(Array.from(pool.active.subarray(0, pool.count)).sort()).toEqual([10, 12]);
    expect(pool.spawn()).toBe(11); // réutilisation de la dernière libérée
    expect(pool.spawn()).toBe(13);
    expect(pool.spawn()).toBe(-1); // plein
    expect(pool.full).toBe(true);
    pool.clear();
    expect(pool.count).toBe(0);
  });

  it('supporte la désactivation pendant un parcours à rebours', () => {
    let next = 0;
    const pool = new EntityPool('t', 100, 128, () => next++);
    for (let i = 0; i < 100; i++) pool.spawn();
    for (let i = pool.count - 1; i >= 0; i--) {
      const eid = pool.active[i];
      if (eid % 3 === 0) pool.despawn(eid);
    }
    expect(pool.count).toBe(66);
    for (let i = 0; i < pool.count; i++) expect(pool.active[i] % 3).not.toBe(0);
  });
});

describe('SpatialGrid', () => {
  it('renvoie tous les voisins réels (comparaison exhaustive)', () => {
    const rng = new Rng('grid');
    const n = 600;
    const xs = new Float32Array(n);
    const ys = new Float32Array(n);
    const list = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      list[i] = i;
      xs[i] = rng.range(-1400, 1400);
      ys[i] = rng.range(-1400, 1400);
    }
    const grid = new SpatialGrid(64, 40, 40, 2048);
    grid.rebuild(0, 0, list, n, xs, ys);
    const out = new Int32Array(2048);
    for (let q = 0; q < 200; q++) {
      const x = rng.range(-1500, 1500);
      const y = rng.range(-1500, 1500);
      const r = rng.range(10, 150);
      const count = grid.query(x, y, r, out);
      const found = new Set(Array.from(out.subarray(0, count)));
      for (let i = 0; i < n; i++) {
        if (Math.hypot(xs[i] - x, ys[i] - y) <= r) expect(found.has(i)).toBe(true);
      }
    }
  });
});

describe('EventQueue', () => {
  it('abandonne d’abord les événements cosmétiques', () => {
    const q = new EventQueue(8);
    for (let i = 0; i < 6; i++) expect(q.push(1, i, 0, 0, 0, 0, 0, true)).toBe(true);
    expect(q.push(1, 99, 0, 0, 0, 0, 0, true)).toBe(false); // au-delà de 75 %
    expect(q.push(2, 7, 0, 0, 0, 0)).toBe(true); // gameplay accepté
    expect(q.push(2, 8, 0, 0, 0, 0)).toBe(true);
    expect(q.push(2, 9, 0, 0, 0, 0)).toBe(false); // plein
    expect(q.count).toBe(8);
    expect(q.dropped).toBe(2);
    q.clear();
    expect(q.count).toBe(0);
  });
});

function fakeClock(): LoopClock & { t: number } {
  const clock = { t: 0, now: () => clock.t, request: () => 1, cancel: () => undefined };
  return clock;
}

describe('FixedLoop', () => {
  it('exécute des ticks fixes indépendants du rythme d’affichage', () => {
    let steps = 0;
    let lastAlpha = -1;
    const loop = new FixedLoop(
      {
        step: () => steps++,
        render: (alpha) => {
          lastAlpha = alpha;
        },
      },
      fakeClock(),
    );
    loop.frame(0);
    // 1 s à 144 Hz : ~60 ticks
    for (let i = 1; i <= 144; i++) loop.frame((i * 1000) / 144);
    expect(steps).toBeGreaterThanOrEqual(59);
    expect(steps).toBeLessThanOrEqual(61);
    expect(lastAlpha).toBeGreaterThanOrEqual(0);
    expect(lastAlpha).toBeLessThan(1);
  });

  it('applique hit stop, accélération, pause et plafond anti-spirale', () => {
    let steps = 0;
    const loop = new FixedLoop({ step: () => steps++, render: () => undefined }, fakeClock());
    loop.frame(0);
    loop.hitStopFor(3);
    for (let i = 1; i <= 10; i++) loop.frame(i * DT * 1000);
    expect(steps).toBe(7);

    steps = 0;
    loop.timeScale = 5;
    for (let i = 11; i <= 20; i++) loop.frame(i * DT * 1000);
    expect(steps).toBeGreaterThanOrEqual(49);

    steps = 0;
    loop.timeScale = 1;
    loop.paused = true;
    for (let i = 21; i <= 30; i++) loop.frame(i * DT * 1000);
    expect(steps).toBe(0);

    loop.paused = false;
    loop.frame(30 * DT * 1000 + 5000); // grosse pause d'onglet
    expect(loop.stats.steps).toBeLessThanOrEqual(4);
  });

  it('plafonne à 30 images par seconde sans perdre de ticks', () => {
    let steps = 0;
    let renders = 0;
    const loop = new FixedLoop(
      {
        step: () => steps++,
        render: () => {
          renders++;
        },
      },
      fakeClock(),
    );
    loop.fpsCap = 30;
    for (let i = 0; i <= 60; i++) loop.frame((i * 1000) / 60);
    expect(renders).toBeGreaterThanOrEqual(29);
    expect(renders).toBeLessThanOrEqual(32);
    expect(steps).toBeGreaterThanOrEqual(58);
  });
});

describe('GameWorld', () => {
  it('pré-crée les pools dans les bornes des tableaux de composants', () => {
    const world = createGameWorld();
    expect(countArchetype(world, EnemyTag)).toBe(world.enemies.capacity);
    expect(countArchetype(world, ShotTag)).toBe(world.shots.capacity);
    const eid = world.enemies.spawn();
    expect(eid).toBeGreaterThanOrEqual(0);
    expect(eid).toBeLessThan(MAX_ENTITIES);
    Pos.x[eid] = 12;
    expect(Pos.x[eid]).toBe(12);
  });
});
