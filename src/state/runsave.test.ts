import { describe, expect, it } from 'vitest';
import { metaBonus } from '../meta/bonus';
import { buildRun } from '../modes/modes';
import { MemoryStore } from '../save/backend';
import { defaultSave } from '../save/schema';
import { RunSim } from '../systems/sim';
import { restoreSim, snapshotSim } from '../systems/snapshot';
import {
  clearRun,
  decodeRun,
  encodeRun,
  loadRun,
  RUN_SAVE_KEY,
  saveRun,
  setRunStore,
  useRunSave,
  type ActiveRun,
} from './runsave';

function activeRun(): ActiveRun {
  const d = defaultSave(0);
  const run = buildRun({
    mode: 'endless',
    character: 'vex',
    stage: 'forest',
    loadout: { weapons: [], passives: [] },
    ascension: 0,
    now: new Date(0),
    nonce: 'reprise',
  });
  return { mode: 'endless', run, counted: false, meta: metaBonus(d) };
}

function played(active: ActiveRun): RunSim {
  const sim = new RunSim({ seed: active.run.seed, ...active.run.options });
  sim.state.debug.invincible = true;
  for (let i = 0; i < 20 * 60; i++) {
    sim.resolvePrompt();
    sim.input.moveX = Math.cos(i / 50);
    sim.step();
    sim.events.clear();
  }
  return sim;
}

describe('partie en cours sauvegardée', () => {
  it('aller-retour : mode, options (valeurs non finies comprises) et instantané', () => {
    const active = activeRun();
    const sim = played(active);
    const snapshot = snapshotSim(sim, { seed: active.run.seed, ...active.run.options });
    const text = encodeRun({ savedAt: 5, active, snapshot }, '1.0.0');
    const back = decodeRun(text, '1.0.0');
    expect(back).not.toBeNull();
    expect(back?.active.mode).toBe('endless');
    expect(back?.active.run.options).toEqual(active.run.options);
    expect(back?.active.meta).toEqual(active.meta);
    const tick = sim.state.tick;
    const time = sim.state.time;
    const restored = restoreSim(JSON.parse(JSON.stringify(back?.snapshot)) as typeof snapshot);
    expect(restored.state.tick).toBe(tick);
    expect(restored.state.time).toBe(time);
  });

  it('ignore une autre version du jeu ou un texte illisible', () => {
    const active = activeRun();
    const sim = played(active);
    const snapshot = snapshotSim(sim, { seed: active.run.seed, ...active.run.options });
    const text = encodeRun({ savedAt: 0, active, snapshot }, '1.0.0');
    expect(decodeRun(text, '1.0.1')).toBeNull();
    expect(decodeRun('{pas du json', '1.0.0')).toBeNull();
    expect(decodeRun(null, '1.0.0')).toBeNull();
  });

  it('écrit, recharge et efface via le stockage', async () => {
    const kv = new MemoryStore();
    setRunStore(kv);
    const active = activeRun();
    const sim = played(active);
    await saveRun(active, snapshotSim(sim, { seed: active.run.seed, ...active.run.options }));
    expect(kv.map.get(RUN_SAVE_KEY)?.startsWith('gz:')).toBe(true);
    expect(kv.map.get(RUN_SAVE_KEY)?.length).toBeLessThan(300_000);
    useRunSave.setState({ saved: null });
    const loaded = await loadRun();
    expect(loaded?.active.run.seed).toBe(active.run.seed);
    expect(useRunSave.getState().saved).not.toBeNull();
    await clearRun();
    expect(kv.map.has(RUN_SAVE_KEY)).toBe(false);
    expect(useRunSave.getState().saved).toBeNull();
    // Contenu corrompu : effacé au chargement.
    await kv.set(RUN_SAVE_KEY, 'corrompu');
    expect(await loadRun()).toBeNull();
    expect(kv.map.has(RUN_SAVE_KEY)).toBe(false);
  });
});
