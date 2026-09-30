import { describe, expect, it } from 'vitest';
import { MODE_IDS } from '../../config/keys';
import { MODES, PASSIVES, WEAPONS } from '../content/data';
import { defaultSave } from '../save/schema';
import { RunSim } from '../systems/sim';
import {
  bossRushQueue,
  buildRun,
  dailyChallenge,
  dayKey,
  weekKey,
  weeklyChallenge,
  type RunSetup,
} from './modes';
import { bankedFragments, beginDaily, recordMode, type ModeResult } from './records';
import { ascensionMods } from '../meta/ascension';

const setup = (over: Partial<RunSetup> = {}): RunSetup => ({
  mode: 'campaign',
  character: 'nova',
  stage: 'desert',
  now: new Date(2026, 8, 29, 14),
  nonce: 'essai',
  ...over,
});

const result = (over: Partial<ModeResult> = {}): ModeResult => ({
  mode: 'endless',
  stage: 'Forêt brumeuse',
  character: 'Vex',
  victory: false,
  score: 1000,
  time: 600,
  bosses: 1,
  fragments: 100,
  period: '',
  counted: true,
  at: 0,
  ...over,
});

describe('périodes des défis', () => {
  it('jour local et semaine ISO', () => {
    expect(dayKey(new Date(2026, 8, 29, 23, 59))).toBe('2026-09-29');
    expect(weekKey(new Date(2026, 0, 1))).toBe('2026-W01');
    expect(weekKey(new Date(2027, 0, 1))).toBe('2026-W53');
    expect(weekKey(new Date(2026, 8, 28))).toBe(weekKey(new Date(2026, 9, 4)));
    expect(weekKey(new Date(2026, 8, 27))).not.toBe(weekKey(new Date(2026, 8, 28)));
  });

  it('défi du jour : identique pour une date, pactes distincts, change d’un jour à l’autre', () => {
    const a = dailyChallenge('2026-09-29');
    expect(dailyChallenge('2026-09-29')).toEqual(a);
    expect(a.pacts).toHaveLength(MODES.daily.pacts);
    expect(new Set(a.pacts.map((p) => p.id)).size).toBe(a.pacts.length);
    const days = Array.from({ length: 20 }, (_, i) => dailyChallenge(`2026-10-${String(i + 10)}`));
    expect(new Set(days.map((d) => d.character.id + d.stage.id)).size).toBeGreaterThan(10);
  });

  it('défi de la semaine : règles variées, file de six boss pour « boss uniquement »', () => {
    const seen = new Set<string>();
    for (let w = 1; w <= 52; w++) {
      const c = weeklyChallenge(`2026-W${String(w).padStart(2, '0')}`);
      seen.add(c.ruleset.id);
      if (c.ruleset.bossOnly) {
        expect(c.bosses).toHaveLength(2 + MODES.weekly.bossCount);
        expect(new Set(c.bosses).size).toBe(c.bosses.length);
      } else expect(c.bosses).toEqual([]);
    }
    expect(seen.size).toBeGreaterThanOrEqual(MODES.weekly.rulesets.length - 1);
  });
});

describe('construction des parties', () => {
  it.each(MODE_IDS)('%s : partie jouable', (mode) => {
    const run = buildRun(
      setup({
        mode,
        loadout: { weapons: [WEAPONS[3].id, WEAPONS[8].id], passives: [PASSIVES[2].id] },
      }),
    );
    const sim = new RunSim({ seed: run.seed, ...run.options });
    sim.state.debug.invincible = true;
    for (let t = 0; t < 600; t++) {
      sim.resolvePrompt();
      sim.step();
      sim.events.clear();
    }
    expect(sim.state.status).toBe('running');
  });

  it('difficulté Détente : ennemis allégés en Campagne, rien dans les défis', () => {
    const relaxed = MODES.difficulty.relaxed;
    const campaign = buildRun(setup({ difficulty: 'relaxed' }));
    expect(campaign.options.rules?.mods).toMatchObject(relaxed);
    expect(buildRun(setup({ difficulty: 'normal' })).options.rules?.mods).toBeUndefined();
    // Cumul avec l'Ascension (multiplicateurs).
    const asc = ascensionMods(3);
    const both = buildRun(setup({ difficulty: 'relaxed', ascension: 3 })).options.rules?.mods;
    expect(both?.enemyHp).toBeCloseTo((asc.enemyHp ?? 1) * relaxed.enemyHp);
    for (const mode of ['daily', 'weekly', 'hardcore'] as const) {
      const normal = buildRun(setup({ mode }));
      expect(buildRun(setup({ mode, difficulty: 'relaxed' })).options).toEqual(normal.options);
    }
  });

  it('les modes libres gardent le choix du joueur ; le défi du jour l’impose', () => {
    const free = buildRun(setup());
    expect(free.options).toMatchObject({ character: 'nova', stage: 'desert', pactChoice: true });
    expect(free.seed).toBe('essai');
    const daily = buildRun(setup({ mode: 'daily' }));
    const c = dailyChallenge('2026-09-29');
    expect(daily.seed).toBe(c.seed);
    expect(daily.options).toMatchObject({ character: c.character.id, stage: c.stage.id });
    expect(daily.options.pacts).toEqual(c.pacts.map((p) => p.id));
  });

  it('Ascension : modificateurs cumulés appliqués en Campagne et Hardcore seulement', () => {
    const run = buildRun(setup({ ascension: 3 }));
    expect(run.ascension).toBe(3);
    expect(run.options.rules?.mods).toEqual(ascensionMods(3));
    expect(run.detail).toContain('Ascension 3');
    expect(buildRun(setup({ mode: 'endless', ascension: 3 })).ascension).toBe(0);
    const sim = new RunSim({ seed: run.seed, ...run.options });
    expect(sim.state.pacts.mods.enemyHp).toBeCloseTo(1.1);
    expect(sim.state.pacts.taken).toEqual([]);
  });

  it('Boss Rush : les 16 boss et le build choisi', () => {
    expect(bossRushQueue()).toHaveLength(16);
    const run = buildRun(
      setup({
        mode: 'bossrush',
        loadout: {
          weapons: [WEAPONS[1].id, WEAPONS[7].id, WEAPONS[13].id],
          passives: [PASSIVES[4].id, PASSIVES[5].id],
        },
      }),
    );
    const sim = new RunSim({ seed: run.seed, ...run.options });
    const st = sim.state;
    expect(st.weapons.map((w) => [w.defIndex, w.level])).toEqual([
      [1, MODES.bossRush.weaponLevel],
      [7, MODES.bossRush.weaponLevel],
      [13, MODES.bossRush.weaponLevel],
    ]);
    expect(st.passives.map((p) => p.level)).toEqual([3, 3]);
    expect(st.rules.bossQueue).toEqual(bossRushQueue());
  });

  it('défi à éléments : arme de départ de l’élément imposé', () => {
    for (let w = 1; w <= 52; w++) {
      const run = buildRun(setup({ mode: 'weekly', now: new Date(2026, 0, 1 + 7 * w) }));
      const els = run.options.rules?.elements ?? [];
      if (els.length === 0) continue;
      const weapon = WEAPONS.find((x) => x.id === run.options.weapon);
      expect(els).toContain(weapon?.element);
    }
  });
});

describe('fragments ramenés', () => {
  it('linéaires jusqu’au seuil, puis en racine carrée, toujours croissants', () => {
    expect(bankedFragments(0)).toBe(0);
    expect(bankedFragments(100)).toBe(100);
    expect(bankedFragments(150)).toBe(150);
    expect(bankedFragments(250)).toBeCloseTo(150 + 8 * 10);
    // Une longue victoire (~4 000 pièces ramassées) ne rapporte plus des milliers de fragments.
    expect(bankedFragments(4000)).toBeLessThan(700);
    let prev = -1;
    for (let raw = 0; raw < 6000; raw += 37) {
      expect(bankedFragments(raw)).toBeGreaterThanOrEqual(prev);
      prev = bankedFragments(raw);
    }
  });
});

describe('résultats des modes', () => {
  it('Infini : classement trié par temps, plafonné', () => {
    const d = defaultSave(0);
    for (let i = 0; i < 12; i++) recordMode(d, result({ time: 100 * i }));
    const board = d.modes.endless.board;
    expect(board).toHaveLength(MODES.endless.leaderboard);
    expect(board[0].time).toBe(1100);
    expect(recordMode(d, result({ time: 50 })).lines[0]).toMatch(/Hors/);
    expect(recordMode(d, result({ time: 5000 })).lines[0]).toMatch(/1er/);
  });

  it('défi du jour : un seul essai compté par jour', () => {
    const d = defaultSave(0);
    expect(beginDaily(d, '2026-09-29')).toBe(true);
    expect(beginDaily(d, '2026-09-29')).toBe(false);
    recordMode(d, result({ mode: 'daily', period: '2026-09-29', score: 500 }));
    recordMode(d, result({ mode: 'daily', period: '2026-09-29', score: 9000, counted: false }));
    expect(d.modes.daily.history).toEqual([
      { day: '2026-09-29', score: 500, time: 600, victory: false },
    ]);
    expect(beginDaily(d, '2026-09-30')).toBe(true);
  });

  it('semaine : record remis à zéro à chaque semaine', () => {
    const d = defaultSave(0);
    recordMode(d, result({ mode: 'weekly', period: '2026-W40', score: 800 }));
    recordMode(d, result({ mode: 'weekly', period: '2026-W40', score: 300 }));
    expect(d.modes.weekly).toEqual({ week: '2026-W40', best: 800, runs: 2 });
    recordMode(d, result({ mode: 'weekly', period: '2026-W41', score: 100 }));
    expect(d.modes.weekly).toEqual({ week: '2026-W41', best: 100, runs: 1 });
  });

  it('Boss Rush : meilleur temps de victoire', () => {
    const d = defaultSave(0);
    recordMode(d, result({ mode: 'bossrush', bosses: 7 }));
    recordMode(d, result({ mode: 'bossrush', victory: true, time: 900, bosses: 16 }));
    recordMode(d, result({ mode: 'bossrush', victory: true, time: 1200, bosses: 16 }));
    expect(d.modes.bossRush).toEqual({ bestTime: 900, bestBosses: 16 });
  });

  it('Hardcore : fragments doublés, moitié perdue à la mort ; entraînement non compté', () => {
    const d = defaultSave(0);
    expect(recordMode(d, result({ mode: 'hardcore', victory: true })).fragments).toBe(200);
    expect(recordMode(d, result({ mode: 'hardcore', victory: false })).fragments).toBe(100);
    expect(recordMode(d, result({ mode: 'campaign' })).fragments).toBe(100);
    expect(recordMode(d, result({ mode: 'training' })).fragments).toBe(0);
    expect(d.wallet.fragments).toBe(400);
    expect(d.modes.hardcore.victories).toBe(1);
  });
});
