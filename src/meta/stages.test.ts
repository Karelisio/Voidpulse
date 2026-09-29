import { describe, expect, it } from 'vitest';
import { BOSSES, CAMPAIGN } from '../content/data';
import { defaultSave } from '../save/schema';
import { recordStage, stageUnlocked } from './stages';

const run = (stage: string, victory: boolean, bosses: number[] = []) => ({
  stage,
  victory,
  score: 1000,
  time: victory ? 900 : 400,
  rank: 2,
  bosses,
});

describe('progression de la campagne', () => {
  it('seul le premier stage est ouvert au départ', () => {
    const d = defaultSave(0);
    expect(CAMPAIGN.map((_, i) => stageUnlocked(d, i))).toEqual(CAMPAIGN.map((_, i) => i === 0));
  });

  it('une défaite garde le record sans ouvrir le stage suivant', () => {
    const d = defaultSave(0);
    const mini = BOSSES.findIndex((b) => b.id === 'thornwalker');
    const r = recordStage(d, run('forest', false, [mini]));
    expect(r.stages).toEqual([]);
    expect(r.bosses).toEqual([BOSSES[mini].name]);
    expect(stageUnlocked(d, 1)).toBe(false);
    expect(d.profile.stageBest.forest).toEqual({ score: 1000, time: 400, rank: -1 });
  });

  it('le boss final ouvre le stage suivant, une seule fois', () => {
    const d = defaultSave(0);
    const first = recordStage(d, run('forest', true));
    expect(first.stages.map((s) => s.id)).toEqual([CAMPAIGN[1].id]);
    expect(stageUnlocked(d, 1)).toBe(true);
    expect(recordStage(d, run('forest', true)).stages).toEqual([]);
    expect(d.profile.stageBest.forest.rank).toBe(2);
    const last = CAMPAIGN[CAMPAIGN.length - 1].id;
    expect(recordStage(d, run(last, true)).stages).toEqual([]);
  });

  it('un boss déjà vaincu n’est pas compté deux fois', () => {
    const d = defaultSave(0);
    recordStage(d, run('proto', true, [0]));
    expect(recordStage(d, run('proto', true, [0])).bosses).toEqual([]);
    expect(d.profile.bosses).toEqual([BOSSES[0].id]);
  });
});
