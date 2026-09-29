/**
 * Notifications locales : Capacitor LocalNotifications quand l'application tourne sur Android
 * (plugin détecté à l'exécution, rien n'est importé sur le web) ; sinon, aucune.
 */
import type { PlannedNotification } from '../meta/notify-plan';

interface LocalNotificationsPlugin {
  requestPermissions: () => Promise<{ display: string }>;
  cancel: (o: { notifications: { id: number }[] }) => Promise<void>;
  schedule: (o: {
    notifications: { id: number; title: string; body: string; schedule: { at: Date } }[];
  }) => Promise<unknown>;
}

function plugin(): LocalNotificationsPlugin | null {
  const cap = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  const p = cap?.Plugins?.LocalNotifications;
  return p ? (p as LocalNotificationsPlugin) : null;
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
      })),
    });
  } catch (e) {
    console.warn('Notifications indisponibles :', e);
  }
}
