/**
 * 200 succès (config/achievements.json) : chaque succès lit une mesure de la carrière ou de
 * la progression ; il se débloque dès que la mesure atteint sa valeur et verse ses fragments.
 */
import { ACHIEVEMENTS, META, WEAPONS, type AchievementDef } from '../content/data';
import type { SaveData } from '../save/schema';
import { ascensionOpen } from './account';
import { codexEntries, type CodexCategory } from './codex';
import { masteryRank } from './mastery';

/** Valeur actuelle de la mesure d'un succès. */
export function metricValue(d: SaveData, a: AchievementDef): number {
  const s = d.stats;
  const m = d.meta;
  switch (a.metric) {
    case 'kills':
      return s.kills;
    case 'runs':
      return s.runs;
    case 'victories':
      return s.victories;
    case 'elites':
      return s.elites;
    case 'bosses':
      return s.bosses;
    case 'eveils':
      return s.eveils;
    case 'reactions':
      return s.reactions;
    case 'gold':
      return s.gold;
    case 'chests':
      return s.chests;
    case 'playHours':
      return s.playSeconds / 3600;
    case 'bestLevel':
      return s.bestLevel;
    case 'stageClear':
      return d.profile.cleared.includes(a.key) ? 1 : 0;
    case 'ascension': {
      const all: Partial<Record<string, { won?: number }>> = m.ascension;
      return ascensionOpen(d) ? (all[a.key]?.won ?? 0) : 0;
    }
    case 'boss':
      return m.codex.bosses.includes(a.key) ? 1 : 0;
    case 'character':
      return d.profile.unlocked.includes(a.key) ? 1 : 0;
    case 'charWin':
      return s.charWins[a.key] ?? 0;
    case 'reaction':
      return m.codex.reactions.includes(a.key) ? 1 : 0;
    case 'codex': {
      const cat = a.key as CodexCategory;
      return m.codex[cat].length >= codexEntries(cat).length ? 1 : 0;
    }
    case 'evolutions':
      return m.codex.evolutions.length;
    case 'accountLevel':
      return m.account.level;
    case 'paragon':
      return m.account.paragon;
    case 'talentRanks':
      return Object.values(m.talents).reduce((t, r) => t + r, 0);
    case 'relics':
      return m.relics.items.length;
    case 'relicLegendary':
      return m.relics.items.some((r) => r.rarity >= META.relics.rarities.length - 1) ? 1 : 0;
    case 'relicMaxLevel':
      return m.relics.items.some((r) => r.level >= META.relics.maxLevel) ? 1 : 0;
    case 'mastery3':
      return WEAPONS.filter((w) => masteryRank(m.mastery[w.id] ?? 0) >= 3).length;
    case 'mastery10':
      return WEAPONS.filter((w) => masteryRank(m.mastery[w.id] ?? 0) >= 10).length;
    case 'endlessMinutes':
      return (d.modes.endless.board[0]?.time ?? 0) / 60;
    case 'daily':
      return s.daily;
    case 'weekly':
      return s.weekly;
    case 'bossRushWin':
      return d.modes.bossRush.bestTime > 0 ? 1 : 0;
    case 'bossRushBosses':
      return d.modes.bossRush.bestBosses;
    case 'hardcoreWins':
      return d.modes.hardcore.victories;
    case 'bestRank':
      return d.profile.bestRank;
    case 'bestStreak':
      return d.retention.streak.best;
    case 'seasonTier':
      return d.retention.season.best;
    case 'quests':
      return d.retention.quests.done;
  }
}

/** Progression d'un succès : valeur (plafonnée à la cible) et cible. */
export function achievementProgress(d: SaveData, a: AchievementDef): [number, number] {
  return [Math.min(a.value, metricValue(d, a)), a.value];
}

/** Débloque les succès atteints et verse leurs fragments ; renvoie les nouveaux. */
export function evaluateAchievements(d: SaveData): AchievementDef[] {
  const done = new Set(d.retention.achievements);
  const fresh: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (done.has(a.id) || metricValue(d, a) < a.value) continue;
    d.retention.achievements.push(a.id);
    d.wallet.fragments += a.reward;
    fresh.push(a);
  }
  return fresh;
}
