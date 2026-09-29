import { describe, expect, it } from 'vitest';
import { Life, Pos } from '../engine/components';
import { RunSim } from './sim';

/** Bot scripté : trajectoire en boucle, dash périodique, première carte à chaque niveau. */
function play(sim: RunSim, ticks: number): void {
  for (let t = 0; t < ticks; t++) {
    const time = t / 60;
    sim.input.moveX = Math.cos(time * 0.6);
    sim.input.moveY = Math.sin(time * 0.43);
    if (t % 300 === 0) sim.input.dash = true;
    if (sim.state.status === 'levelup') sim.choose(0);
    if (sim.state.status === 'dead' || sim.state.status === 'victory') break;
    sim.step();
    sim.events.clear();
  }
}

/** Donne une arme via une carte de niveau forcée. */
function grantWeapon(sim: RunSim, index: number): void {
  sim.state.status = 'levelup';
  sim.state.player.pendingLevels = 1;
  sim.state.levelUp.choices = [{ kind: 'weapon-new', index, level: 1 }];
  sim.choose(0);
}

function checksum(sim: RunSim): number {
  let h = 0;
  const mix = (v: number): void => {
    h = Math.imul(h ^ Math.round(v * 1000), 2654435761) >>> 0;
  };
  const w = sim.world;
  for (const pool of [w.player, w.enemies, w.shots, w.bullets, w.gems]) {
    mix(pool.count);
    for (let i = 0; i < pool.count; i++) {
      const e = pool.active[i];
      mix(Pos.x[e]);
      mix(Pos.y[e]);
      mix(Life.hp[e]);
    }
  }
  const st = sim.state;
  mix(st.tick);
  mix(st.player.hp);
  mix(st.player.xp);
  mix(st.player.level);
  mix(st.stats.kills);
  mix(st.resonance.gauge);
  return h;
}

describe('RunSim', () => {
  it('est déterministe : même graine, même partie à l’identique', () => {
    // Les composants sont des tableaux globaux : une seule RunSim active à la fois.
    const run = (seed: string): { sum: number; kills: number } => {
      const sim = new RunSim({ seed });
      play(sim, 60 * 90);
      return { sum: checksum(sim), kills: sim.state.stats.kills };
    };
    const a = run('determinisme');
    expect(run('determinisme')).toEqual(a);
    expect(run('autre graine').sum).not.toBe(a.sum);
  });

  it('fait progresser une run : ennemis abattus, niveaux, Résonance', () => {
    const sim = new RunSim({ seed: 'progression' });
    sim.state.debug.invincible = true;
    play(sim, 60 * 180);
    const st = sim.state;
    expect(st.stats.kills).toBeGreaterThan(100);
    expect(st.player.level).toBeGreaterThanOrEqual(5);
    expect(st.weapons.length).toBeGreaterThanOrEqual(2);
    expect(Number.isFinite(Pos.x[st.player.eid])).toBe(true);
    for (let i = 0; i < sim.world.enemies.count; i++) {
      const e = sim.world.enemies.active[i];
      expect(Number.isFinite(Pos.x[e]) && Number.isFinite(Pos.y[e])).toBe(true);
    }
  });

  it('déclenche des réactions et l’Éveil avec plusieurs éléments', () => {
    const sim = new RunSim({ seed: 'resonance' });
    sim.state.debug.invincible = true;
    // Les trois armes dès le départ, pour forcer les réactions.
    grantWeapon(sim, 1);
    grantWeapon(sim, 2);
    expect(sim.state.weapons.length).toBe(3);
    sim.debugSpawn(0, 120);
    let reactions = 0;
    let eveil = false;
    for (let t = 0; t < 60 * 90; t++) {
      sim.input.moveX = Math.cos(t / 120);
      sim.input.moveY = Math.sin(t / 150);
      if (sim.state.status === 'levelup') sim.choose(0);
      sim.step();
      for (let i = 0; i < sim.events.count; i++) {
        if (sim.events.type[i] === 7) reactions++;
        if (sim.events.type[i] === 8) eveil = true;
      }
      sim.events.clear();
      if (t % 120 === 0) sim.debugSpawn(t % 240 === 0 ? 0 : 1, 30);
    }
    expect(reactions).toBeGreaterThan(10);
    expect(eveil).toBe(true);
  });

  it('fait apparaître un boss qui déroule ses motifs et peut mourir', () => {
    const sim = new RunSim({ seed: 'boss' });
    sim.state.debug.invincible = true;
    sim.debugBoss();
    const boss = sim.state.boss.eid;
    expect(boss).toBeGreaterThanOrEqual(0);
    const patterns = new Set<number>();
    for (let t = 0; t < 60 * 40; t++) {
      if (sim.state.status === 'levelup') sim.choose(0);
      sim.step();
      for (let i = 0; i < sim.events.count; i++)
        if (sim.events.type[i] === 21) patterns.add(sim.events.a[i]);
      sim.events.clear();
    }
    expect(patterns.size).toBeGreaterThanOrEqual(2);
    // Fin rapide : on vide les PV du boss et la run se termine en victoire.
    Life.hp[sim.state.boss.eid] = 0;
    for (let t = 0; t < 60 * 3 && sim.state.status !== 'victory'; t++) {
      if (sim.state.status === 'levelup') sim.choose(0);
      sim.step();
      sim.events.clear();
    }
    expect(sim.state.status).toBe('victory');
    expect(sim.state.stats.bossKilled).toBe(true);
  });
});
