/**
 * Quêtes : 3 quotidiennes et 5 hebdomadaires, tirées d'une graine datée (les mêmes pour
 * tous), renouvelées à minuit et chaque lundi. Progression à chaque fin de partie (hors
 * entraînement), récompenses à réclamer (fragments et XP de saison). Une relance par jour.
 */
import { RETENTION, type QuestTemplateDef } from '../content/data';
import { Rng } from '../engine/rng';
import { num } from '../i18n';
import { dayKey, weekKey } from '../modes/modes';
import type { QuestSlot, SaveData } from '../save/schema';
import { addSeasonXp } from './season';
import type { RunTally } from './tally';

const Q = RETENTION.quests;
const BY_ID = new Map(Q.templates.map((t) => [t.id, t]));

export type QuestPeriod = 'daily' | 'weekly';

export function questTemplate(id: string): QuestTemplateDef | undefined {
  return BY_ID.get(id);
}

function draw(seed: string, n: number, period: QuestPeriod): QuestSlot[] {
  const rng = new Rng(seed);
  const pool = [...Q.templates];
  const out: QuestSlot[] = [];
  while (out.length < n && pool.length > 0) {
    const t = pool.splice(rng.int(pool.length), 1)[0];
    out.push({ id: t.id, target: t[period], progress: 0, claimed: false });
  }
  return out;
}

/** Renouvelle les quêtes si le jour ou la semaine a changé. */
export function refreshQuests(d: SaveData, now: number): { daily: boolean; weekly: boolean } {
  const q = d.retention.quests;
  const date = new Date(now);
  const day = dayKey(date);
  const week = weekKey(date);
  const out = { daily: false, weekly: false };
  if (q.day !== day) {
    q.day = day;
    q.daily = draw(`quests:${day}`, Q.daily, 'daily');
    q.rerolls = Q.dailyRerolls;
    out.daily = true;
  }
  if (q.week !== week) {
    q.week = week;
    q.weekly = draw(`quests:${week}`, Q.weekly, 'weekly');
    out.weekly = true;
  }
  return out;
}

/** Valeur d'une partie pour un modèle de quête. */
export function tallyValue(t: QuestTemplateDef, r: RunTally): number {
  switch (t.metric) {
    case 'kills':
      return r.kills;
    case 'elites':
      return r.elites;
    case 'bosses':
      return r.bosses;
    case 'reactions':
      return r.reactions;
    case 'eveils':
      return r.eveils;
    case 'minutes':
      return r.seconds / 60;
    case 'runs':
      return 1;
    case 'victories':
      return r.victory ? 1 : 0;
    case 'gold':
      return r.gold;
    case 'chests':
      return r.chests;
    case 'level':
      return r.level;
    case 'daily':
      return r.mode === 'daily' ? 1 : 0;
    case 'endlessMinutes':
      return r.mode === 'endless' ? r.seconds / 60 : 0;
    case 'elementDamage':
      return t.element ? (r.elementDamage[t.element] ?? 0) : 0;
  }
}

/** Fait progresser les quêtes ; renvoie les intitulés des quêtes tout juste terminées. */
export function applyTally(d: SaveData, r: RunTally): string[] {
  if (r.mode === 'training') return [];
  const q = d.retention.quests;
  const done: string[] = [];
  for (const slot of [...q.daily, ...q.weekly]) {
    const t = BY_ID.get(slot.id);
    if (!t || slot.claimed || slot.progress >= slot.target) continue;
    const v = tallyValue(t, r);
    slot.progress = Math.min(
      slot.target,
      t.kind === 'max' ? Math.max(slot.progress, v) : slot.progress + v,
    );
    if (slot.progress >= slot.target) done.push(questText(slot));
  }
  return done;
}

export function questText(slot: QuestSlot): string {
  const t = BY_ID.get(slot.id);
  return (t?.name ?? slot.id).replace('{n}', num(slot.target));
}

export const questReward = (period: QuestPeriod): { fragments: number; seasonXp: number } =>
  Q.rewards[period];

/** Réclame une quête terminée : fragments et XP de saison. */
export function claimQuest(d: SaveData, period: QuestPeriod, i: number): boolean {
  const slot = d.retention.quests[period][i] as QuestSlot | undefined;
  if (!slot || slot.claimed || slot.progress < slot.target) return false;
  slot.claimed = true;
  const r = Q.rewards[period];
  d.wallet.fragments += r.fragments;
  addSeasonXp(d, r.seasonXp);
  d.retention.quests.done++;
  return true;
}

/** Remplace une quête du jour non réclamée par une autre (relances limitées). */
export function rerollQuest(d: SaveData, i: number): boolean {
  const q = d.retention.quests;
  const slot = q.daily[i] as QuestSlot | undefined;
  if (!slot || slot.claimed || q.rerolls <= 0) return false;
  const used = new Set(q.daily.map((s) => s.id));
  const pool = Q.templates.filter((t) => !used.has(t.id));
  if (pool.length === 0) return false;
  const rng = new Rng(`reroll:${q.day}:${String(q.rerolls)}:${String(i)}`);
  const t = pool[rng.int(pool.length)];
  q.daily[i] = { id: t.id, target: t.daily, progress: 0, claimed: false };
  q.rerolls--;
  return true;
}

/** Quêtes terminées pas encore réclamées. */
export function questsReady(d: SaveData): number {
  const q = d.retention.quests;
  return [...q.daily, ...q.weekly].filter((s) => !s.claimed && s.progress >= s.target).length;
}
