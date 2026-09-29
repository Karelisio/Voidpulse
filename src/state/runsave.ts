/**
 * Partie en cours sauvegardée pour être reprise après une fermeture de l'application :
 * instantané de la simulation et informations du mode, écrits aux pauses naturelles (choix de
 * niveau, coffre, marchand, pause, arrière-plan) et effacés en fin de partie ou en quittant.
 * Un instantané d'une autre version du jeu est ignoré (données de contenu différentes).
 */
import { create } from 'zustand';
import type { ModeId } from '../content/data';
import type { MetaBonus } from '../meta/bonus';
import type { ModeRun } from '../modes/modes';
import type { KeyValueStore } from '../save/backend';
import { decode, encode, SNAPSHOT_VERSION, type Encoded, type RunSnapshot } from '../systems/snapshot';
import { kvStore } from './kv';

export const RUN_SAVE_KEY = 'voidpulse.run.v1';
const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.0.0-dev';

/** Partie en cours : ce que le mode a construit, et si l'essai du jour est compté. */
export interface ActiveRun {
  mode: ModeId;
  run: ModeRun;
  counted: boolean;
  /** Bonus de méta figés au lancement (fragments et XP de compte en fin de partie). */
  meta: MetaBonus;
}

export interface SavedRun {
  savedAt: number;
  active: ActiveRun;
  snapshot: RunSnapshot;
}

interface Payload {
  version: number;
  app: string;
  savedAt: number;
  active: Encoded;
  snapshot: RunSnapshot;
}

export function encodeRun(saved: SavedRun, app = APP_VERSION): string {
  const payload: Payload = {
    version: SNAPSHOT_VERSION,
    app,
    savedAt: saved.savedAt,
    active: encode(saved.active),
    snapshot: saved.snapshot,
  };
  return JSON.stringify(payload);
}

/** Partie lisible et de la même version du jeu, sinon null. */
export function decodeRun(text: string | null, app = APP_VERSION): SavedRun | null {
  if (!text) return null;
  try {
    const p = JSON.parse(text) as Partial<Payload>;
    if (p.version !== SNAPSHOT_VERSION || p.app !== app || !p.snapshot || !p.active) return null;
    if (p.snapshot.version !== SNAPSHOT_VERSION) return null;
    return {
      savedAt: p.savedAt ?? 0,
      active: decode(p.active) as ActiveRun,
      snapshot: p.snapshot,
    };
  } catch {
    return null;
  }
}

interface RunSaveState {
  /** Partie à reprendre (chargée au lancement). */
  saved: SavedRun | null;
  /** Reprise demandée depuis l'accueil : l'écran de jeu la consomme. */
  resuming: boolean;
  setResuming: (on: boolean) => void;
}

export const useRunSave = create<RunSaveState>((set) => ({
  saved: null,
  resuming: false,
  setResuming: (resuming) => {
    set({ resuming });
  },
}));

let kv: KeyValueStore = kvStore;
/** Écritures sérialisées : la dernière demandée l'emporte. */
let writing: Promise<void> = Promise.resolve();

/** Tests : stockage de remplacement. */
export function setRunStore(store: KeyValueStore): void {
  kv = store;
}

// --- Compression (colonnes des pools : surtout des zéros, ~1 Mo → quelques dizaines de ko) ---

const GZ = 'gz:';

async function pipe(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Texte compressé (gzip + base64) si le moteur le permet, sinon tel quel. */
export async function pack(text: string): Promise<string> {
  if (typeof CompressionStream === 'undefined') return text;
  const gz = await pipe(new TextEncoder().encode(text), new CompressionStream('gzip'));
  return GZ + toBase64(gz);
}

export async function unpack(stored: string | null): Promise<string | null> {
  if (!stored?.startsWith(GZ)) return stored;
  if (typeof DecompressionStream === 'undefined') return null;
  const bin = atob(stored.slice(GZ.length));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(await pipe(bytes, new DecompressionStream('gzip')));
}

export async function loadRun(): Promise<SavedRun | null> {
  let saved: SavedRun | null;
  try {
    saved = decodeRun(await unpack(await kv.get(RUN_SAVE_KEY)));
  } catch {
    saved = null;
  }
  if (!saved) await kv.remove(RUN_SAVE_KEY);
  useRunSave.setState({ saved });
  return saved;
}

export function saveRun(active: ActiveRun, snapshot: RunSnapshot): Promise<void> {
  const saved: SavedRun = { savedAt: Date.now(), active, snapshot };
  useRunSave.setState({ saved });
  const text = encodeRun(saved);
  writing = writing
    .then(async () => {
      // Partie terminée ou abandonnée entre-temps : rien à écrire.
      if (useRunSave.getState().saved !== saved) return;
      await kv.set(RUN_SAVE_KEY, await pack(text));
    })
    .catch((e: unknown) => {
      // Stockage plein ou indisponible : la partie ne pourra simplement pas être reprise.
      console.warn('Partie en cours non sauvegardée :', e);
    });
  return writing;
}

export function clearRun(): Promise<void> {
  useRunSave.setState({ saved: null });
  writing = writing.then(() => kv.remove(RUN_SAVE_KEY)).catch(() => undefined);
  return writing;
}
