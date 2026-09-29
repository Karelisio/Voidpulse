/** Stockage clé → texte de la sauvegarde (navigateur ; Preferences Capacitor sur Android). */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class LocalStore implements KeyValueStore {
  get(key: string): Promise<string | null> {
    try {
      return Promise.resolve(localStorage.getItem(key));
    } catch {
      return Promise.resolve(null);
    }
  }

  set(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(key, value);
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch {
      /* stockage indisponible */
    }
    return Promise.resolve();
  }
}

/** Stockage en mémoire (tests, navigation privée). */
export class MemoryStore implements KeyValueStore {
  readonly map = new Map<string, string>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.map.get(key) ?? null);
  }

  set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
    return Promise.resolve();
  }

  remove(key: string): Promise<void> {
    this.map.delete(key);
    return Promise.resolve();
  }
}
