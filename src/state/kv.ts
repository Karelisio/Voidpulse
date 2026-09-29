/** Stockage clé → texte de l'application : Preferences sur Android (sauvegardé par Android), localStorage sur le web. */
import { LocalStore, type KeyValueStore } from '../save/backend';
import { isNative } from '../platform/native';
import { PreferencesStore } from '../platform/prefs-store';

export const native = isNative();
export const kvStore: KeyValueStore = native ? new PreferencesStore() : new LocalStore();
