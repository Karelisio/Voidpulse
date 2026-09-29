/**
 * Notifications locales facultatives (désactivées par défaut) : nouvelles quêtes et nouveau
 * défi du jour le lendemain matin, coffre hors ligne plein. Le plan est recalculé à chaque
 * passage en arrière-plan et remplace le précédent.
 */
import { RETENTION } from '../content/data';
import type { SaveData } from '../save/schema';
import { chestAmount, chestCapacity, chestFullAt } from './chest';
import { nextLocalHour } from './clock';

export interface PlannedNotification {
  id: number;
  at: number;
  title: string;
  body: string;
}

export const NOTIFY_ID = { DAILY: 1, CHEST: 2 } as const;

export function notificationPlan(d: SaveData, now: number): PlannedNotification[] {
  const n = d.retention.notifications;
  if (!n.enabled) return [];
  const out: PlannedNotification[] = [];
  if (n.quests || n.challenge) {
    const parts = [n.quests ? 'nouvelles quêtes' : '', n.challenge ? 'nouveau défi du jour' : '']
      .filter((x) => x !== '')
      .join(' et ');
    out.push({
      id: NOTIFY_ID.DAILY,
      at: nextLocalHour(now, RETENTION.notifications.hour),
      title: 'Voidpulse',
      body: `${parts.charAt(0).toUpperCase()}${parts.slice(1)} disponibles.`,
    });
  }
  if (n.chest && d.retention.chest.last > 0 && chestAmount(d, now) < chestCapacity(d)) {
    out.push({
      id: NOTIFY_ID.CHEST,
      at: chestFullAt(d),
      title: 'Coffre hors ligne plein',
      body: `${String(chestCapacity(d))} fragments vous attendent.`,
    });
  }
  return out.filter((x) => x.at > now);
}
