/**
 * Migrations de sauvegarde : chaque entrée transforme la version n en n + 1. Les ajouts de
 * champs n'en ont pas besoin (valeurs par défaut à la fusion) ; seuls renommages et
 * changements de sens en ont.
 */
import { SAVE_VERSION } from './schema';

type Raw = Record<string, unknown>;

/** MIGRATIONS[n] : version n → n + 1. */
const MIGRATIONS: Record<number, (d: Raw) => Raw> = {
  // 0 → 1 : sauvegardes de développement sans numéro de version.
  0: (d) => ({ ...d, version: 1 }),
};

export function migrate(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
  let d = raw as Raw;
  let v = typeof d.version === 'number' ? d.version : 0;
  if (v > SAVE_VERSION)
    throw new Error(`Sauvegarde d'une version plus récente (${String(v)}) : mettez le jeu à jour.`);
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v] as ((d: Raw) => Raw) | undefined;
    if (!step) throw new Error(`Migration manquante depuis la version ${String(v)}`);
    d = step(d);
    v++;
    d.version = v;
  }
  return d;
}
