/**
 * Sauvegarde du joueur dans l'interface : chargement au lancement, modifications immuables
 * (écriture différée), application des réglages au moteur audio, écriture immédiate en fin de
 * run et à la mise en arrière-plan.
 */
import { create } from 'zustand';
import { audio, initAudio } from '../audio';
import { LocalStore } from '../save/backend';
import { exportSave, importSave } from '../save/codec';
import { defaultSave, type SaveData } from '../save/schema';
import { SaveStore } from '../save/store';

const store = new SaveStore(new LocalStore());

interface SaveState {
  data: SaveData;
  status: 'loading' | 'ready' | 'error';
  /** Message affiché si la sauvegarde n'a pas pu être lue. */
  error: string | null;
  /** Modifie une copie de la sauvegarde et programme son écriture. */
  update: (fn: (d: SaveData) => void) => void;
  /** Idem, écrite tout de suite (fin de run). */
  commit: (fn: (d: SaveData) => void) => Promise<void>;
  exportText: () => string;
  importText: (text: string) => Promise<void>;
  reset: () => Promise<void>;
}

function applyAudio(d: SaveData): void {
  audio()?.apply(d.audio);
}

export const useSave = create<SaveState>((set, get) => ({
  data: defaultSave(),
  status: 'loading',
  error: null,
  update: (fn) => {
    const next = structuredClone(get().data);
    fn(next);
    set({ data: next });
    applyAudio(next);
    if (get().status === 'ready') store.schedule(next);
  },
  commit: async (fn) => {
    const next = structuredClone(get().data);
    fn(next);
    set({ data: next });
    if (get().status === 'ready') await store.saveNow(next);
  },
  exportText: () => exportSave(get().data),
  importText: async (text) => {
    const data = importSave(text);
    set({ data });
    applyAudio(data);
    await store.saveNow(data);
  },
  reset: async () => {
    await store.reset();
    const data = defaultSave();
    set({ data });
    applyAudio(data);
    await store.saveNow(data);
  },
}));

/** Charge la sauvegarde au démarrage de l'application. */
export async function initSave(): Promise<void> {
  try {
    const res = await store.load();
    useSave.setState({ data: res.data, status: 'ready', error: null });
    if (res.recovered) console.warn('Sauvegarde : un emplacement corrompu a été ignoré.');
  } catch (e) {
    // Sauvegarde illisible (version plus récente) : on joue sans écrire pour ne pas l'écraser.
    useSave.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
  void initAudio().then(() => {
    applyAudio(useSave.getState().data);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void store.flush();
  });
}
