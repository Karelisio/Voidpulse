/**
 * Simulation d'une run : état, systèmes exécutés dans un ordre fixe à 60 Hz, API de commande
 * (choix de level-up, debug). Aucune dépendance au DOM, à Pixi ou à l'audio : tourne telle
 * quelle dans Node (tests, simulateur d'équilibrage).
 */
import { ENEMIES, PROGRESSION, STAGES, WEAPONS } from '../content/data';
import { resetEntity, Pos } from '../engine/components';
import { DT } from '../engine/constants';
import { EventQueue } from '../engine/events';
import type { EntityPool } from '../engine/pool';
import { Rng } from '../engine/rng';
import { SpatialGrid } from '../engine/spatial';
import { createGameWorld, type GameWorld } from '../engine/world';
import { createBossState, spawnBoss, updateBoss } from './boss';
import { processDeaths, updateBullets, updateShots, updateStatuses } from './combat';
import { planStage, updateDirector, type StagePlan } from './director';
import { separateEnemies, spawnEnemy, updateEnemies } from './enemies';
import { updatePickups } from './pickups';
import { spawnPlayer, updatePlayer } from './player';
import {
  applyChoice,
  banish,
  computeStats,
  gainLevel,
  lock,
  reroll,
  xpToNext,
} from './progression';
import { createResonance, startEveil, updateResonance } from './resonance';
import type { RunState, SimInput } from './state';
import { addWeapon, updateWeapons } from './weapons';
import { updateZones } from './zones';

export interface RunOptions {
  seed: string;
  stage?: string;
  weapon?: string;
  /** Demi-dimensions du champ visible (unités monde), fixées pour la run. Portrait par défaut. */
  view?: { halfW: number; halfH: number };
}

export class RunSim {
  readonly world: GameWorld = createGameWorld();
  readonly events = new EventQueue(16384);
  /** Grille des ennemis : 44 × 44 cellules de 64 unités autour du joueur. */
  readonly grid = new SpatialGrid(64, 44, 44, this.world.enemies.capacity);
  readonly scratch = new Int32Array(this.world.enemies.capacity);
  readonly aoeBuffers = [0, 1, 2, 3].map(() => new Int32Array(this.world.enemies.capacity));
  aoeDepth = 0;
  readonly chainList = new Int32Array(16);
  readonly bossList = new Int32Array(1);
  /** Point de sortie de spawnPoint (réutilisé : aucune allocation). */
  readonly point = { x: 0, y: 0 };
  readonly rng: { spawn: Rng; combat: Rng; ai: Rng; loot: Rng; levelup: Rng };
  readonly plan: StagePlan;
  readonly state: RunState;
  readonly input: SimInput = { moveX: 0, moveY: 0, dash: false, aim: 'auto' };
  readonly view: { halfW: number; halfH: number };

  constructor(opts: RunOptions) {
    this.view = opts.view ?? { halfW: 230, halfH: 490 };
    const root = new Rng(opts.seed);
    this.rng = {
      spawn: root.fork('spawn'),
      combat: root.fork('combat'),
      ai: root.fork('ai'),
      loot: root.fork('loot'),
      levelup: root.fork('levelup'),
    };
    const stage = STAGES[opts.stage ?? 'proto'];
    if (!stage) throw new Error(`Stage inconnu : ${opts.stage ?? ''}`);
    this.plan = planStage(stage);
    this.state = {
      tick: 0,
      time: 0,
      status: 'running',
      stage,
      player: {
        eid: -1,
        hp: 0,
        level: 1,
        xp: 0,
        xpNext: xpToNext(1),
        pendingLevels: 0,
        iFrames: 0,
        dashT: 0,
        dashCd: 0,
        dashX: 1,
        dashY: 0,
        faceX: 0,
        faceY: -1,
        stats: { maxHp: 0, speed: 0, pickupRadius: 0, cooldownMult: 1, damageMult: 1, areaMult: 1 },
      },
      weapons: [],
      passives: [],
      resonance: createResonance(),
      director: { eventIndex: 0, bossSpawned: false, densityMult: 1 },
      boss: createBossState(),
      levelUp: {
        choices: [],
        rerolls: PROGRESSION.rerolls,
        banishes: PROGRESSION.banishes,
        locks: PROGRESSION.locks,
        locked: null,
        banished: new Set(),
      },
      stats: {
        kills: 0,
        killsByType: new Int32Array(ENEMIES.length),
        damageBySlot: new Float64Array(8),
        damageTaken: 0,
        xpCollected: 0,
        peakEnemies: 0,
        bossKilled: false,
      },
      debug: { invincible: false },
    };
    const p = this.state.player;
    p.eid = spawnPlayer(this);
    p.stats = computeStats(this);
    p.hp = p.stats.maxHp;
    const weapon = WEAPONS.findIndex((w) => w.id === (opts.weapon ?? 'ember'));
    addWeapon(this, weapon < 0 ? 0 : weapon);
  }

  /** Active une entité d'un pool, colonnes remises à zéro ; -1 si le pool est plein. */
  spawnIn(pool: EntityPool): number {
    const eid = pool.spawn();
    if (eid >= 0) resetEntity(eid);
    return eid;
  }

  /**
   * Point d'apparition (dans `point`) juste hors du champ visible : on prolonge une direction
   * jusqu'au bord du rectangle de vue, plus une marge dans [minMargin, maxMargin]. La
   * direction est biaisée vers le déplacement du joueur une fois sur deux.
   */
  spawnPoint(minMargin: number, maxMargin: number): void {
    const p = this.state.player;
    const rng = this.rng.spawn;
    let a = rng.range(0, Math.PI * 2);
    if ((this.input.moveX !== 0 || this.input.moveY !== 0) && rng.chance(0.5)) {
      a = Math.atan2(p.faceY, p.faceX) + rng.range(-0.9, 0.9);
    }
    const c = Math.cos(a);
    const s = Math.sin(a);
    const edge = Math.min(
      this.view.halfW / Math.max(1e-6, Math.abs(c)),
      this.view.halfH / Math.max(1e-6, Math.abs(s)),
    );
    const r = edge + rng.range(minMargin, maxMargin);
    this.point.x = Pos.x[p.eid] + c * r;
    this.point.y = Pos.y[p.eid] + s * r;
  }

  step(): void {
    const st = this.state;
    if (st.status !== 'running') return;
    st.tick++;
    st.time += DT;
    this.storePrevious();
    updatePlayer(this);
    updateDirector(this);
    updateEnemies(this);
    updateBoss(this);
    this.rebuildGrid();
    separateEnemies(this);
    updateWeapons(this);
    updateShots(this);
    updateBullets(this);
    updateZones(this);
    updateStatuses(this);
    updateResonance(this);
    processDeaths(this);
    updatePickups(this);
  }

  private readonly allPools: readonly EntityPool[] = [
    this.world.player,
    this.world.boss,
    this.world.enemies,
    this.world.shots,
    this.world.bullets,
    this.world.orbits,
    this.world.gems,
    this.world.zones,
  ];

  private storePrevious(): void {
    const pools = this.allPools;
    for (let p = 0; p < pools.length; p++) {
      const pool = pools[p];
      for (let i = 0; i < pool.count; i++) {
        const e = pool.active[i];
        Pos.px[e] = Pos.x[e];
        Pos.py[e] = Pos.y[e];
      }
    }
  }

  private rebuildGrid(): void {
    const p = this.state.player.eid;
    this.grid.rebuild(
      Pos.x[p],
      Pos.y[p],
      this.world.enemies.active,
      this.world.enemies.count,
      Pos.x,
      Pos.y,
    );
  }

  // --- Commandes (UI) ---------------------------------------------------------------------

  choose(i: number): void {
    applyChoice(this, i);
  }

  reroll(): boolean {
    return reroll(this);
  }

  banish(i: number): boolean {
    return banish(this, i);
  }

  lock(i: number): boolean {
    return lock(this, i);
  }

  // --- Debug ------------------------------------------------------------------------------

  debugSpawn(type: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.spawnPoint(20, 300);
      spawnEnemy(this, type % ENEMIES.length, this.point.x, this.point.y, 1);
    }
  }

  debugLevelUp(): void {
    this.state.player.xp = 0;
    gainLevel(this);
  }

  debugBoss(): void {
    if (this.state.boss.eid >= 0) return;
    this.state.director.bossSpawned = true;
    spawnBoss(this, this.plan.boss);
  }

  debugEveil(): void {
    startEveil(this);
  }
}
