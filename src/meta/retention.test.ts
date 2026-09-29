import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, RETENTION } from '../content/data';
import { defaultSave, type SaveData } from '../save/schema';
import { achievementProgress, evaluateAchievements, metricValue } from './achievements';
import { chestAmount, chestCapacity, claimChest } from './chest';
import { dayNumber, localDay, nextLocalHour, readNow, safeNow } from './clock';
import { notificationPlan, NOTIFY_ID } from './notify-plan';
import { applyTally, claimQuest, questsReady, refreshQuests, rerollQuest } from './quests';
import { achievementLines, applyRunRetention, openApp } from './retention';
import {
  addSeasonXp,
  claimAllSeason,
  claimSeasonTier,
  seasonIndex,
  seasonInfo,
  seasonTier,
  syncSeason,
  tierReward,
} from './season';
import { checkIn, streakReward } from './streak';
import type { RunTally } from './tally';

const H = 3600000;
/** Mardi 29 septembre 2026, 14 h (heure locale). */
const T0 = new Date(2026, 8, 29, 14).getTime();
const at = (days: number, hour = 14): number => new Date(2026, 8, 29 + days, hour).getTime();

const tally = (over: Partial<RunTally> = {}): RunTally => ({
  mode: 'campaign',
  character: 'vex',
  victory: false,
  kills: 500,
  elites: 3,
  bosses: 1,
  reactions: 100,
  eveils: 1,
  seconds: 600,
  gold: 200,
  chests: 3,
  level: 20,
  elementDamage: { fire: 50000 },
  ...over,
});

describe('horloge protégée', () => {
  it('un retour en arrière est ignoré au-delà de la tolérance', () => {
    const d = defaultSave(0);
    expect(safeNow(d, T0)).toBe(T0);
    expect(safeNow(d, T0 - 60000)).toBe(T0 - 60000);
    expect(readNow(d, T0 - 2 * H)).toBe(T0);
    expect(safeNow(d, T0 + H)).toBe(T0 + H);
    expect(d.retention.clock.max).toBe(T0 + H);
  });

  it('jours locaux et prochaine heure', () => {
    expect(localDay(T0)).toBe('2026-09-29');
    expect(dayNumber('2026-10-01') - dayNumber('2026-09-29')).toBe(2);
    expect(new Date(nextLocalHour(T0, 9)).getDate()).toBe(30);
    expect(new Date(nextLocalHour(at(0, 7), 9)).getDate()).toBe(29);
  });
});

describe('quêtes', () => {
  it('3 du jour et 5 de la semaine, identiques pour une date, renouvelées', () => {
    const a = defaultSave(0);
    const b = defaultSave(0);
    refreshQuests(a, T0);
    refreshQuests(b, T0 + H);
    expect(a.retention.quests.daily).toHaveLength(RETENTION.quests.daily);
    expect(a.retention.quests.weekly).toHaveLength(RETENTION.quests.weekly);
    expect(b.retention.quests.daily).toEqual(a.retention.quests.daily);
    expect(refreshQuests(a, T0 + 2 * H)).toEqual({ daily: false, weekly: false });
    expect(refreshQuests(a, at(1))).toEqual({ daily: true, weekly: false });
    // Lundi 5 octobre : nouvelle semaine.
    expect(refreshQuests(a, at(6)).weekly).toBe(true);
  });

  it('progression cumulée ou meilleure valeur, réclamation, relance', () => {
    const d = defaultSave(0);
    const q = d.retention.quests;
    q.day = localDay(T0);
    q.rerolls = 1;
    q.daily = [
      { id: 'kills', target: 600, progress: 0, claimed: false },
      { id: 'level', target: 25, progress: 0, claimed: false },
      { id: 'dmg-fire', target: 60000, progress: 0, claimed: false },
    ];
    expect(applyTally(d, tally())).toEqual([]);
    expect(q.daily.map((s) => s.progress)).toEqual([500, 20, 50000]);
    const done = applyTally(d, tally({ level: 30, kills: 200, elementDamage: { fire: 20000 } }));
    expect(done).toHaveLength(3);
    expect(q.daily.map((s) => s.progress)).toEqual([600, 25, 60000]);
    expect(applyTally(d, tally({ mode: 'training' }))).toEqual([]);
    expect(questsReady(d)).toBe(3);
    const before = d.wallet.fragments;
    expect(claimQuest(d, 'daily', 0)).toBe(true);
    expect(claimQuest(d, 'daily', 0)).toBe(false);
    expect(d.wallet.fragments).toBe(before + RETENTION.quests.rewards.daily.fragments);
    expect(d.retention.season.xp).toBe(RETENTION.quests.rewards.daily.seasonXp);
    expect(q.done).toBe(1);
    expect(rerollQuest(d, 0)).toBe(false);
    expect(rerollQuest(d, 1)).toBe(true);
    expect(q.daily[1].id).not.toBe('level');
    expect(rerollQuest(d, 2)).toBe(false);
  });
});

describe('série de connexion', () => {
  it('jours consécutifs, même jour, jour manqué peu puni', () => {
    const d = defaultSave(0);
    expect(checkIn(d, '2026-09-29')).toEqual({ count: 1, reward: streakReward(1) });
    expect(checkIn(d, '2026-09-29')).toBeNull();
    expect(checkIn(d, '2026-09-30')?.count).toBe(2);
    expect(checkIn(d, '2026-10-01')?.count).toBe(3);
    // Un jour manqué : la série stagne au lieu de repartir à 1.
    expect(checkIn(d, '2026-10-03')?.count).toBe(3);
    expect(checkIn(d, '2026-10-20')?.count).toBe(1);
    expect(d.retention.streak.best).toBe(3);
  });

  it('récompenses croissantes, bonus par semaine', () => {
    expect(streakReward(7)).toBeGreaterThan(streakReward(1));
    expect(streakReward(8)).toBeCloseTo(streakReward(1) * (1 + RETENTION.streak.weekBonus), 0);
  });
});

describe('passe de saison', () => {
  it('saisons de 6 semaines depuis l’époque, thème', () => {
    const epoch = new Date(2026, 0, 5, 12).getTime();
    expect(seasonIndex(epoch)).toBe(0);
    expect(seasonIndex(epoch + 41 * 24 * H)).toBe(0);
    expect(seasonIndex(epoch + 42 * 24 * H)).toBe(1);
    expect(seasonInfo(epoch).daysLeft).toBe(42);
  });

  it('paliers, récompenses, relique aux paliers ronds, fin de saison', () => {
    const d = defaultSave(0);
    syncSeason(d, T0);
    addSeasonXp(d, RETENTION.season.xpPerTier * 12.5);
    expect(seasonTier(d)).toBe(12);
    expect(tierReward(10).relic).toBeDefined();
    expect(tierReward(3).relic).toBeUndefined();
    expect(claimSeasonTier(d, 13)).toBe(false);
    expect(claimSeasonTier(d, 10)).toBe(true);
    expect(d.meta.relics.items).toHaveLength(1);
    expect(claimAllSeason(d)).toBe(11);
    addSeasonXp(d, RETENTION.season.xpPerTier * 2);
    // Saison suivante : les paliers 13 et 14 atteints sont versés d'office.
    expect(syncSeason(d, T0 + 42 * 24 * H)).toBe(2);
    expect(d.retention.season.xp).toBe(0);
    expect(d.retention.season.best).toBe(14);
  });
});

describe('coffre hors ligne', () => {
  it('remplissage, plafond, relevé, horloge reculée sans effet', () => {
    const d = defaultSave(0);
    openApp(d, T0);
    expect(chestAmount(d, T0)).toBe(0);
    expect(chestAmount(d, T0 + 2 * H)).toBe(Math.floor(RETENTION.chest.perHour * 2));
    expect(chestAmount(d, T0 + 100 * H)).toBe(chestCapacity(d));
    expect(claimChest(d, T0 + 4 * H)).toBe(RETENTION.chest.perHour * 4);
    expect(claimChest(d, T0 + 4 * H)).toBe(0);
    // Horloge reculée d'un jour : l'instant sûr reste le plus grand vu.
    const now = safeNow(d, T0 - 24 * H);
    expect(chestAmount(d, now)).toBe(0);
  });
});

describe('succès', () => {
  it('déblocage et récompense une seule fois, progression', () => {
    const d = defaultSave(0);
    const first = ACHIEVEMENTS.find((a) => a.id === 'runs-1');
    if (!first) throw new Error('succès');
    expect(achievementProgress(d, first)).toEqual([0, 1]);
    d.stats.runs = 1;
    const fresh = evaluateAchievements(d);
    expect(fresh.map((a) => a.id)).toContain('runs-1');
    expect(d.wallet.fragments).toBe(fresh.reduce((s, a) => s + a.reward, 0));
    expect(evaluateAchievements(d)).toEqual([]);
  });

  it('toutes les mesures se lisent sur une sauvegarde neuve', () => {
    const d = defaultSave(0);
    for (const a of ACHIEVEMENTS) expect(Number.isFinite(metricValue(d, a)), a.id).toBe(true);
    expect(evaluateAchievements(d)).toEqual([]);
  });
});

describe('notifications et entrées', () => {
  it('désactivées par défaut ; plan du lendemain et du coffre plein', () => {
    const d: SaveData = defaultSave(0);
    openApp(d, T0);
    expect(notificationPlan(d, T0)).toEqual([]);
    d.retention.notifications.enabled = true;
    const plan = notificationPlan(d, T0 + H);
    expect(plan.map((p) => p.id).sort()).toEqual([NOTIFY_ID.DAILY, NOTIFY_ID.CHEST]);
    expect(new Date(plan.find((p) => p.id === NOTIFY_ID.DAILY)?.at ?? 0).getHours()).toBe(
      RETENTION.notifications.hour,
    );
    d.retention.notifications.chest = false;
    expect(notificationPlan(d, T0 + H).map((p) => p.id)).toEqual([NOTIFY_ID.DAILY]);
  });

  it('ouverture puis fin de partie : série, quêtes, saison, carrière, succès', () => {
    const d = defaultSave(0);
    const open = openApp(d, T0);
    expect(open.streak?.count).toBe(1);
    expect(open.questsRenewed).toBe(true);
    expect(openApp(d, T0 + H).streak).toBeNull();
    applyRunRetention(d, tally({ victory: true }), 20000, T0 + 2 * H);
    const lines = achievementLines(d);
    expect(d.stats.runs).toBe(1);
    expect(d.stats.charWins.vex).toBe(1);
    expect(d.retention.season.xp).toBe(Math.floor(20000 * RETENTION.season.scoreXp));
    expect(lines.some((l) => l.startsWith('Succès : '))).toBe(true);
    const training = applyRunRetention(d, tally({ mode: 'training' }), 20000, T0 + 3 * H);
    expect(training.filter((l) => l.startsWith('Quête'))).toEqual([]);
    expect(d.stats.runs).toBe(1);
  });
});
