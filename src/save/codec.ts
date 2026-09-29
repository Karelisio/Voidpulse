/**
 * Encodage de la sauvegarde : enveloppe d'emplacement (séquence + somme de contrôle), fusion
 * avec les valeurs par défaut (fichier ancien, partiel ou altéré), chaîne d'export/import.
 */
import { migrate } from './migrate';
import { defaultSave, type SaveData } from './schema';

/** Somme de contrôle FNV-1a 32 bits (détection d'écriture tronquée ou altérée). */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export interface SlotEnvelope {
  seq: number;
  sum: string;
  body: string;
}

export function encodeSlot(data: SaveData, seq: number): string {
  const body = JSON.stringify(data);
  return JSON.stringify({ seq, sum: checksum(body), body } satisfies SlotEnvelope);
}

/** Décode un emplacement ; null s'il est absent, illisible ou corrompu. */
export function decodeSlot(text: string | null): { seq: number; raw: unknown } | null {
  if (!text) return null;
  try {
    const env = JSON.parse(text) as Partial<SlotEnvelope>;
    if (
      typeof env.seq !== 'number' ||
      typeof env.body !== 'string' ||
      env.sum !== checksum(env.body)
    )
      return null;
    return { seq: env.seq, raw: JSON.parse(env.body) as unknown };
  } catch {
    return null;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Fusionne une valeur lue avec sa valeur par défaut : on garde la valeur lue seulement si elle
 * a le même type (nombres finis) ; les objets sont fusionnés récursivement. Un objet par défaut
 * vide est un dictionnaire libre (clés dynamiques) repris tel quel.
 */
export function mergeDefaults<T>(def: T, raw: unknown): T {
  if (isRecord(def)) {
    if (!isRecord(raw)) return def;
    const keys = Object.keys(def);
    if (keys.length === 0) return raw as T;
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = mergeDefaults(def[k], raw[k]);
    return out as T;
  }
  if (Array.isArray(def)) return (Array.isArray(raw) ? raw : def) as T;
  if (typeof def === 'number')
    return (typeof raw === 'number' && Number.isFinite(raw) ? raw : def) as T;
  if (typeof raw === typeof def) return raw as T;
  return def;
}

/** Données brutes (toute version) → sauvegarde courante complète. */
export function normalize(raw: unknown, now = Date.now()): SaveData {
  return mergeDefaults(defaultSave(now), migrate(raw));
}

const EXPORT_PREFIX = 'VOIDPULSE1:';

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Chaîne d'export (copiable, partageable) : préfixe + base64(JSON + somme). */
export function exportSave(data: SaveData): string {
  const body = JSON.stringify(data);
  return EXPORT_PREFIX + toBase64(JSON.stringify({ sum: checksum(body), body }));
}

export class ImportError extends Error {}

export function importSave(text: string): SaveData {
  const t = text.trim();
  if (!t.startsWith(EXPORT_PREFIX))
    throw new ImportError('Ce texte n’est pas une sauvegarde Voidpulse.');
  let env: { sum?: unknown; body?: unknown };
  try {
    env = JSON.parse(fromBase64(t.slice(EXPORT_PREFIX.length))) as typeof env;
  } catch {
    throw new ImportError('Sauvegarde illisible : le texte est incomplet.');
  }
  if (typeof env.body !== 'string' || env.sum !== checksum(env.body)) {
    throw new ImportError('Sauvegarde altérée : la somme de contrôle ne correspond pas.');
  }
  return normalize(JSON.parse(env.body) as unknown);
}
