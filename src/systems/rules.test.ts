import { describe, expect, it } from 'vitest';
import { BOSSES, CAMPAIGN, PASSIVES, WEAPONS, bossIndex } from '../content/data';
import { Life } from '../engine/components';
import { endlessBoss } from './director';
import { RunSim, type RunOptions } from './sim';

function step(sim: RunSim, seconds: number): void {
  for (let t = 0; t < seconds * 60; t++) {
    sim.resolvePrompt();
    sim.input.moveX = Math.cos(t / 70);
    sim.input.moveY = Math.sin(t / 90);
    sim.step();
    sim.events.clear();
  }
}

/** Tue le boss en cours et laisse passer son agonie. */
function killBoss(sim: RunSim): void {
  const e = sim.state.boss.eid;
  expect(e).toBeGreaterThanOrEqual(0);
  Life.hp[e] = 0;
  for (let t = 0; t < 400 && sim.state.boss.eid >= 0 && sim.state.status !== 'victory'; t++)
    step(sim, 1 / 60);
}

const make = (opts: Omit<RunOptions, 'seed'>, seed = 'regles'): RunSim => {
  const sim = new RunSim({ seed, ...opts });
  sim.state.debug.invincible = true;
  return sim;
};

describe('règles de run', () => {
  it('partie sans fin : un boss toutes les 10 min, jamais de victoire, montée sans limite', () => {
    const sim = make({
      stage: 'forest',
      rules: {
        endless: {
          bossEvery: 600,
          bossHpStep: 0.5,
          hpPerMin: 0.2,
          damagePerMin: 0.05,
          densityPerMin: 0.05,
          densityCap: 520,
        },
      },
    });
    const forest = CAMPAIGN[0];
    expect(endlessBoss(sim, 0)).toBe(bossIndex(forest.miniBoss ?? ''));
    expect(endlessBoss(sim, 1)).toBe(bossIndex(forest.boss));
    expect(endlessBoss(sim, 2)).toBe(bossIndex(CAMPAIGN[1].boss));
    // Pas de mini-boss à 5 min.
    sim.state.time = 330;
    step(sim, 1);
    expect(sim.state.boss.eid).toBe(-1);
    sim.state.time = 599.9;
    step(sim, 0.5);
    expect(sim.state.boss.def?.id).toBe(forest.miniBoss);
    killBoss(sim);
    sim.state.time = 1199.9;
    step(sim, 0.5);
    expect(sim.state.boss.def?.id).toBe(forest.boss);
    const hp = Life.max[sim.state.boss.eid];
    expect(hp).toBeCloseTo(BOSSES[bossIndex(forest.boss)].hp * 1.5, 0);
    killBoss(sim);
    expect(sim.state.status).not.toBe('victory');
    expect(sim.state.stats.bossKilled).toBe(true);
    // Au-delà de 15 min : PV et dégâts des ennemis au-dessus de la courbe du stage.
    sim.state.time = 1500;
    step(sim, 0.1);
    expect(sim.state.director.hpScale).toBeGreaterThan(forest.hpScale.at(-1)?.[1] ?? 0);
    expect(sim.state.director.dmgScale).toBeGreaterThan(1.3);
    expect(sim.state.director.waveBase).toBeGreaterThanOrEqual(900);
  });

  it('file de boss : seulement des boss, coffre et soin entre eux, victoire après le dernier', () => {
    const queue = [bossIndex('thornwalker'), bossIndex('sentinel')];
    const sim = make({
      stage: 'forest',
      rules: { bossQueue: queue, bossRest: 2, healOnBoss: 0.5 },
    });
    step(sim, 4);
    expect(sim.state.boss.defIndex).toBe(queue[0]);
    expect(sim.world.enemies.count).toBeLessThan(10);
    const p = sim.state.player;
    p.hp = 10;
    Life.hp[p.eid] = 10;
    killBoss(sim);
    expect(p.hp).toBeGreaterThan(10);
    expect(sim.state.stats.chests + sim.world.chests.count).toBeGreaterThan(0);
    expect(sim.state.status).not.toBe('victory');
    step(sim, 3);
    expect(sim.state.boss.defIndex).toBe(queue[1]);
    expect(sim.state.boss.ends).toBe(true);
    killBoss(sim);
    expect(sim.state.status).toBe('victory');
  });

  it('bac à sable : aucun spawn, invincible, boss au choix sans fin de partie', () => {
    const sim = new RunSim({ seed: 'bac', stage: 'forest', rules: { sandbox: true } });
    expect(sim.state.debug.invincible).toBe(true);
    step(sim, 30);
    expect(sim.world.enemies.count).toBe(0);
    sim.debugBoss(bossIndex('voidarchon'));
    killBoss(sim);
    expect(sim.state.status).toBe('running');
    sim.debugSpawn(0, 20);
    expect(sim.world.enemies.count).toBe(20);
    sim.debugClear();
    expect(sim.world.enemies.count).toBe(0);
  });

  it('éléments imposés, PV fixés, build de départ, modificateurs de base', () => {
    const frost = WEAPONS.findIndex((w) => w.element === 'frost');
    const sim = make({
      stage: 'forest',
      weapon: WEAPONS[frost].id,
      rules: {
        elements: ['frost'],
        fixedMaxHp: 1,
        mods: { enemyHp: 2 },
        loadout: {
          weapons: [{ index: frost + 1, level: 5 }],
          passives: [{ index: 0, level: 3 }],
        },
      },
    });
    const st = sim.state;
    expect(st.player.stats.maxHp).toBe(1);
    expect(st.player.hp).toBe(1);
    expect(st.weapons.map((w) => w.level)).toEqual([1, 5]);
    expect(st.passives[0]).toMatchObject({ def: PASSIVES[0], level: 3 });
    expect(st.pacts.mods.enemyHp).toBe(2);
    expect(st.pacts.taken).toEqual([]);
    for (let i = 0; i < 12; i++) {
      sim.debugLevelUp();
      for (const c of st.levelUp.choices) {
        if (c.kind === 'weapon-new') expect(WEAPONS[c.index].element).toBe('frost');
      }
      sim.resolvePrompt();
    }
    expect(st.weapons.every((w) => w.def.element === 'frost')).toBe(true);
  });

  it('retirer une arme renumérote les emplacements', () => {
    const sim = make({ stage: 'forest' });
    sim.debugWeapon(5);
    sim.debugWeapon(9);
    const first = sim.state.weapons[0].defIndex;
    sim.debugRemoveWeapon(first);
    expect(sim.state.weapons.map((w) => w.slot)).toEqual([0, 1]);
    step(sim, 2);
  });
});
