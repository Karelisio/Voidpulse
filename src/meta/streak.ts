/**
 * Série de connexion : un jour de plus à chaque premier lancement de la journée, récompense
 * croissante sur un cycle de 7 jours (+10 % par semaine complète, plafonné). Un jour manqué ne
 * remet pas la série à zéro : elle recule d'un jour par jour manqué.
 */
import { RETENTION } from '../content/data';
import type { SaveData } from '../save/schema';
import { dayNumber } from './clock';

const S = RETENTION.streak;

/** Récompense du jour `count` de la série (1 = premier jour). */
export function streakReward(count: number): number {
  const day = (count - 1) % S.rewards.length;
  const weeks = Math.min(S.maxWeekBonus, Math.floor((count - 1) / S.rewards.length));
  return Math.round(S.rewards[day] * (1 + S.weekBonus * weeks));
}

/** Premier lancement du jour : avance la série et verse la récompense (null : déjà fait). */
export function checkIn(d: SaveData, day: string): { count: number; reward: number } | null {
  const s = d.retention.streak;
  if (s.last === day) return null;
  if (s.last === '') s.count = 1;
  else {
    const gap = dayNumber(day) - dayNumber(s.last);
    // Horloge reculée : rien (l'horloge protégée l'empêche d'ordinaire).
    if (gap <= 0) return null;
    s.count = gap === 1 ? s.count + 1 : Math.max(1, s.count - (gap - 1) + 1);
  }
  s.last = day;
  s.best = Math.max(s.best, s.count);
  const reward = streakReward(s.count);
  d.wallet.fragments += reward;
  return { count: s.count, reward };
}
