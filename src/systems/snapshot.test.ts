import { describe, expect, it } from 'vitest';
import { Life, Pos } from '../engine/components';
import { RunSim, type RunOptions } from './sim';
import { restoreSim, snapshotSim, type RunSnapshot } from './snapshot';

/** Entrées scriptées identiques pour les deux parties, menus résolus de la même façon. */
function play(sim: RunSim, from: number, ticks: number): void {
  for (let t = from; t < from + ticks; t++) {
    sim.resolvePrompt();
    sim.input.moveX = Math.cos(t / 70);
    sim.input.moveY = Math.sin(t / 90);
    sim.input.dash = t % 180 === 0;
    sim.step();
    sim.events.clear();
  }
}

/** Empreinte de l'état observable : chronologie, joueur, ennemis, statistiques. */
function fingerprint(sim: RunSim): string {
  const st = sim.state;
  let h = 0;
  const pool = sim.world.enemies;
  for (let i = 0; i < pool.count; i++) {
    const e = pool.active[i];
    h = (h * 31 + Math.round(Pos.x[e] * 100) + Math.round(Life.hp[e] * 10)) | 0;
  }
  return JSON.stringify({
    tick: st.tick,
    status: st.status,
    hp: st.player.hp,
    level: st.player.level,
    xp: st.player.xp,
    kills: st.stats.kills,
    fragments: st.stats.fragments,
    weapons: st.weapons.map((w) => `${w.def.id}:${String(w.level)}`),
    enemies: pool.count,
    gems: sim.world.gems.count,
    shots: sim.world.shots.count,
    gauge: st.resonance.gauge,
    h,
  });
}

describe('instantané de partie', () => {
  it('une partie restaurée se poursuit exactement comme l’originale', () => {
    // Les colonnes des composants sont partagées par toutes les simulations du processus :
    // l'originale va au bout avant que la copie ne soit restaurée (une seule partie à la fois,
    // comme dans le jeu).
    const options: RunOptions = { seed: 'snap', stage: 'desert', character: 'volt' };
    const a = new RunSim(options);
    a.state.debug.invincible = true;
    play(a, 0, 40 * 60);
    const text = JSON.stringify(snapshotSim(a, options));
    const atSnapshot = fingerprint(a);
    play(a, 40 * 60, 30 * 60);
    const original = fingerprint(a);
    const character = a.state.character;
    expect(a.state.time).toBeGreaterThan(60);

    const b = restoreSim(JSON.parse(text) as RunSnapshot);
    expect(fingerprint(b)).toBe(atSnapshot);
    // Références aux définitions de config conservées (identité), pas des copies.
    expect(b.state.character).toBe(character);
    play(b, 40 * 60, 30 * 60);
    expect(fingerprint(b)).toBe(original);
  });

  it('reste raisonnablement compact', () => {
    const options: RunOptions = { seed: 'taille', stage: 'forest' };
    const sim = new RunSim(options);
    sim.state.debug.invincible = true;
    play(sim, 0, 120 * 60);
    const size = JSON.stringify(snapshotSim(sim, options)).length;
    expect(size).toBeLessThan(2_000_000);
  });
});
