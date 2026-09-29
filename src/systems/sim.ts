/**
 * Simulation d'une run : état, systèmes exécutés dans un ordre fixe à 60 Hz, API de commande
 * (choix de level-up, debug). Aucune dépendance au DOM, à Pixi ou à l'audio : tourne telle
 * quelle dans Node (tests, simulateur d'équilibrage).
 */
import {
  CHARACTERS,
  DASH_KINDS,
  ENEMIES,
  EVOLUTION_PASSIVE,
  PACTS,
  PASSIVES,
  PROGRESSION,
  STAGES,
  WEAPONS,
  CAMPAIGN,
  bossIndex,
  colorOf,
} from '../content/data';
import { Foe, Life, Pos } from '../engine/components';
import { DT } from '../engine/constants';
import { EventQueue } from '../engine/events';
import type { EntityPool } from '../engine/pool';
import { Rng } from '../engine/rng';
import { SpatialGrid } from '../engine/spatial';
import { createGameWorld, type GameWorld } from '../engine/world';
import { createBossState, spawnBoss, updateBoss } from './boss';
import { updateBullets, updateShots, updateStatuses } from './combat';
import { processDeaths } from './deaths';
import { planStage, spawnElite, updateDirector, type StagePlan } from './director';
import { separateEnemies, spawnEnemy, updateEnemies } from './enemies';
import { dropChest, updatePickups } from './pickups';
import { spawnPlayer, updatePlayer } from './player';
import {
  applyChoice,
  banish,
  baseStats,
  computeStats,
  gainLevel,
  lock,
  refreshStats,
  reroll,
  xpToNext,
} from './progression';
import { closeChest } from './loot';
import { createResonance, startEveil, updateResonance } from './resonance';
import {
  buy,
  closeAltar,
  closeMerchant,
  createRunEvents,
  sacrifice,
  startRunEvent,
} from './runevents';
import { createMechanic, updateStageMechanic } from './stagefx';
import { createPacts, imposePacts, offerPacts, sealPacts } from './pacts';
import type {
  AltarOfferKind,
  MetaRunBonus,
  RunEventKind,
  RunRules,
  RunState,
  SimInput,
} from './state';
import { addWeapon, levelUpWeapon, maxWeaponLevel, updateWeapons } from './weapons';
import { createTimeline, updateTimeline } from './timeline';
import { updateZones } from './zones';

export interface RunOptions {
  seed: string;
  stage?: string;
  /** Personnage (id de characters.json), Vex par défaut. */
  character?: string;
  /** Arme de départ imposée (sinon celle du personnage). */
  weapon?: string;
  /** Pactes imposés (défis) ; `pactChoice` : offre de pactes au départ et aux paliers. */
  pacts?: readonly string[];
  pactChoice?: boolean;
  /** Demi-dimensions du champ visible (unités monde), fixées pour la run. Portrait par défaut. */
  view?: { halfW: number; halfH: number };
  /** Règles posées par le mode de jeu (valeurs neutres par défaut). */
  rules?: Partial<RunRules>;
  /** Bonus permanents (talents, Paragon, reliques, maîtrise). */
  meta?: MetaRunBonus;
}

export function neutralMeta(): MetaRunBonus {
  return {
    stats: {},
    revives: 0,
    weaponDamage: WEAPONS.map(() => 1),
    weaponTint: WEAPONS.map(() => 0),
  };
}

export function defaultRules(): RunRules {
  return {
    mods: {},
    endless: null,
    bossQueue: [],
    bossRest: 4,
    bossHp: 1,
    healOnBoss: 0,
    sandbox: false,
    noRunEvents: false,
    elements: [],
    fixedMaxHp: 0,
    loadout: { weapons: [], passives: [] },
  };
}

export class RunSim {
  readonly world: GameWorld = createGameWorld();
  readonly events = new EventQueue(16384);
  /** Grille des ennemis : 44 × 44 cellules de 64 unités autour du joueur. */
  readonly grid = new SpatialGrid(64, 44, 44, this.world.enemies.capacity);
  readonly scratch = new Int32Array(this.world.enemies.capacity);
  /** Tampons de requête empilables (coup → réaction → zone → coup…), voir combat.takeBuffer. */
  readonly aoeBuffers = [0, 1, 2, 3, 4, 5].map(() => new Int32Array(this.world.enemies.capacity));
  aoeDepth = 0;
  /** Tampons dédiés : têtes chercheuses, zones (mines, rayons, orbes). */
  readonly homingScratch = new Int32Array(this.world.enemies.capacity);
  readonly zoneScratch = new Int32Array(this.world.enemies.capacity);
  readonly chainList = new Int32Array(64);
  /** Listes d'exclusion des réactions en chaîne (prisme, chaîne toxique). */
  readonly reactList = new Int32Array(32);
  readonly bossList = new Int32Array(1);
  /** Ennemis visibles (hors fouisseurs enfouis) : contenu de la grille. */
  private readonly gridList = new Int32Array(this.world.enemies.capacity);
  /** Point de sortie de spawnPoint (réutilisé : aucune allocation). */
  readonly point = { x: 0, y: 0 };
  readonly rng: { spawn: Rng; combat: Rng; ai: Rng; loot: Rng; levelup: Rng; pact: Rng };
  readonly plan: StagePlan;
  /** Boss finaux des autres stages de la campagne (partie sans fin), dans l'ordre. */
  readonly endlessFinals: readonly number[];
  readonly state: RunState;
  /** Teinte des tirs par arme (apparences de maîtrise comprises), arme à apparence choisie. */
  readonly weaponTint: Uint32Array;
  readonly skinned: Uint8Array;
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
      pact: root.fork('pact'),
    };
    const character = CHARACTERS.find((c) => c.id === (opts.character ?? 'vex'));
    if (!character) throw new Error(`Personnage inconnu : ${opts.character ?? ''}`);
    const stage = STAGES[opts.stage ?? 'proto'];
    if (!stage) throw new Error(`Stage inconnu : ${opts.stage ?? ''}`);
    this.plan = planStage(stage);
    this.endlessFinals = CAMPAIGN.filter((s) => s.id !== stage.id).map((s) => bossIndex(s.boss));
    const rules: RunRules = { ...defaultRules(), ...opts.rules };
    const meta = opts.meta ?? neutralMeta();
    // Teintes des armes : couleur d'origine, ou apparence de maîtrise.
    this.weaponTint = Uint32Array.from(WEAPONS, (w, i) => meta.weaponTint[i] || colorOf(w.color));
    this.skinned = Uint8Array.from(WEAPONS, (_, i) => (meta.weaponTint[i] ? 1 : 0));
    this.state = {
      tick: 0,
      time: 0,
      status: 'running',
      stage,
      character,
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
        slowT: 0,
        slowAmt: 0,
        terrainSlow: 0,
        terrainInertia: 0,
        terrainDps: 0,
        dash: character.dash,
        dashKind: DASH_KINDS.indexOf(character.dash.kind),
        dashCharges: character.dash.charges,
        dashFromX: 0,
        dashFromY: 0,
        revives: meta.revives,
        stats: baseStats(),
      },
      weapons: [],
      passives: [],
      resonance: createResonance(),
      director: {
        waveIndex: 0,
        target: 0,
        hpScale: 1,
        miniIndex: 0,
        bossSpawned: false,
        densityMult: 1,
        eliteT: PROGRESSION.elite.first,
        dmgScale: 1,
        waveBase: 0,
        bossCount: 0,
        restT: rules.bossRest > 0 ? Math.min(3, rules.bossRest) : 0,
      },
      boss: createBossState(),
      levelUp: {
        choices: [],
        rerolls:
          PROGRESSION.rerolls + (character.passive.stats.rerolls ?? 0) + (meta.stats.rerolls ?? 0),
        banishes:
          PROGRESSION.banishes +
          (character.passive.stats.banishes ?? 0) +
          (meta.stats.banishes ?? 0),
        locks: PROGRESSION.locks + (character.passive.stats.locks ?? 0) + (meta.stats.locks ?? 0),
        locked: null,
        banished: new Set(),
      },
      chest: null,
      events: createRunEvents(),
      merchant: null,
      altar: null,
      bonus: { damage: 0, maxHp: 0 },
      stats: {
        kills: 0,
        killsByType: new Int32Array(ENEMIES.length),
        damageBySlot: new Float64Array(9),
        damageTaken: 0,
        xpCollected: 0,
        peakEnemies: 0,
        bossKilled: false,
        minibosses: 0,
        bossesDefeated: [],
        elitesKilled: 0,
        chests: 0,
        evolutions: 0,
        fragments: 0,
        spent: 0,
        runEvents: 0,
      },
      pacts: createPacts(opts.pactChoice ?? false, rules.mods),
      mechanic: createMechanic(stage),
      rules,
      timeline: createTimeline(),
      meta,
      debug: { invincible: rules.sandbox },
    };
    const p = this.state.player;
    p.eid = spawnPlayer(this);
    p.stats = computeStats(this);
    p.hp = p.stats.maxHp;
    const weapon = WEAPONS.findIndex((w) => w.id === (opts.weapon ?? character.weapon));
    addWeapon(this, weapon < 0 ? 0 : weapon);
    this.applyLoadout(rules.loadout);
    if (opts.pacts && opts.pacts.length > 0) {
      imposePacts(this, opts.pacts);
      this.fullHealth();
    }
    if (opts.pactChoice) offerPacts(this, PACTS.offer, PACTS.maxStart);
  }

  /** Build de départ (Boss Rush) : armes et passifs aux niveaux donnés, puis pleine vie. */
  private applyLoadout(loadout: RunRules['loadout']): void {
    if (loadout.weapons.length === 0 && loadout.passives.length === 0) return;
    const st = this.state;
    for (const { index, level } of loadout.weapons) {
      const w = st.weapons.find((x) => x.defIndex === index) ?? addWeapon(this, index);
      if (!w) continue;
      const max = maxWeaponLevel(w.def);
      while (w.level < Math.min(level, max)) levelUpWeapon(w);
    }
    for (const { index, level } of loadout.passives) {
      if (st.passives.length >= PROGRESSION.maxPassives) break;
      if (st.passives.some((p) => p.defIndex === index)) continue;
      const def = PASSIVES[index];
      st.passives.push({ def, defIndex: index, level: Math.min(level, def.maxLevel) });
    }
    refreshStats(this);
    this.fullHealth();
  }

  private fullHealth(): void {
    const p = this.state.player;
    p.hp = p.stats.maxHp;
    Life.hp[p.eid] = p.hp;
    Life.max[p.eid] = p.hp;
  }

  /** Active une entité d'un pool, colonnes remises à zéro ; -1 si le pool est plein. */
  spawnIn(pool: EntityPool): number {
    const eid = pool.spawn();
    if (eid >= 0) pool.reset(eid);
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
    updateStageMechanic(this);
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
    updateTimeline(this);
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
    this.world.chests,
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
    const pool = this.world.enemies;
    const list = this.gridList;
    let n = 0;
    for (let i = 0; i < pool.count; i++) {
      const e = pool.active[i];
      if (Foe.hidden[e] === 0) list[n++] = e;
    }
    this.grid.rebuild(Pos.x[p], Pos.y[p], list, n, Pos.x, Pos.y);
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

  /** Fin de l'animation d'un coffre. */
  closeChest(): void {
    closeChest(this);
  }

  /** Bots (tests, simulateur) : résout l'écran en cours avec le choix par défaut. */
  resolvePrompt(): void {
    switch (this.state.status) {
      case 'levelup':
        this.choose(0);
        break;
      case 'chest':
        this.closeChest();
        break;
      case 'merchant':
        this.closeMerchant();
        break;
      case 'altar':
        this.closeAltar();
        break;
      case 'pact':
        this.sealPacts([]);
        break;
      default:
    }
  }

  /** Pactes : positions choisies dans l'offre en cours (au plus le nombre permis). */
  sealPacts(choices: readonly number[]): void {
    sealPacts(this, choices);
    // PV max changés au départ (Chair de verre…) : la run commence pleine vie.
    if (this.state.time === 0) this.fullHealth();
  }

  /** Marchand : achat d'une offre (false si vendue ou trop chère), départ. */
  buy(i: number): boolean {
    return buy(this, i);
  }

  closeMerchant(): void {
    closeMerchant(this);
  }

  /** Autel : offrande (false si indisponible), fermeture (refus ou après l'offrande). */
  sacrifice(kind: AltarOfferKind): boolean {
    return sacrifice(this, kind);
  }

  closeAltar(): void {
    closeAltar(this);
  }

  // --- Debug ------------------------------------------------------------------------------

  debugSpawn(type: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.spawnPoint(20, 300);
      spawnEnemy(this, type % ENEMIES.length, this.point.x, this.point.y, 1);
    }
  }

  /** Élite d'un type donné (affixes selon le temps de jeu). */
  debugElite(type: number): void {
    spawnElite(this, this.state.time, this.state.director.hpScale, type % ENEMIES.length);
  }

  debugRunEvent(kind: RunEventKind): void {
    startRunEvent(this, kind);
  }

  debugLevelUp(): void {
    this.state.player.xp = 0;
    gainLevel(this);
  }

  /** Boss du stage, ou boss donné (entraînement) ; jamais deux à la fois. */
  debugBoss(index = this.plan.boss): void {
    if (this.state.boss.eid >= 0) return;
    this.state.director.bossSpawned = true;
    spawnBoss(this, index, { ends: !this.state.rules.sandbox, chest: false });
  }

  /** Ajoute un passif (ou le monte d'un niveau). */
  debugPassive(defIndex: number): void {
    const st = this.state;
    const p = st.passives.find((x) => x.defIndex === defIndex);
    if (p) p.level = Math.min(p.def.maxLevel, p.level + 1);
    else if (st.passives.length < PROGRESSION.maxPassives)
      st.passives.push({ def: PASSIVES[defIndex], defIndex, level: 1 });
    refreshStats(this);
  }

  /** Retire une arme (entraînement). */
  debugRemoveWeapon(defIndex: number): void {
    const st = this.state;
    const i = st.weapons.findIndex((x) => x.defIndex === defIndex);
    if (i < 0 || st.weapons.length <= 1) return;
    st.weapons.splice(i, 1);
    // Emplacements renumérotés : les éclats en orbite sont recréés.
    const orbits = this.world.orbits;
    while (orbits.count > 0) orbits.despawn(orbits.active[orbits.count - 1]);
    st.weapons.forEach((w, slot) => {
      w.slot = slot;
      w.shards = 0;
    });
  }

  /** Efface tous les ennemis et leurs projectiles (entraînement). */
  debugClear(): void {
    const w = this.world;
    for (const pool of [w.enemies, w.bullets]) {
      while (pool.count > 0) pool.despawn(pool.active[pool.count - 1]);
    }
    const b = this.state.boss;
    if (b.eid >= 0) {
      w.boss.despawn(b.eid);
      b.eid = -1;
    }
  }

  debugEveil(): void {
    startEveil(this);
  }

  /** Ajoute une arme (ou la monte d'un niveau si elle est déjà équipée). */
  debugWeapon(defIndex: number): void {
    const w = this.state.weapons.find((x) => x.defIndex === defIndex);
    if (w) levelUpWeapon(w);
    else addWeapon(this, defIndex);
  }

  /** Arme au niveau max + passif requis, et un coffre aux pieds du joueur : évolution. */
  debugEvolve(defIndex: number): void {
    let w = this.state.weapons.find((x) => x.defIndex === defIndex);
    w ??= addWeapon(this, defIndex) ?? undefined;
    if (!w) return;
    while (w.level < maxWeaponLevel(w.def)) levelUpWeapon(w);
    const pi = EVOLUTION_PASSIVE[defIndex];
    if (!this.state.passives.some((p) => p.defIndex === pi)) {
      this.state.passives.push({ def: PASSIVES[pi], defIndex: pi, level: 1 });
      refreshStats(this);
    }
    const p = this.state.player.eid;
    dropChest(this, Pos.x[p] + 30, Pos.y[p]);
  }
}
