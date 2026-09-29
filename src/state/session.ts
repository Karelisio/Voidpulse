/**
 * Session de jeu : à l'ouverture (et au retour au premier plan), horloge, quêtes, saison,
 * coffre et série de connexion ; au passage en arrière-plan, plan des notifications locales.
 */
import { create } from 'zustand';
import { readNow } from '../meta/clock';
import { NOTIFY_ID, notificationPlan } from '../meta/notify-plan';
import { openApp, type OpenResult } from '../meta/retention';
import { scheduleNotifications } from '../platform/notify';
import { useSave } from './save';

interface SessionState {
  /** Bilan de la dernière ouverture (série du jour…), effacé une fois vu. */
  welcome: OpenResult | null;
  dismissWelcome: () => void;
}

export const useSession = create<SessionState>((set) => ({
  welcome: null,
  dismissWelcome: () => {
    set({ welcome: null });
  },
}));

function open(): void {
  if (useSave.getState().status !== 'ready') return;
  let result: OpenResult | null = null;
  void useSave.getState().commit((d) => {
    result = openApp(d);
  });
  const r = result as OpenResult | null;
  if (r && (r.streak || r.seasonGranted > 0)) useSession.setState({ welcome: r });
}

export function syncNotifications(): void {
  const d = useSave.getState().data;
  void scheduleNotifications(notificationPlan(d, readNow(d)), Object.values(NOTIFY_ID));
}

/** À appeler une fois la sauvegarde chargée. */
export function startSession(): void {
  open();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) syncNotifications();
    else open();
  });
}
