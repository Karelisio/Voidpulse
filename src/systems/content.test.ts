import { describe, expect, it } from 'vitest';
import {
  PASSIVES,
  REACTIONS,
  STATUS,
  WEAPONS,
  elementIndex,
  passiveIndex,
  reactionIndex,
  weaponIndex,
} from '../content/data';
import { Foe, Life, Look, Pos, SHOT_FLAG, Shot, Status, Zone } from '../engine/components';
import { ARCANE, FIRE, HIT, LIGHTNING, POISON, STATUS_ONLY, VOID, hitFoe } from './combat';
import { spawnElite } from './director';
import { spawnEnemy } from './enemies';
import { SLOT_EVEIL, SLOT_REACTION } from './events';
import { chestSize } from './loot';
import { dropChest } from './pickups';
import { refreshStats } from './progression';
import { startEveil, triggerReaction } from './resonance';
import { RunSim } from './sim';
import { addWeapon, levelUpWeapon, maxWeaponLevel } from './weapons';
import { ZONE } from './zones';

/** Run vide : directeur coupé, invincible, sans arme (l'arme de départ est retirée). */
function emptyRun(seed = 'contenu'): RunSim {
  const sim = new RunSim({ seed });
  sim.state.debug.invincible = true;
  sim.state.director.densityMult = 0;
  sim.state.director.eliteT = 1e9;
  sim.state.weapons.length = 0;
  sim.state.player.stats.critChance = 0;
  return sim;
}

/** Ennemi immobile (très résistant) à (dx, dy) du joueur. */
function foe(sim: RunSim, dx: number, dy: number, hp = 1e6): number {
  const p = sim.state.player.eid;
  const e = spawnEnemy(sim, 0, Pos.x[p] + dx, Pos.y[p] + dy, 1);
  Life.hp[e] = hp;
  Life.max[e] = hp;
  Foe.speed[e] = 0;
  Foe.dmg[e] = 0;
  return e;
}

function run(sim: RunSim, seconds: number): void {
  for (let t = 0; t < seconds * 60; t++) {
    if (sim.state.status === 'levelup') sim.choose(0);
    if (sim.state.status === 'chest') sim.closeChest();
    sim.step();
    sim.events.clear();
  }
}

/** Reconstruit la grille (les tests appellent des systèmes hors du pas de simulation). */
function grid(sim: RunSim): void {
  const p = sim.state.player.eid;
  sim.grid.rebuild(
    Pos.x[p],
    Pos.y[p],
    sim.world.enemies.active,
    sim.world.enemies.count,
    Pos.x,
    Pos.y,
  );
}

describe('formule de dégâts et statuts', () => {
  it('applique exposition, fragilité, électrisation et critique', () => {
    const sim = emptyRun();
    const e = foe(sim, 100, 0, 1000);
    const hit = (el: number): number => {
      const before = Life.hp[e];
      hitFoe(sim, e, 10, el | STATUS_ONLY, 0, 0, 0, 0, 0);
      return before - Life.hp[e];
    };
    expect(hit(255)).toBeCloseTo(10, 5);
    Status.exposeT[e] = 1;
    Status.exposeAmt[e] = 0.2;
    expect(hit(255)).toBeCloseTo(12, 5);
    Status.brittleT[e] = 1;
    expect(hit(255)).toBeCloseTo(10 * (1.2 + STATUS.brittle), 5);
    Status.shockT[e] = 1;
    HIT.noArc = true;
    expect(hit(LIGHTNING)).toBeCloseTo(10 * (1.2 + STATUS.brittle + STATUS.shock.bonus), 5);
    HIT.noArc = false;
    Status.exposeT[e] = 0;
    Status.exposeAmt[e] = 0;
    Status.brittleT[e] = 0;
    Status.shockT[e] = 0;
    HIT.forceCrit = true;
    expect(hit(255)).toBeCloseTo(10 * sim.state.player.stats.critMult, 5);
    HIT.forceCrit = false;
  });

  it('le vide retire une fraction des PV max (réduite contre les boss) et attire', () => {
    const sim = emptyRun();
    const e = foe(sim, 100, 0, 5000);
    hitFoe(sim, e, 0, VOID | STATUS_ONLY, 0, 0.01, Pos.x[e] - 50, Pos.y[e], 0);
    expect(5000 - Life.hp[e]).toBeCloseTo(50, 3);
    expect(Status.kx[e]).toBeLessThan(0);
  });

  it('pose les statuts : brûlure, froid → gel, toxines cumulées, exposition', () => {
    const sim = emptyRun();
    const e = foe(sim, 100, 0);
    hitFoe(sim, e, 1, FIRE | STATUS_ONLY, 0, 6, 0, 0, 0);
    expect(Status.burnDps[e]).toBe(6);
    hitFoe(sim, e, 1, elementIndex('frost') | STATUS_ONLY, 0, 0.6, 0, 0, 0);
    hitFoe(sim, e, 1, elementIndex('frost') | STATUS_ONLY, 0, 0.6, 0, 0, 0);
    expect(Status.freezeT[e]).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) hitFoe(sim, e, 0, POISON | STATUS_ONLY, 0, 1, 0, 0, 0);
    expect(Status.toxStacks[e]).toBe(STATUS.toxin.max);
    hitFoe(sim, e, 0, ARCANE | STATUS_ONLY, 0, 5, 0, 0, 0);
    expect(Status.exposeAmt[e]).toBeCloseTo(STATUS.expose.max, 5);
    // Les toxines infligent des dégâts sur la durée.
    const before = Life.hp[e];
    Status.burnT[e] = 0;
    run(sim, 1);
    expect(before - Life.hp[e]).toBeGreaterThan(STATUS.toxin.max * STATUS.toxin.dpsPerStack * 0.4);
  });
});

describe('armes', () => {
  it.each(WEAPONS.map((w) => w.id))('%s blesse les ennemis, niveau 1 et évoluée', (id) => {
    for (const evolved of [false, true]) {
      const sim = emptyRun(`arme-${id}`);
      const w = addWeapon(sim, weaponIndex(id));
      if (!w) throw new Error('emplacement');
      if (evolved) {
        for (let l = 1; l < maxWeaponLevel(w.def); l++) levelUpWeapon(w);
        sim.state.passives.push({
          def: PASSIVES[passiveIndex(w.def.evolution.passive)],
          defIndex: passiveIndex(w.def.evolution.passive),
          level: 1,
        });
        refreshStats(sim);
        dropChest(sim, Pos.x[sim.state.player.eid], Pos.y[sim.state.player.eid]);
      }
      // Anneau d'ennemis autour du joueur, à diverses distances.
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2;
        const d = 30 + (k % 8) * 25;
        foe(sim, Math.cos(a) * d, Math.sin(a) * d);
      }
      run(sim, 6);
      if (evolved) expect(w.evolved).toBe(true);
      expect(sim.state.stats.damageBySlot[w.slot]).toBeGreaterThan(0);
    }
  });
});

describe('réactions', () => {
  /** Grappe d'ennemis autour du point (200, 0) relatif au joueur ; renvoie la cible centrale. */
  function cluster(sim: RunSim, hp = 1e6): number[] {
    const out = [foe(sim, 200, 0, hp)];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      out.push(foe(sim, 200 + Math.cos(a) * 40, Math.sin(a) * 40, hp));
    }
    grid(sim);
    return out;
  }
  const react = (sim: RunSim, id: string, e: number): void => {
    triggerReaction(sim, reactionIndex(id), Pos.x[e], Pos.y[e], e);
  };
  const zones = (sim: RunSim, kind: number): number => {
    let n = 0;
    for (let i = 0; i < sim.world.zones.count; i++)
      if (Zone.kind[sim.world.zones.active[i]] === kind) n++;
    return n;
  };

  it('vapeur, surcharge, supraconduction', () => {
    const sim = emptyRun();
    const [c, ...ring] = cluster(sim);
    react(sim, 'vapor', c);
    expect(zones(sim, ZONE.VAPOR)).toBe(1);
    react(sim, 'overload', c);
    expect(ring.some((e) => Status.kx[e] !== 0 || Status.ky[e] !== 0)).toBe(true);
    react(sim, 'superconduct', c);
    expect(Status.brittleT[ring[0]]).toBeGreaterThan(0);
    expect(Status.stunT[ring[0]]).toBeGreaterThan(0);
  });

  it('déflagration consomme les toxines et enflamme la zone', () => {
    const sim = emptyRun();
    const [c, ...ring] = cluster(sim);
    Status.toxStacks[c] = 10;
    Status.toxT[c] = 3;
    const before = Life.hp[ring[0]];
    react(sim, 'deflagration', c);
    expect(Status.toxStacks[c]).toBe(0);
    expect(Status.burnT[ring[0]]).toBeGreaterThan(0);
    expect(before - Life.hp[ring[0]]).toBeGreaterThan(
      REACTIONS[reactionIndex('deflagration')].damage,
    );
  });

  it('nova et cristaux nécrotiques lancent des éclats (critiques / toxiques)', () => {
    const sim = emptyRun();
    const [c] = cluster(sim);
    react(sim, 'nova', c);
    let crits = 0;
    for (let i = 0; i < sim.world.shots.count; i++)
      if (Shot.flags[sim.world.shots.active[i]] & SHOT_FLAG.CRIT) crits++;
    expect(crits).toBe(REACTIONS[reactionIndex('nova')].power);
    const shots = sim.world.shots.count;
    react(sim, 'necrocrystal', c);
    expect(sim.world.shots.count).toBe(shots + REACTIONS[reactionIndex('necrocrystal')].power);
    run(sim, 0.5);
    expect(sim.state.stats.damageBySlot[SLOT_REACTION]).toBeGreaterThan(0);
  });

  it('flamme noire : % des PV max et propagation à la mort', () => {
    const sim = emptyRun();
    const [c, ...ring] = cluster(sim, 1000);
    react(sim, 'blackflame', c);
    expect(Status.blackT[c]).toBeGreaterThan(0);
    // Un voisin hors du rayon initial mais proche de la cible reçoit la flamme à sa mort.
    const far = foe(sim, 200 + 60, 0, 1000);
    Status.blackT[far] = 0;
    grid(sim);
    Life.hp[c] = 0;
    run(sim, 1 / 60);
    expect(Status.blackT[far]).toBeGreaterThan(0);
    const hp = Life.hp[ring[0]];
    run(sim, 1.5);
    expect(hp - Life.hp[ring[0]]).toBeGreaterThan(10);
  });

  it('prisme : gel et rayons réfractés qui exposent', () => {
    const sim = emptyRun();
    const [c, ...ring] = cluster(sim);
    react(sim, 'prism', c);
    expect(Status.freezeT[c]).toBeGreaterThan(0);
    expect(ring.filter((e) => Status.exposeT[e] > 0).length).toBe(
      REACTIONS[reactionIndex('prism')].power,
    );
  });

  it('zéro absolu : stase et exécution sous le seuil', () => {
    const sim = emptyRun();
    const [c, ...ring] = cluster(sim, 1000);
    Life.hp[ring[0]] = 50;
    react(sim, 'absolutezero', c);
    expect(Life.hp[ring[0]]).toBe(0);
    expect(Status.stunT[ring[1]]).toBeGreaterThan(0);
    expect(Life.hp[ring[1]]).toBeGreaterThan(0);
  });

  it('chaîne toxique : empoisonne plusieurs proies', () => {
    const sim = emptyRun();
    const [c, ...ring] = cluster(sim);
    react(sim, 'toxicchain', c);
    const poisoned = [c, ...ring].filter((e) => Status.toxStacks[e] > 0).length;
    expect(poisoned).toBe(REACTIONS[reactionIndex('toxicchain')].power);
  });

  it('surtension : orbe en orbite qui foudroie', () => {
    const sim = emptyRun();
    cluster(sim);
    const p = sim.state.player.eid;
    foe(sim, 60, 60);
    react(sim, 'surge', sim.world.enemies.active[0]);
    expect(zones(sim, ZONE.SURGE)).toBe(1);
    run(sim, 2);
    expect(sim.state.stats.damageBySlot[SLOT_REACTION]).toBeGreaterThan(0);
    expect(Math.hypot(Pos.x[p], Pos.y[p])).toBeLessThan(1);
  });

  it('faille : regroupe les ennemis au point de réaction', () => {
    const sim = emptyRun();
    const [c, ...ring] = cluster(sim);
    const x = Pos.x[c];
    const y = Pos.y[c];
    react(sim, 'rift', c);
    for (const e of ring) expect(Math.hypot(Pos.x[e] - x, Pos.y[e] - y)).toBeLessThan(30);
  });

  it('fléau : les statuts se transmettent à la mort', () => {
    const sim = emptyRun();
    const [c, ...ring] = cluster(sim, 1000);
    react(sim, 'plague', c);
    Status.toxStacks[c] = 7;
    Status.toxT[c] = 3;
    Status.marks[c] = 1 << FIRE;
    Status.markT[c * 6 + FIRE] = 3;
    for (const e of ring) {
      Status.toxStacks[e] = 0;
      Status.marks[e] = 0;
    }
    Life.hp[c] = 0;
    run(sim, 1 / 60);
    expect(
      ring.filter((e) => Status.toxStacks[e] >= 7 && (Status.marks[e] & (1 << FIRE)) !== 0).length,
    ).toBeGreaterThan(0);
  });

  it('corrosion : armure fondue et poison en % des PV max', () => {
    const sim = emptyRun();
    const [c, ...ring] = cluster(sim, 1000);
    react(sim, 'corrosion', c);
    expect(Status.corrodeT[ring[0]]).toBeGreaterThan(0);
    expect(Status.brittleT[ring[0]]).toBeGreaterThan(0);
    const hp = Life.hp[ring[0]];
    run(sim, 1.2);
    expect(hp - Life.hp[ring[0]]).toBeGreaterThan(10);
  });

  it('implosion : aspire puis détone', () => {
    const sim = emptyRun();
    const [c] = cluster(sim);
    const edge = foe(sim, 200 + 140, 0);
    grid(sim);
    const x = Pos.x[c];
    const d0 = Pos.x[edge] - x;
    react(sim, 'implosion', c);
    expect(zones(sim, ZONE.WELL)).toBe(1);
    run(sim, 1.3);
    expect(Math.abs(Pos.x[edge] - x)).toBeLessThan(d0 - 20);
    expect(zones(sim, ZONE.WELL)).toBe(0);
    expect(sim.state.stats.damageBySlot[SLOT_REACTION]).toBeGreaterThan(0);
  });
});

describe('Éveil fusionné', () => {
  it('prend la forme de la réaction dominante et se termine par une détonation', () => {
    const sim = emptyRun();
    const e = foe(sim, 150, 0);
    grid(sim);
    const rift = reactionIndex('rift');
    for (let i = 0; i < 3; i++) triggerReaction(sim, rift, Pos.x[e], Pos.y[e], e);
    triggerReaction(sim, reactionIndex('vapor'), Pos.x[e], Pos.y[e], e);
    startEveil(sim);
    expect(sim.state.resonance.dominant).toBe(rift);
    let finale = false;
    for (let t = 0; t < 60 * 9; t++) {
      sim.step();
      for (let i = 0; i < sim.events.count; i++) if (sim.events.type[i] === 30) finale = true;
      sim.events.clear();
    }
    expect(finale).toBe(true);
    expect(sim.state.resonance.eveilT).toBe(0);
    expect(sim.state.stats.damageBySlot[SLOT_EVEIL]).toBeGreaterThan(0);
  });
});

describe('élites, coffres, évolutions', () => {
  it('une élite porte un coffre ; le coffre fait évoluer une arme éligible', () => {
    const sim = emptyRun();
    const w = addWeapon(sim, weaponIndex('ember'));
    if (!w) throw new Error('emplacement');
    for (let l = 1; l < maxWeaponLevel(w.def); l++) levelUpWeapon(w);
    const pi = passiveIndex(w.def.evolution.passive);
    sim.state.passives.push({ def: PASSIVES[pi], defIndex: pi, level: 1 });
    refreshStats(sim);
    const e = spawnElite(sim, 60, 1);
    expect(Foe.elite[e]).toBe(1);
    expect(Look.scale[e]).toBeGreaterThan(1);
    // Tuée tout près du joueur : le coffre tombe et s'ouvre au contact.
    const p = sim.state.player.eid;
    Pos.x[e] = Pos.x[p] + 10;
    Pos.y[e] = Pos.y[p];
    Life.hp[e] = 0;
    sim.step();
    sim.events.clear();
    expect(sim.state.stats.elitesKilled).toBe(1);
    for (let t = 0; t < 10 && sim.state.status !== 'chest'; t++) {
      if (sim.state.status === 'levelup') sim.choose(0);
      sim.step();
    }
    expect(sim.state.status).toBe('chest');
    const rewards = sim.state.chest?.rewards ?? [];
    expect(rewards[0].kind).toBe('evolution');
    expect(w.evolved).toBe(true);
    sim.closeChest();
    expect(sim.state.status).toBe('running');
  });

  it('la chance augmente le nombre de récompenses', () => {
    expect(chestSize(0.5, 0)).toBe(1);
    expect(chestSize(0.2, 0)).toBe(3);
    expect(chestSize(0.03, 0)).toBe(5);
    expect(chestSize(0.5, 0.3)).toBe(3);
  });
});
