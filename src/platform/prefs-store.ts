/** Stockage de la sauvegarde dans Capacitor Preferences (SharedPreferences sur Android). */
import { Preferences } from '@capacitor/preferences';
import type { KeyValueStore } from '../save/backend';

export class PreferencesStore implements KeyValueStore {
  async get(key: string): Promise<string | null> {
    return (await Preferences.get({ key })).value;
  }

  async set(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  }

  async remove(key: string): Promise<void> {
    await Preferences.remove({ key });
  }
}

/**
 * Première ouverture native : reprend la sauvegarde laissée dans le localStorage de la WebView
 * (versions précédentes), sans écraser une sauvegarde Preferences existante.
 */
export async function migrateFromLocalStorage(
  store: KeyValueStore,
  keys: readonly string[],
): Promise<void> {
  for (const key of keys) {
    let legacy: string | null;
    try {
      legacy = localStorage.getItem(key);
    } catch {
      return;
    }
    if (legacy === null || (await store.get(key)) !== null) continue;
    await store.set(key, legacy);
  }
}
