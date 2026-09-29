import { describe, expect, it } from 'vitest';
import { defaultSave } from '../save/schema';
import { applyUnlocks, isUnlocked } from './unlocks';
import { CHARACTERS } from '../content/data';

describe('déblocages de personnages', () => {
  it('quatre personnages au départ, puis selon la carrière', () => {
    const d = defaultSave(0);
    expect(CHARACTERS.filter((c) => isUnlocked(d, c))).toHaveLength(4);
    expect(applyUnlocks(d)).toHaveLength(0);
    d.stats.runs = 3;
    expect(applyUnlocks(d).map((c) => c.id)).toEqual(['lyra']);
    expect(applyUnlocks(d)).toHaveLength(0);
    d.stats.victories = 1;
    d.profile.bestRank = 3;
    expect(applyUnlocks(d).map((c) => c.id)).toEqual(['kael', 'ysolde']);
    expect(d.profile.unlocked).toContain('ysolde');
  });
});
