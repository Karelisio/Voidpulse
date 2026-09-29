/** Versions sémantiques (SemVer 2.0) : analyse et comparaison, préversions comprises. */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  /** Identifiants de préversion (« beta », 2…) ; vide pour une version finale. */
  pre: (string | number)[];
}

const RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseSemver(text: string): SemVer | null {
  const m = RE.exec(text.trim());
  if (!m) return null;
  const pre = m[4] ? m[4].split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : [];
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre };
}

/** Négatif si a < b, 0 si égales (métadonnées de build ignorées), positif si a > b. */
export function compareSemver(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  // Une version finale passe devant ses préversions.
  if (a.pre.length === 0 || b.pre.length === 0) return b.pre.length - a.pre.length;
  const n = Math.min(a.pre.length, b.pre.length);
  for (let i = 0; i < n; i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    // Un identifiant numérique précède un identifiant alphanumérique.
    if (typeof x === 'number') return -1;
    if (typeof y === 'number') return 1;
    return x < y ? -1 : 1;
  }
  return a.pre.length - b.pre.length;
}

/** `candidate` est-elle plus récente que `installed` ? (textes invalides : non) */
export function isNewer(candidate: string, installed: string): boolean {
  const a = parseSemver(candidate);
  const b = parseSemver(installed);
  return a !== null && b !== null && compareSemver(a, b) > 0;
}
