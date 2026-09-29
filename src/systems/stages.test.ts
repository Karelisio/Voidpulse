import { describe, expect, it } from 'vitest';
import { BOSSES, CAMPAIGN } from '../content/data';
import { Life, Pos, Zone } from '../engine/components';
import { BOSS_PATTERNS, spawnBoss } from './boss';
import { EV } from './events';
import { RunSim } from './sim';
import { ZONE } from './zones';

function run(sim: RunSim, seconds: number, seen?: Set<string>): void {
  for (let t = 0; t < seconds * 60; t++) {
    sim.resolvePrompt();
    sim.input.moveX = Math.cos(t / 70);
    sim.input.moveY = Math.sin(t / 90);
    sim.step();
    if (seen) {
      const q = sim.events;
      for (let i = 0; i < q.count; i++) seen.add(`${String(q.type[i])}:${String(q.a[i])}`);
    }
    sim.events.clear();
  }
}

function zones(sim: RunSim, kind: number): number {
  let n = 0;
  const pool = sim.world.zones;
  for (let i = 0; i < pool.count; i++) if (Zone.kind[pool.active[i]] === kind) n++;
  return n;
}

describe('stages de la campagne', () => {
  it.each(CAMPAIGN.map((s) => [s.id, s.mechanic.kind] as const))(
    '%s se joue (mécanique %s)',
    (id, kind) => {
      const sim = new RunSim({ seed: `stage-${id}`, stage: id });
      sim.state.debug.invincible = true;
      run(sim, 25);
      expect(sim.world.enemies.count).toBeGreaterThan(10);
      const p = sim.state.player.eid;
      expect(Number.isFinite(Pos.x[p])).toBe(true);
      if (kind === 'water' || kind === 'ice' || kind === 'bog') {
        expect(zones(sim, ZONE.TERRAIN)).toBe(sim.state.stage.mechanic.count);
      }
    },
  );

  it('eaux lentes, apesanteur : effets sur le joueur', () => {
    const sim = new RunSim({ seed: 'eau', stage: 'sunken' });
    sim.state.debug.invincible = true;
    run(sim, 1);
    const pool = sim.world.zones;
    const p = sim.state.player.eid;
    for (let i = 0; i < pool.count; i++) {
      const z = pool.active[i];
      if (Zone.kind[z] !== ZONE.TERRAIN) continue;
      Pos.x[p] = Pos.x[z];
      Pos.y[p] = Pos.y[z];
      break;
    }
    sim.step();
    expect(sim.state.player.terrainSlow).toBeCloseTo(0.35);

    const space = new RunSim({ seed: 'apesanteur', stage: 'station' });
    space.step();
    expect(space.state.player.terrainInertia).toBeGreaterThan(0);
  });

  it('vagues : tempête de verre, coulée de lave, puits du vide', () => {
    for (const [id, kind] of [
      ['desert', ZONE.VOLATILE],
      ['volcano', ZONE.HAZARD],
      ['cathedral', ZONE.PULL],
    ] as const) {
      const sim = new RunSim({ seed: `vague-${id}`, stage: id });
      sim.state.debug.invincible = true;
      sim.state.director.densityMult = 0;
      sim.state.mechanic.cycleT = 0.1;
      run(sim, 2.5);
      expect(zones(sim, kind), id).toBeGreaterThan(0);
    }
  });

  it('mini-boss à 5 et 10 min (coffre, plus solide la 2e fois), boss final à 15 min', () => {
    const sim = new RunSim({ seed: 'boss', stage: 'forest' });
    sim.state.debug.invincible = true;
    sim.state.time = 299.9;
    run(sim, 0.2);
    const b = sim.state.boss;
    expect(b.def?.kind).toBe('mini');
    const hp1 = Life.max[b.eid];
    Life.hp[b.eid] = 0;
    run(sim, 2);
    expect(sim.state.status).not.toBe('victory');
    expect(sim.state.stats.minibosses).toBe(1);
    sim.state.time = 599.9;
    run(sim, 0.2);
    expect(sim.state.boss.def?.kind).toBe('mini');
    expect(Life.max[sim.state.boss.eid]).toBeCloseTo(hp1 * 1.6, 0);
    Life.hp[sim.state.boss.eid] = 0;
    run(sim, 2);
    sim.state.time = 899.9;
    run(sim, 0.2);
    expect(sim.state.boss.def?.kind).toBe('final');
    Life.hp[sim.state.boss.eid] = 0;
    for (let t = 0; t < 300 && sim.state.status !== 'victory' && sim.state.status !== 'dead'; t++)
      run(sim, 1 / 60);
    expect(sim.state.status).toBe('victory');
  });

  it('les 16 boss déroulent tous leurs motifs', () => {
    const played = new Set<number>();
    BOSSES.forEach((def, i) => {
      const sim = new RunSim({ seed: `motifs-${def.id}` });
      sim.state.debug.invincible = true;
      sim.state.director.densityMult = 0;
      sim.state.director.eliteT = 1e9;
      sim.state.director.bossSpawned = true;
      sim.state.weapons.length = 0;
      spawnBoss(sim, i);
      const seen = new Set<string>();
      // Toutes les phases : PV abaissés par paliers.
      for (const ratio of [1, 0.5, 0.2]) {
        const e = sim.state.boss.eid;
        Life.hp[e] = Life.max[e] * ratio;
        run(sim, 14, seen);
      }
      for (const key of seen) {
        const [type, a] = key.split(':').map(Number);
        if (type === EV.BOSS_PATTERN) played.add(a);
      }
      const wanted = new Set(def.phases.flatMap((p) => p.patterns));
      for (const pat of wanted) {
        expect(
          seen.has(`${String(EV.BOSS_PATTERN)}:${String(BOSS_PATTERNS.indexOf(pat))}`),
          `${def.id}:${pat}`,
        ).toBe(true);
      }
    });
    expect(played.size).toBe(BOSS_PATTERNS.length);
  });
});
