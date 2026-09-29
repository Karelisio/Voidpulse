import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_OF,
  ENEMIES,
  NO_ELEMENT,
  RUN_EVENTS,
  STAGES,
  enemyIndex,
  weaponIndex,
  type StageDef,
} from '../content/data';
import { FRAME_COUNT } from '../content/frames';
import {
  ALL_COMPONENTS,
  FOE_FLAG,
  Foe,
  GEM_KIND,
  Gem,
  Life,
  Look,
  Pos,
  Zone,
  columnsOf,
} from '../engine/components';
import { ARCHETYPES } from '../engine/world';
import { benchTick, setupBench } from './bench';
import { HIT, hitFoe } from './combat';
import { spawnElite } from './director';
import { AFFIX, affixesAt, applyAffixes, makeElite } from './elites';
import { BEHAVIOR, spawnEnemy } from './enemies';
import { ENEMY_ACTION, EV, RUN_EVENT_PHASE } from './events';
import { startRunEvent } from './runevents';
import { RunSim } from './sim';
import { addWeapon } from './weapons';
import { ZONE } from './zones';

const proto = STAGES.proto as StageDef;
STAGES.arena = { ...proto, id: 'arena', waves: [], runEvents: [] };

/** Arène vide : pas de spawn, pas d'élite ni d'événement, sans arme, joueur invincible. */
function arena(seed = 'arene', stage = 'arena'): RunSim {
  const sim = new RunSim({ seed, stage });
  sim.state.director.densityMult = 0;
  sim.state.director.eliteT = 1e9;
  sim.state.weapons.length = 0;
  sim.state.debug.invincible = true;
  sim.state.player.stats.critChance = 0;
  return sim;
}

/** Simule `seconds` s et renvoie les événements vus (« type:a »). */
function run(sim: RunSim, seconds: number, seen = new Set<string>()): Set<string> {
  for (let t = 0; t < seconds * 60; t++) {
    sim.resolvePrompt();
    sim.step();
    const q = sim.events;
    for (let i = 0; i < q.count; i++) seen.add(`${String(q.type[i])}:${String(q.a[i])}`);
    q.clear();
  }
  return seen;
}

const ev = (type: number, a = 0): string => `${String(type)}:${String(a)}`;

function place(sim: RunSim, id: string, dx: number, dy = 0): number {
  const p = sim.state.player.eid;
  return spawnEnemy(sim, enemyIndex(id), Pos.x[p] + dx, Pos.y[p] + dy, 1);
}

function zonesOf(sim: RunSim, kind: number): number[] {
  const pool = sim.world.zones;
  const out: number[] = [];
  for (let i = 0; i < pool.count; i++)
    if (Zone.kind[pool.active[i]] === kind) out.push(pool.active[i]);
  return out;
}

function movePlayerTo(sim: RunSim, x: number, y: number): void {
  const p = sim.state.player.eid;
  Pos.x[p] = x;
  Pos.y[p] = y;
}

describe('ennemis', () => {
  it.each(ENEMIES.map((e, i) => [e.id, i] as const))(
    '%s agit selon son comportement',
    (id, type) => {
      const sim = arena(`ennemi-${id}`);
      const e = place(sim, id, 200);
      expect(e).toBeGreaterThanOrEqual(0);
      expect(Look.frame[e]).toBeLessThan(FRAME_COUNT);
      const p = sim.state.player.eid;
      let closest = Infinity;
      let guarded = false;
      const seen = new Set<string>();
      for (let s = 0; s < 12 * 4; s++) {
        run(sim, 0.25, seen);
        const pool = sim.world.enemies;
        for (let i = 0; i < pool.count; i++) {
          const o = pool.active[i];
          expect(Number.isFinite(Pos.x[o]) && Number.isFinite(Pos.y[o])).toBe(true);
          if (Foe.guardT[o] > 0) guarded = true;
        }
        if (Life.hp[e] > 0 && Foe.type[e] === type) {
          closest = Math.min(closest, Math.hypot(Pos.x[e] - Pos.x[p], Pos.y[e] - Pos.y[p]));
        }
      }
      switch (BEHAVIOR_OF[type]) {
        case BEHAVIOR.shooter:
          expect(
            seen.has(ev(EV.ENEMY_SHOT, e)) || seen.has(ev(EV.ENEMY_ACTION, ENEMY_ACTION.SNIPE)),
          ).toBe(true);
          break;
        case BEHAVIOR.kamikaze:
          expect(seen.has(ev(EV.EXPLOSION, 0))).toBe(true);
          expect(sim.state.stats.kills).toBe(0);
          break;
        case BEHAVIOR.teleporter:
          expect(seen.has(ev(EV.BLINK, e))).toBe(true);
          break;
        case BEHAVIOR.summoner:
          expect(seen.has(ev(EV.ENEMY_ACTION, ENEMY_ACTION.SUMMON))).toBe(true);
          expect(sim.world.enemies.count).toBeGreaterThan(1);
          break;
        case BEHAVIOR.charger:
          expect(seen.has(ev(EV.ENEMY_ACTION, ENEMY_ACTION.DASH))).toBe(true);
          break;
        case BEHAVIOR.mortar:
          expect(seen.has(ev(EV.EXPLOSION, 5))).toBe(true);
          break;
        case BEHAVIOR.turret:
          expect(seen.has(ev(EV.ENEMY_ACTION, ENEMY_ACTION.VOLLEY))).toBe(true);
          break;
        case BEHAVIOR.burrower:
          expect(seen.has(ev(EV.ENEMY_ACTION, ENEMY_ACTION.BURROW))).toBe(true);
          expect(seen.has(ev(EV.EXPLOSION, 7))).toBe(true);
          break;
        case BEHAVIOR.stampede:
          // Durée de vie écoulée : disparaît sans mort créditée.
          expect(sim.world.enemies.count).toBe(0);
          expect(sim.state.stats.kills).toBe(0);
          break;
        case BEHAVIOR.support:
          // Seul, il ne protège ni ne soigne personne.
          expect(guarded).toBe(false);
          break;
        default:
          expect(closest).toBeLessThan(60);
      }
    },
  );

  it('le bouclier frontal absorbe les coups de face, pas ceux de dos, puis se brise', () => {
    const sim = arena('bouclier');
    const p = sim.state.player.eid;
    const e = place(sim, 'crab', 100);
    Foe.speed[e] = 0;
    const hp = Life.hp[e];
    const shield = Foe.shield[e];
    expect(shield).toBeCloseTo(hp * 1.2);
    hitFoe(sim, e, 10, NO_ELEMENT, 0, 0, Pos.x[p], Pos.y[p], 0);
    expect(Life.hp[e]).toBe(hp);
    expect(Foe.shield[e]).toBeCloseTo(shield - 10);
    hitFoe(sim, e, 10, NO_ELEMENT, 0, 0, Pos.x[e] + 60, Pos.y[e], 0);
    expect(Life.hp[e]).toBeCloseTo(hp - 10);
    // Dégâts sur la durée : ignorent le bouclier.
    HIT.dot = true;
    hitFoe(sim, e, 5, NO_ELEMENT, 0, 0, Pos.x[p], Pos.y[p], 0);
    HIT.dot = false;
    expect(Life.hp[e]).toBeCloseTo(hp - 15);
    sim.events.clear();
    hitFoe(sim, e, 1e4, NO_ELEMENT, 0, 0, Pos.x[p], Pos.y[p], 0);
    expect(Foe.shield[e]).toBe(0);
    let broke = false;
    for (let i = 0; i < sim.events.count; i++)
      if (sim.events.type[i] === EV.SHIELD_BREAK) broke = true;
    expect(broke).toBe(true);
    hitFoe(sim, e, 10, NO_ELEMENT, 0, 0, Pos.x[p], Pos.y[p], 0);
    expect(Life.hp[e]).toBeCloseTo(hp - 25);
  });

  it('le bouclier pivote lentement : le contourner expose le flanc', () => {
    const sim = arena('pivot');
    const p = sim.state.player.eid;
    const e = place(sim, 'warden', 120);
    Foe.speed[e] = 0;
    // Le joueur passe brusquement derrière lui : la garde met du temps à suivre.
    movePlayerTo(sim, Pos.x[e] + 120, Pos.y[e]);
    run(sim, 0.2);
    const hp = Life.hp[e];
    hitFoe(sim, e, 10, NO_ELEMENT, 0, 0, Pos.x[p], Pos.y[p], 0);
    expect(Life.hp[e]).toBeLessThan(hp);
    run(sim, 2);
    const hp2 = Life.hp[e];
    hitFoe(sim, e, 10, NO_ELEMENT, 0, 0, Pos.x[p], Pos.y[p], 0);
    expect(Life.hp[e]).toBe(hp2);
  });

  it('le projecteur divise les dégâts subis par ses voisins ; l’acolyte les soigne', () => {
    const sim = arena('soutien');
    const proj = place(sim, 'projector', 300);
    const brute = place(sim, 'brute', 330);
    Foe.speed[proj] = 0;
    Foe.speed[brute] = 0;
    run(sim, 1.2);
    expect(Foe.guardT[brute]).toBeGreaterThan(0);
    expect(Foe.guardT[proj]).toBe(0);
    const hp = Life.hp[brute];
    hitFoe(sim, brute, 10, NO_ELEMENT, 0, 0, Pos.x[brute], Pos.y[brute], 0);
    expect(Life.hp[brute]).toBeCloseTo(hp - 5);

    const acolyte = place(sim, 'acolyte', -300);
    const mite = place(sim, 'mite', -330, 20);
    Foe.speed[acolyte] = 0;
    Foe.speed[mite] = 0;
    Life.max[mite] = 100;
    Life.hp[mite] = 10;
    const seen = run(sim, 3.5);
    expect(seen.has(ev(EV.ENEMY_ACTION, ENEMY_ACTION.HEAL))).toBe(true);
    expect(Life.hp[mite]).toBeGreaterThan(10);
  });

  it('un fouisseur enfoui échappe au ciblage puis resurgit', () => {
    const sim = arena('fouisseur');
    const e = place(sim, 'sandworm', 250);
    Foe.t0[e] = 0.1;
    let hidden = false;
    for (let s = 0; s < 40 && !hidden; s++) {
      run(sim, 0.1);
      hidden = Foe.hidden[e] === 1;
    }
    expect(hidden).toBe(true);
    const out = new Int32Array(64);
    const n = sim.grid.query(Pos.x[e], Pos.y[e], 80, out);
    expect(Array.from(out.subarray(0, n))).not.toContain(e);
    run(sim, 4);
    expect(Foe.hidden[e]).toBe(0);
  });

  it('le givre des tirs ralentit le joueur', () => {
    const sim = arena('givre');
    sim.state.debug.invincible = false;
    sim.state.player.hp = 1e6;
    const e = place(sim, 'frostspirit', 150);
    Foe.t0[e] = 0.1;
    const seen = run(sim, 6);
    expect(seen.has(ev(EV.PLAYER_SLOWED))).toBe(true);
  });

  it('les golems se fendent en créatures à leur mort', () => {
    const sim = arena('fission');
    const e = place(sim, 'glassgolem', 300);
    Life.hp[e] = 0;
    run(sim, 1 / 60);
    const shard = enemyIndex('shardling');
    let n = 0;
    for (let i = 0; i < sim.world.enemies.count; i++) {
      if (Foe.type[sim.world.enemies.active[i]] === shard) n++;
    }
    expect(n).toBe(4);
  });
});

describe('élites', () => {
  it('reçoivent 1 à 3 affixes selon le temps, compatibles avec leur comportement', () => {
    expect(affixesAt(0)).toBe(1);
    expect(affixesAt(300)).toBe(2);
    expect(affixesAt(600)).toBe(3);
    const sim = arena('affixes');
    for (let k = 0; k < 20; k++) {
      const e = place(sim, 'blinker', 300);
      makeElite(sim, e, 12);
      expect(Foe.affix[e] & AFFIX.BLINKING).toBe(0);
      const b = place(sim, 'bomber', 300);
      makeElite(sim, b, 12);
      expect(Foe.affix[b] & AFFIX.VOLATILE).toBe(0);
    }
    const e = spawnElite(sim, 600, 1, enemyIndex('brute'));
    let count = 0;
    for (let m = Foe.affix[e]; m !== 0; m &= m - 1) count++;
    expect(count).toBe(3);
  });

  function elite(sim: RunSim, mask: number, id = 'brute', dx = 250): number {
    const e = place(sim, id, dx);
    makeElite(sim, e, 0);
    applyAffixes(sim, e, mask);
    return e;
  }

  it('Rapide, Blindé, Bouclier, Régénération', () => {
    const sim = arena('affixes-stats');
    const plain = elite(sim, 0);
    const swift = elite(sim, AFFIX.SWIFT);
    expect(Foe.speed[swift] / Foe.speed[plain]).toBeGreaterThan(1.3);

    const armored = elite(sim, AFFIX.ARMORED);
    const hp = Life.hp[armored];
    hitFoe(sim, armored, 10, NO_ELEMENT, 0, 0, Pos.x[armored], Pos.y[armored], 0);
    expect(Life.hp[armored]).toBeCloseTo(hp - 5.5);

    const bubble = elite(sim, AFFIX.SHIELDED);
    const b0 = Foe.bubble[bubble];
    expect(b0).toBeCloseTo(Life.max[bubble] * 0.4);
    const hpB = Life.hp[bubble];
    hitFoe(sim, bubble, 10, NO_ELEMENT, 0, 0, Pos.x[bubble], Pos.y[bubble], 0);
    expect(Life.hp[bubble]).toBe(hpB);
    expect(Foe.bubble[bubble]).toBeCloseTo(b0 - 10);
    run(sim, 5.5);
    expect(Foe.bubble[bubble]).toBeCloseTo(b0);

    const regen = elite(sim, AFFIX.REGEN);
    Life.hp[regen] = Life.max[regen] * 0.5;
    run(sim, 2);
    expect(Life.hp[regen]).toBeGreaterThan(Life.max[regen] * 0.5);
  });

  it('Fractionnement, Instable : effets à la mort', () => {
    const sim = arena('affixes-mort');
    const split = elite(sim, AFFIX.SPLITTING);
    const max = Life.max[split];
    Life.hp[split] = 0;
    run(sim, 1 / 60);
    const pool = sim.world.enemies;
    expect(pool.count).toBe(3);
    for (let i = 0; i < pool.count; i++) {
      const c = pool.active[i];
      expect(Foe.flags[c] & FOE_FLAG.CHILD).toBeTruthy();
      expect(Life.max[c]).toBeCloseTo(max * 0.3);
      Life.hp[c] = 0;
    }
    run(sim, 1 / 60);
    expect(pool.count).toBe(0);
    expect(sim.world.chests.count).toBe(1);

    const volatile = elite(sim, AFFIX.VOLATILE);
    Life.hp[volatile] = 0;
    run(sim, 1 / 60);
    expect(zonesOf(sim, ZONE.VOLATILE)).toHaveLength(1);
    const seen = run(sim, 1.5);
    expect(seen.has(ev(EV.EXPLOSION, 6))).toBe(true);
  });

  it('Aura glaciale, Enragé, Incandescent, Artilleur, Invocateur, Téléporteur', () => {
    const sim = arena('affixes-actifs');
    sim.state.debug.invincible = false;
    sim.state.player.hp = 1e6;
    const aura = elite(sim, AFFIX.FROSTAURA, 'brute', 100);
    Foe.speed[aura] = 0;
    run(sim, 0.1);
    expect(sim.state.player.slowAmt).toBeCloseTo(0.4);
    Life.hp[aura] = 0;
    sim.state.debug.invincible = true;

    const rage = elite(sim, AFFIX.BERSERK);
    const speed = Foe.speed[rage];
    Life.hp[rage] = Life.max[rage] * 0.4;
    const seen = run(sim, 0.1);
    expect(seen.has(ev(EV.ENEMY_ACTION, ENEMY_ACTION.ENRAGE))).toBe(true);
    expect(Foe.speed[rage]).toBeCloseTo(speed * 1.4);
    Life.hp[rage] = 0;

    const burning = elite(sim, AFFIX.BURNING);
    run(sim, 1);
    expect(zonesOf(sim, ZONE.HAZARD).length).toBeGreaterThan(0);
    Life.hp[burning] = 0;

    const gunner = elite(sim, AFFIX.GUNNER);
    Foe.gunT[gunner] = 0.1;
    run(sim, 0.3);
    expect(sim.world.bullets.count).toBeGreaterThanOrEqual(10);
    Life.hp[gunner] = 0;

    const summoner = elite(sim, AFFIX.SUMMONER);
    Foe.summonT[summoner] = 0.1;
    run(sim, 0.3);
    expect(sim.world.enemies.count).toBeGreaterThanOrEqual(6);
    Life.hp[summoner] = 0;

    const blinker = elite(sim, AFFIX.BLINKING, 'brute', 600);
    Foe.speed[blinker] = 0;
    Foe.blinkT[blinker] = 0.1;
    const blinks = run(sim, 1.2);
    expect(blinks.has(ev(EV.BLINK, blinker))).toBe(true);
    const p = sim.state.player.eid;
    expect(Math.hypot(Pos.x[blinker] - Pos.x[p], Pos.y[blinker] - Pos.y[p])).toBeLessThan(200);
  });

  it('lâchent des pièces d’or', () => {
    const sim = arena('or');
    const e = spawnElite(sim, 0, 1, enemyIndex('brute'));
    Life.hp[e] = 0;
    run(sim, 1 / 60);
    let coins = 0;
    for (let i = 0; i < sim.world.gems.count; i++) {
      if (Gem.kind[sim.world.gems.active[i]] === GEM_KIND.COIN) coins++;
    }
    expect(coins).toBe(RUN_EVENTS.eliteCoins);
  });
});

describe('événements de run', () => {
  it('marchand : offres, achat, départ', () => {
    const sim = arena('marchand');
    startRunEvent(sim, 'merchant');
    const [z] = zonesOf(sim, ZONE.MERCHANT);
    movePlayerTo(sim, Pos.x[z], Pos.y[z]);
    run(sim, 1 / 60);
    expect(sim.state.status).toBe('merchant');
    const offers = sim.state.merchant?.offers ?? [];
    expect(offers).toHaveLength(3);
    // Sans arme ni blessure : pas de forge ni de soins proposés.
    expect(offers.some((o) => o.item === 'weapon' || o.item === 'heal')).toBe(false);
    sim.state.stats.fragments = 5;
    expect(sim.buy(0)).toBe(false);
    sim.state.stats.fragments = 1000;
    expect(sim.buy(0)).toBe(true);
    expect(sim.state.stats.fragments).toBe(1000 - offers[0].price);
    expect(offers[0].sold).toBe(true);
    expect(sim.buy(0)).toBe(false);
    sim.closeMerchant();
    expect(sim.state.status).toBe('running');
    expect(zonesOf(sim, ZONE.MERCHANT)).toHaveLength(0);
  });

  it('autel : invocation, offrandes de chair, de sang et d’or', () => {
    const sim = arena('autel');
    const maxHp = sim.state.player.stats.maxHp;
    const dmg = sim.state.player.stats.damageMult;
    const open = (): void => {
      startRunEvent(sim, 'altar');
      const [z] = zonesOf(sim, ZONE.ALTAR);
      movePlayerTo(sim, Pos.x[z], Pos.y[z]);
      for (let t = 0; t < 200 && sim.state.status === 'running'; t++) run(sim, 1 / 60);
      expect(sim.state.status).toBe('altar');
    };
    open();
    expect(sim.sacrifice('flesh')).toBe(true);
    expect(sim.sacrifice('blood')).toBe(false);
    expect(sim.state.player.stats.maxHp).toBe(maxHp - RUN_EVENTS.altar.flesh.cost);
    expect(sim.state.player.stats.damageMult).toBeCloseTo(
      dmg * (1 + RUN_EVENTS.altar.flesh.damage),
    );
    sim.closeAltar();
    expect(sim.state.status).toBe('running');

    open();
    const hp = sim.state.player.hp;
    sim.sacrifice('blood');
    expect(sim.state.player.hp).toBeCloseTo(hp * 0.7);
    sim.closeAltar();
    expect(sim.state.status).toBe('chest');
    expect(sim.state.chest?.rewards).toHaveLength(RUN_EVENTS.altar.blood.rewards);
    sim.closeChest();

    sim.state.stats.fragments = 100;
    open();
    expect(sim.sacrifice('gold')).toBe(true);
    expect(sim.state.stats.fragments).toBe(50);
    expect(sim.state.altar?.result?.kind).toBe('heal');
    sim.closeAltar();
  });

  it('faille temporelle : les ennemis ralentissent, l’XP augmente', () => {
    const sim = arena('faille');
    const a = place(sim, 'mite', 400);
    const x0 = Pos.x[a];
    run(sim, 1);
    const normal = x0 - Pos.x[a];
    startRunEvent(sim, 'rift');
    const [z] = zonesOf(sim, ZONE.RIFT);
    movePlayerTo(sim, Pos.x[z], Pos.y[z]);
    run(sim, 1 / 60);
    expect(sim.state.events.riftT).toBeGreaterThan(7);
    const b = place(sim, 'mite', 400);
    const x1 = Pos.x[b];
    run(sim, 1);
    expect((x1 - Pos.x[b]) / normal).toBeCloseTo(RUN_EVENTS.rift.slow, 1);
    Life.hp[b] = 0;
    run(sim, 1 / 60);
    let xp = 0;
    for (let i = 0; i < sim.world.gems.count; i++)
      xp = Math.max(xp, Gem.value[sim.world.gems.active[i]]);
    expect(xp).toBeCloseTo(RUN_EVENTS.rift.xp);
    const seen = run(sim, 8);
    expect(seen.has(ev(EV.RUN_EVENT, 3))).toBe(true);
    expect(sim.state.events.riftT).toBe(0);
  });

  it('horde dorée : des scarabées traversent le champ et lâchent de l’or', () => {
    const sim = arena('horde');
    startRunEvent(sim, 'horde');
    run(sim, 1);
    const pool = sim.world.enemies;
    expect(pool.count).toBe(RUN_EVENTS.horde.count);
    const e = pool.active[0];
    const p = sim.state.player.eid;
    const x = Pos.x[e];
    const y = Pos.y[e];
    run(sim, 0.5);
    expect(Math.hypot(Pos.x[e] - x, Pos.y[e] - y)).toBeGreaterThan(40);
    movePlayerTo(sim, Pos.x[e], Pos.y[e]);
    Life.hp[e] = 0;
    run(sim, 1);
    expect(sim.state.stats.fragments).toBeGreaterThanOrEqual(1);
    expect(Math.hypot(Pos.x[p] - x, Pos.y[p] - y)).toBeGreaterThan(0);
  });

  it('calendrier aléatoire : les quatre types passent avant une répétition', () => {
    STAGES.random = { ...proto, id: 'random', waves: [], runEvents: undefined };
    const sim = arena('calendrier', 'random');
    const kinds: number[] = [];
    for (let k = 0; k < 4; k++) {
      sim.state.events.nextAt = sim.state.time;
      sim.state.status = 'running';
      sim.step();
      const q = sim.events;
      for (let i = 0; i < q.count; i++) {
        if (q.type[i] === EV.RUN_EVENT && q.b[i] === RUN_EVENT_PHASE.APPEAR) kinds.push(q.a[i]);
      }
      q.clear();
    }
    expect(new Set(kinds).size).toBe(4);
  });

  it('vagues : tenaille, escorte élite, ruée', () => {
    STAGES.waves = {
      ...proto,
      id: 'waves',
      runEvents: [],
      waves: [
        { at: 0.01, kind: 'pincer', enemy: 'mite', count: 10 },
        { at: 0.01, kind: 'escort', enemy: 'brute', count: 6, minion: 'mite', elite: true },
        { at: 0.01, kind: 'stampede', enemy: 'goldling', count: 5 },
      ],
    };
    const sim = arena('vagues', 'waves');
    run(sim, 0.05);
    expect(sim.world.enemies.count).toBe(22);
    let elites = 0;
    for (let i = 0; i < sim.world.enemies.count; i++)
      elites += Foe.elite[sim.world.enemies.active[i]];
    expect(elites).toBe(1);
  });
});

describe('archétypes', () => {
  it('aucun système n’écrit une colonne hors de l’archétype de l’entité', () => {
    const sim = new RunSim({ seed: 'archetypes' });
    const cfg = { enemies: 400, shots: 300, mix: true };
    setupBench(sim, cfg);
    sim.state.debug.invincible = true;
    for (const id of ['frost', 'arc', 'runes', 'acidpool', 'singularity', 'glyphs']) {
      addWeapon(sim, weaponIndex(id));
    }
    for (const kind of ['merchant', 'altar', 'horde', 'rift'] as const) startRunEvent(sim, kind);
    spawnElite(sim, 600, 1, enemyIndex('brute'));
    const all = columnsOf(ALL_COMPONENTS);
    const pools = Object.keys(ARCHETYPES) as (keyof typeof ARCHETYPES)[];
    const foreign = new Map(
      pools.map((name) => {
        const own = new Set(columnsOf(ARCHETYPES[name]));
        return [name, all.filter((c) => !own.has(c))];
      }),
    );
    const violations = new Set<string>();
    for (let t = 0; t < 60 * 12; t++) {
      sim.input.moveX = Math.cos(t / 90);
      sim.input.moveY = Math.sin(t / 110);
      sim.resolvePrompt();
      benchTick(sim, cfg);
      sim.step();
      sim.events.clear();
      if (t % 60 !== 0) continue;
      for (const name of pools) {
        const pool = sim.world[name];
        const cols = foreign.get(name) ?? [];
        for (let i = 0; i < pool.count; i++) {
          const e = pool.active[i];
          for (let c = 0; c < cols.length; c++) {
            if (cols[c][e] !== 0)
              violations.add(`${name} : colonne ${String(all.indexOf(cols[c]))}`);
          }
        }
      }
    }
    expect([...violations]).toEqual([]);
  });
});
