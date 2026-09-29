import { describe, expect, it } from 'vitest';
import { BOSSES, META, TALENTS, WEAPONS } from '../content/data';
import { Rng } from '../engine/rng';
import { defaultSave, type SaveData } from '../save/schema';
import {
  addAccountXp,
  ascensionOpen,
  forgeOpen,
  paragonFree,
  paragonStats,
  relicSlots,
  spendParagon,
  xpForLevel,
} from './account';
import {
  ascensionMods,
  ascensionReward,
  ascensionSelected,
  recordAscension,
  selectAscension,
} from './ascension';
import { metaBonus } from './bonus';
import { claimCodex, codexEntries, codexProgress, discover } from './codex';
import { addMastery, masteryBonus, masteryRank, selectSkin } from './mastery';
import { applyRunMeta, type RunMetaInput } from './progress';
import {
  buyCache,
  equipRelic,
  equippedRelics,
  grantRelic,
  relicStats,
  rerollRelic,
  salvageRelic,
  upgradeCost,
  upgradeRelic,
} from './relics';
import { formatStat } from './stats';
import { buyTalent, canBuy, resetTalents, talentRank, talentStats } from './talents';

const rich = (): SaveData => {
  const d = defaultSave(0);
  d.wallet.fragments = 1e6;
  return d;
};

/** Atteint un niveau de compte donné. */
function levelTo(d: SaveData, level: number): void {
  let xp = 0;
  for (let l = d.meta.account.level; l < level; l++) xp += xpForLevel(l);
  addAccountXp(d, xp);
}

describe('talents', () => {
  const root = TALENTS.nodes.find((n) => n.id === 'assault-impact');
  const child = TALENTS.nodes.find((n) => n.requires.includes('assault-impact'));
  it('racine achetable, enfant verrouillé puis ouvert, rang max, remboursement', () => {
    if (!root || !child) throw new Error('arbre');
    const d = rich();
    expect(canBuy(d, child)).toBe('locked');
    expect(buyTalent(d, child.id)).toBe(false);
    for (let i = 0; i < root.cost.length; i++) expect(buyTalent(d, root.id)).toBe(true);
    expect(canBuy(d, root)).toBe('maxed');
    expect(talentStats(d).damage).toBeCloseTo(0.03 * root.cost.length);
    expect(canBuy(d, child)).toBe('ok');
    const spent = root.cost.reduce((s, c) => s + c, 0);
    expect(d.wallet.fragments).toBe(1e6 - spent);
    expect(resetTalents(d)).toBe(spent);
    expect(d.wallet.fragments).toBe(1e6);
    expect(talentRank(d, root.id)).toBe(0);
  });

  it('sans fragments : achat refusé', () => {
    if (!root) throw new Error('arbre');
    const d = defaultSave(0);
    expect(canBuy(d, root)).toBe('poor');
  });
});

describe('compte et Paragon', () => {
  it('niveaux, fragments, déblocages, puis Paragon au-delà du maximum', () => {
    const d = defaultSave(0);
    expect(relicSlots(d)).toBe(1);
    expect(forgeOpen(d)).toBe(false);
    const g = addAccountXp(d, xpForLevel(1) + xpForLevel(2) + xpForLevel(3) + xpForLevel(4));
    expect(g.levels).toEqual([2, 3, 4, 5]);
    expect(g.unlocks).toHaveLength(3);
    expect(d.wallet.fragments).toBeGreaterThan(0);
    expect(forgeOpen(d)).toBe(true);
    expect(ascensionOpen(d)).toBe(true);
    expect(relicSlots(d)).toBe(2);
    levelTo(d, META.account.maxLevel);
    expect(relicSlots(d)).toBe(3);
    const p = addAccountXp(d, META.account.paragonXp * 3 + 5);
    expect(p.paragon).toBe(3);
    expect(d.meta.account.level).toBe(META.account.maxLevel);
    expect(paragonFree(d)).toBe(3);
    expect(spendParagon(d, 'damage', 5)).toBe(3);
    expect(paragonFree(d)).toBe(0);
    expect(paragonStats(d).damage).toBeCloseTo(3 * 0.004);
    expect(spendParagon(d, 'damage', -2)).toBe(-2);
    expect(paragonFree(d)).toBe(2);
  });

  it('Paragon plafonné par statistique', () => {
    const d = defaultSave(0);
    d.meta.account.paragon = 1000;
    const cap = META.paragon.find((p) => p.stat === 'cooldown')?.cap ?? 0;
    expect(spendParagon(d, 'cooldown', 999)).toBe(cap);
  });
});

describe('Ascension', () => {
  it('modificateurs cumulés, récompense, paliers ouverts un à un', () => {
    const m = ascensionMods(6);
    expect(m.enemyHp).toBeCloseTo(1.1 * 1.1);
    expect(m.density).toBeCloseTo(1.08);
    expect(ascensionMods(0)).toEqual({});
    expect(ascensionReward(10)).toBeCloseTo(1 + 10 * META.ascension.rewardPerTier);
    const d = defaultSave(0);
    expect(recordAscension(d, 'forest', 0)).toBe(1);
    expect(recordAscension(d, 'forest', 0)).toBeNull();
    selectAscension(d, 'forest', 5);
    expect(ascensionSelected(d, 'forest')).toBe(1);
    expect(recordAscension(d, 'forest', 1)).toBe(2);
    expect(ascensionSelected(d, 'desert')).toBe(0);
  });
});

describe('reliques', () => {
  it('tirage, valeurs selon rareté et niveau, emplacements ouverts, forge', () => {
    const d = rich();
    const rng = new Rng('reliques');
    const item = grantRelic(d, rng, 'war-sigil', 1);
    if (!item) throw new Error('relique');
    expect(item.rarity).toBeGreaterThanOrEqual(1);
    expect(item.stats).toHaveLength(META.relics.rarities[item.rarity].secondaries);
    expect(item.stats.every((s) => s.stat !== 'damage')).toBe(true);
    const mult = META.relics.rarities[item.rarity].mult;
    expect(relicStats(item).damage).toBeCloseTo(0.06 * mult);
    const cost = upgradeCost(item) ?? 0;
    expect(upgradeRelic(d, item.uid)).toBe(true);
    expect(d.wallet.fragments).toBe(1e6 - cost);
    expect(relicStats(item).damage).toBeCloseTo(0.06 * mult * (1 + META.relics.levelBonus));
    const before = JSON.stringify(item.stats);
    expect(rerollRelic(d, item.uid, rng)).toBe(true);
    expect(JSON.stringify(item.stats)).not.toBe(before);
    expect(equipRelic(d, item.uid, 0)).toBe(true);
    expect(equipRelic(d, item.uid, 1)).toBe(false);
    expect(equippedRelics(d)).toEqual([item]);
    expect(metaBonus(d).run.stats.damage).toBeCloseTo(relicStats(item).damage ?? 0);
    expect(buyCache(d, rng)).toBeNull();
    levelTo(d, 3);
    expect(buyCache(d, rng)).not.toBeNull();
    const value = salvageRelic(d, item.uid);
    expect(value).toBeGreaterThan(0);
    expect(equippedRelics(d)).toEqual([]);
  });
});

describe('maîtrise', () => {
  it('rangs, bonus de dégâts, apparences débloquées', () => {
    const d = defaultSave(0);
    const id = WEAPONS[0].id;
    expect(masteryRank(0)).toBe(0);
    expect(selectSkin(d, id, 0)).toBe(false);
    const need = META.mastery.ranks[2] / META.mastery.xpPerDamage;
    expect(addMastery(d, id, need)).toBe(3);
    expect(addMastery(d, id, 1)).toBeNull();
    expect(selectSkin(d, id, 0)).toBe(true);
    expect(selectSkin(d, id, 1)).toBe(false);
    const b = masteryBonus(d);
    expect(b.damage[0]).toBeCloseTo(1 + 3 * META.mastery.damagePerRank);
    expect(b.tint[0]).not.toBe(0);
    expect(b.tint[1]).toBe(0);
  });
});

describe('codex', () => {
  it('découvertes uniques, paliers versés une seule fois', () => {
    const d = defaultSave(0);
    const all = codexEntries('reactions');
    expect(discover(d, 'reactions', [all[0], all[0], 'inconnu'])).toEqual([all[0]]);
    discover(d, 'reactions', all.slice(0, Math.ceil(all.length / 2)));
    expect(codexProgress(d, 'reactions')).toBeGreaterThanOrEqual(0.5);
    const first = claimCodex(d);
    expect(first.map((c) => c.tier)).toEqual([0, 1]);
    expect(claimCodex(d)).toEqual([]);
    expect(codexEntries('enemies')).not.toContain('goldling');
  });
});

describe('bilan de méta', () => {
  const input = (over: Partial<RunMetaInput> = {}): RunMetaInput => ({
    mode: 'campaign',
    stage: 'forest',
    stageName: 'Forêt brumeuse',
    victory: true,
    score: 8000,
    ascension: 0,
    seed: 'bilan',
    weapons: [{ id: WEAPONS[0].id, damage: 400000 }],
    enemies: ['mite'],
    evolutions: [],
    reactions: [],
    bosses: ['thornwalker', 'sentinel'],
    xpMult: 1,
    ...over,
  });

  it('entraînement : rien', () => {
    const d = defaultSave(0);
    expect(applyRunMeta(d, input({ mode: 'training' })).lines).toEqual([]);
    expect(d.meta.account.xp).toBe(0);
  });

  it('première défaite d’un mini-boss : sa relique ; victoire : Ascension 1 ; XP de compte', () => {
    const d = defaultSave(0);
    const r = applyRunMeta(d, input());
    expect(d.meta.relics.items[0].base).toBe('thorn-seed');
    expect(d.meta.relics.items[0].rarity).toBeGreaterThanOrEqual(1);
    expect(d.meta.ascension.forest.unlocked).toBe(1);
    expect(r.xp).toBe(Math.floor(8000 * META.account.scoreXp));
    expect(d.meta.codex.bosses).toEqual(['thornwalker', 'sentinel']);
    expect(d.meta.mastery[WEAPONS[0].id]).toBeGreaterThan(0);
    expect(r.lines.some((l) => l.startsWith('Relique'))).toBe(true);
    // Deuxième défaite : pas de relique garantie.
    const again = applyRunMeta(d, input({ bosses: ['thornwalker'], seed: 'x' }));
    expect(again.lines.filter((l) => l.includes('Graine de ronce'))).toEqual([]);
  });

  it('Ascension : récompense multipliée', () => {
    const d = defaultSave(0);
    const r = applyRunMeta(d, input({ ascension: 5, bosses: [] }));
    expect(r.xp).toBe(
      Math.floor(8000 * META.account.scoreXp * (1 + 5 * META.ascension.rewardPerTier)),
    );
  });

  it('libellés de statistiques', () => {
    expect(formatStat('damage', 0.12)).toBe('+12 % Dégâts');
    expect(formatStat('maxHp', 8)).toBe('+8 PV max');
    expect(BOSSES.length).toBeGreaterThan(0);
  });
});
