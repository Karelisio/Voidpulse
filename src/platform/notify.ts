/**
 * Notifications locales : plugin Capacitor LocalNotifications sur Android ; sur le web, aucune.
 * L'icône de notification (monochrome) est `ic_stat_voidpulse` (res/drawable).
 */
import { LocalNotifications } from '@capacitor/local-notifications';
import type { PlannedNotification } from '../meta/notify-plan';
import { isNative } from './native';

function plugin(): typeof LocalNotifications | null {
  return isNative() ? LocalNotifications : null;
}

export const notificationsAvailable = (): boolean => plugin() !== null;

/** Demande l'autorisation (à l'activation par le joueur) ; false si refusée ou indisponible. */
export async function requestNotifications(): Promise<boolean> {
  const p = plugin();
  if (!p) return false;
  try {
    return (await p.requestPermissions()).display === 'granted';
  } catch {
    return false;
  }
}

/** Remplace les notifications planifiées par `plan` (ids connus annulés d'abord). */
export async function scheduleNotifications(
  plan: readonly PlannedNotification[],
  ids: readonly number[],
): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    await p.cancel({ notifications: ids.map((id) => ({ id })) });
    if (plan.length === 0) return;
    await p.schedule({
      notifications: plan.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        schedule: { at: new Date(n.at) },
        smallIcon: 'ic_stat_voidpulse',
      })),
    });
  } catch (e) {
    console.warn('Notifications indisponibles :', e);
  }
}
