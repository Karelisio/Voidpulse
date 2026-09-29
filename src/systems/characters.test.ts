import { describe, expect, it } from 'vitest';
import { CHARACTERS, PACTS, WEAPONS, enemyIndex } from '../content/data';
import { Life, Pos, Status, Zone } from '../engine/components';
import { spawnEnemy } from './enemies';
import { heat, rankOf, runScore } from './pacts';
import { healPlayer } from './player';
import { RunSim } from './sim';
import { ZONE } from './zones';

/** Run sans spawn ni élite, sans arme, pour isoler un personnage. */
function quiet(character: string, extra: Partial<{ pacts: string[] }> = {}): RunSim {
  const sim = new RunSim({ seed: `perso-${character}`, character, ...extra });
  sim.state.director.densityMult = 0;
  sim.state.director.eliteT = 1e9;
  sim.state.weapons.length = 0;
  sim.state.player.stats.critChance = 0;
  return sim;
}

function step(sim: RunSim, ticks: number): void {
  for (let t = 0; t < ticks; t++) {
    sim.resolvePrompt();
    sim.step();
    sim.events.clear();
  }
}

/** Dash vers +x ; renvoie la position de départ. */
function dash(sim: RunSim): { x: number; y: number } {
  const p = sim.state.player.eid;
  const from = { x: Pos.x[p], y: Pos.y[p] };
  sim.input.moveX = 1;
  sim.input.moveY = 0;
  sim.input.dash = true;
  step(sim, 1);
  sim.input.moveX = 0;
  return from;
}

function foe(sim: RunSim, dx: number, dy = 0): number {
  const p = sim.state.player.eid;
  const e = spawnEnemy(sim, enemyIndex('brute'), Pos.x[p] + dx, Pos.y[p] + dy, 1);
  Life.hp[e] = Life.max[e] = 1e5;
  return e;
}

describe('personnages', () => {
  it.each(CHARACTERS.map((c) => [c.id, c.weapon] as const))(
    '%s commence avec son arme',
    (id, weapon) => {
      const sim = new RunSim({ seed: 'arme', character: id });
      expect(sim.state.weapons[0].def.id).toBe(weapon);
      expect(WEAPONS.some((w) => w.id === weapon)).toBe(true);
    },
  );

  it('appliquent leur passif', () => {
    const base = new RunSim({ seed: 'p', character: 'vex' }).state.player.stats;
    const brakka = new RunSim({ seed: 'p', character: 'brakka' }).state.player;
    expect(brakka.stats.maxHp).toBe(base.maxHp + 40);
    expect(brakka.hp).toBe(brakka.stats.maxHp);
    expect(brakka.stats.speed).toBeCloseTo(base.speed * 0.9);
    const ysolde = new RunSim({ seed: 'p', character: 'ysolde' }).state.levelUp;
    const vex = new RunSim({ seed: 'p', character: 'vex' }).state.levelUp;
    expect(ysolde.rerolls).toBe(vex.rerolls + 1);
    expect(new RunSim({ seed: 'p', character: 'nova' }).state.player.stats.frozenBonus).toBe(0.25);
  });

  it('Transfert glacé : téléportation et gel au départ', () => {
    const sim = quiet('nova');
    const e = foe(sim, -40);
    step(sim, 2);
    const from = dash(sim);
    const p = sim.state.player.eid;
    expect(Pos.x[p] - from.x).toBeGreaterThan(150);
    expect(Status.chill[e]).toBeGreaterThan(0.5);
  });

  it('Éclair : blesse les ennemis traversés', () => {
    const sim = quiet('volt');
    const e = foe(sim, 90);
    step(sim, 2);
    dash(sim);
    expect(Life.hp[e]).toBeLessThan(1e5);
  });

  it('Nuée et Charge creuse : zone au point de départ', () => {
    for (const [id, kind] of [
      ['toxa', ZONE.POOL],
      ['orin', ZONE.PMINE],
    ] as const) {
      const sim = quiet(id);
      dash(sim);
      const zones = sim.world.zones;
      let n = 0;
      for (let i = 0; i < zones.count; i++) if (Zone.kind[zones.active[i]] === kind) n++;
      expect(n, id).toBe(1);
    }
  });

  it('Faille, Charge, Stase : effets à l’arrivée', () => {
    const rift = quiet('kael');
    const a = foe(rift, 280, 60);
    step(rift, 2);
    const ax = Pos.x[a];
    dash(rift);
    step(rift, 12);
    expect(Pos.x[a]).toBeLessThan(ax);

    const charge = quiet('brakka');
    const b = foe(charge, 150);
    step(charge, 2);
    dash(charge);
    step(charge, 12);
    expect(Life.hp[b]).toBeLessThan(1e5);

    const stasis = quiet('ysolde');
    const c = foe(stasis, 200);
    step(stasis, 2);
    dash(stasis);
    step(stasis, 12);
    expect(Status.stunT[c]).toBeGreaterThan(0);
  });

  it('Double saut, Floraison, Déphasage, Glissade', () => {
    const sable = quiet('sable');
    dash(sable);
    step(sable, 15);
    const p = sable.state.player;
    expect(p.dashCharges).toBe(1);
    dash(sable);
    expect(p.dashCharges).toBe(0);

    const mira = quiet('mira');
    mira.state.player.hp = 50;
    dash(mira);
    expect(mira.state.player.hp).toBeGreaterThan(54);

    const lyra = quiet('lyra');
    dash(lyra);
    expect(lyra.state.player.iFrames).toBeGreaterThan(0.5);

    const zeph = quiet('zeph');
    const from = dash(zeph);
    step(zeph, 20);
    expect(Pos.x[zeph.state.player.eid] - from.x).toBeGreaterThan(230);
  });
});

describe('pactes', () => {
  it('offre au départ, trois au plus, puis reprise', () => {
    const sim = new RunSim({ seed: 'pactes', pactChoice: true });
    expect(sim.state.status).toBe('pact');
    expect(sim.state.pacts.offer).toHaveLength(PACTS.offer);
    sim.sealPacts([0, 1, 2, 3, 4]);
    expect(sim.state.pacts.taken).toHaveLength(PACTS.maxStart);
    expect(sim.state.status).toBe('running');
    expect(sim.state.player.hp).toBe(sim.state.player.stats.maxHp);
  });

  it('cumulent leurs modificateurs et fixent le rang', () => {
    const sim = quiet('vex', { pacts: ['frenzy', 'glass', 'hunt'] });
    const m = sim.state.pacts.mods;
    expect(m.enemySpeed).toBeCloseTo(1.2);
    expect(m.eliteRate).toBeCloseTo(0.5);
    expect(sim.state.player.stats.maxHp).toBe(70);
    expect(heat(sim.state)).toBe(7);
    expect(rankOf(7)).toBe('S');
    expect(rankOf(0)).toBe('C');
    expect(rankOf(20)).toBe('SSS');
    const e = spawnEnemy(sim, enemyIndex('mite'), 0, 0, 1);
    expect(Life.max[e]).toBe(10);
    sim.state.stats.kills = 100;
    expect(runScore(sim.state)).toBe(Math.floor(100 * (1 + 7 * PACTS.scorePerHeat)));
  });

  it('Jeûne bloque les soins, Ancre le dash', () => {
    const sim = quiet('vex', { pacts: ['fasting', 'anchor'] });
    sim.state.player.hp = 40;
    healPlayer(sim, 30);
    expect(sim.state.player.hp).toBe(40);
    const p = sim.state.player.eid;
    const x = Pos.x[p];
    dash(sim);
    expect(Pos.x[p] - x).toBeLessThan(10);
  });

  it('propose un pacte de plus aux paliers', () => {
    const sim = new RunSim({ seed: 'palier', pactChoice: true });
    sim.sealPacts([]);
    sim.state.director.densityMult = 0;
    sim.state.debug.invincible = true;
    sim.state.time = PACTS.milestones[0] - 0.01;
    for (let t = 0; t < 5 && sim.state.status !== 'pact'; t++) {
      if (sim.state.status !== 'running') sim.resolvePrompt();
      sim.step();
    }
    expect(sim.state.status).toBe('pact');
    expect(sim.state.pacts.picks).toBe(1);
    sim.sealPacts([0]);
    expect(sim.state.pacts.taken).toHaveLength(1);
  });
});
