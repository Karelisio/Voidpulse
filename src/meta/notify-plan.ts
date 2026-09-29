/**
 * Notifications locales facultatives (désactivées par défaut) : nouvelles quêtes et nouveau
 * défi du jour le lendemain matin, coffre hors ligne plein. Le plan est recalculé à chaque
 * passage en arrière-plan et remplace le précédent.
 */
import { RETENTION } from '../content/data';
import { t } from '../i18n';
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
    out.push({
      id: NOTIFY_ID.DAILY,
      at: nextLocalHour(now, RETENTION.notifications.hour),
      title: 'Voidpulse',
      body: t(
        n.quests && n.challenge
          ? 'lines.notifyDaily'
          : n.quests
            ? 'lines.notifyQuests'
            : 'lines.notifyChallenge',
      ),
    });
  }
  if (n.chest && d.retention.chest.last > 0 && chestAmount(d, now) < chestCapacity(d)) {
    out.push({
      id: NOTIFY_ID.CHEST,
      at: chestFullAt(d),
      title: t('lines.notifyChestTitle'),
      body: t('lines.notifyChest', { n: chestCapacity(d) }),
    });
  }
  return out.filter((x) => x.at > now);
}
