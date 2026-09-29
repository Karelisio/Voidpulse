/**
 * Bonus permanents d'une partie : talents + Paragon + reliques équipées, maîtrise des armes.
 * Les effets de fin de partie (fragments, XP de compte) restent côté méta.
 */
import type { MetaStats } from '../content/data';
import type { SaveData } from '../save/schema';
import type { MetaRunBonus } from '../systems/state';
import { paragonStats } from './account';
import { masteryBonus } from './mastery';
import { relicsStats } from './relics';
import { addStats } from './stats';
import { talentStats } from './talents';

export interface MetaBonus {
  run: MetaRunBonus;
  /** Multiplicateurs des fragments ramenés et de l'XP de compte. */
  fragMult: number;
  xpMult: number;
}

export function metaTotals(d: SaveData): MetaStats {
  const all: MetaStats = {};
  addStats(all, talentStats(d));
  addStats(all, paragonStats(d));
  addStats(all, relicsStats(d));
  return all;
}

export function metaBonus(d: SaveData): MetaBonus {
  const all = metaTotals(d);
  const { revives = 0, fragments = 0, accountXp = 0, ...stats } = all;
  const m = masteryBonus(d);
  return {
    run: {
      stats,
      revives: Math.floor(revives),
      weaponDamage: m.damage,
      weaponTint: m.tint,
    },
    fragMult: 1 + fragments,
    xpMult: 1 + accountXp,
  };
}
