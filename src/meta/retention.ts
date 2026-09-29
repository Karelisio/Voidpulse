/**
 * Points d'entrée de la rétention : ouverture de l'application (horloge, quêtes, saison,
 * coffre, série de connexion) et fin de partie (carrière, quêtes, XP de saison, succès).
 */
import { RETENTION } from '../content/data';
import { t } from '../i18n';
import type { SaveData } from '../save/schema';
import { evaluateAchievements } from './achievements';
import { startChest } from './chest';
import { localDay, safeNow } from './clock';
import { applyTally, refreshQuests } from './quests';
import { addSeasonXp, seasonTier, syncSeason } from './season';
import { checkIn } from './streak';
import { recordLifetime, type RunTally } from './tally';

export interface OpenResult {
  now: number;
  /** Série du jour (null : déjà comptée aujourd'hui). */
  streak: { count: number; reward: number } | null;
  /** Paliers de la saison passée versés d'office. */
  seasonGranted: number;
  questsRenewed: boolean;
}

export function openApp(d: SaveData, device = Date.now()): OpenResult {
  const now = safeNow(d, device);
  const renewed = refreshQuests(d, now);
  const seasonGranted = syncSeason(d, now);
  startChest(d, now);
  const streak = checkIn(d, localDay(now));
  return { now, streak, seasonGranted, questsRenewed: renewed.daily || renewed.weekly };
}

/**
 * Bilan de rétention d'une partie : carrière, quêtes, XP de saison. À appeler avant les
 * déblocages (ils lisent la carrière) ; les succès se relèvent ensuite (`achievementLines`).
 */
export function applyRunRetention(
  d: SaveData,
  tally: RunTally,
  score: number,
  device = Date.now(),
): string[] {
  const lines: string[] = [];
  const now = safeNow(d, device);
  refreshQuests(d, now);
  syncSeason(d, now);
  recordLifetime(d, tally);
  if (tally.mode !== 'training') {
    for (const q of applyTally(d, tally)) lines.push(t('lines.questDone', { name: q }));
    const before = seasonTier(d);
    addSeasonXp(d, score * RETENTION.season.scoreXp);
    const after = seasonTier(d);
    if (after > before) lines.push(t('lines.seasonTier', { n: after }));
  }
  return lines;
}

/** Succès atteints (à relever en dernier, sur la progression à jour). */
export function achievementLines(d: SaveData): string[] {
  return evaluateAchievements(d).map((a) => t('lines.achievement', { name: a.name, n: a.reward }));
}
